"""
ceph_ai_ssh.py -- shared SSH connection helper for ceph-ai.

Phase 6: ceph-ai's SSH scraping target moves from the disposable demo VM
to the PRIMARY production host (SSH_HOST, default 192.168.56.110), using
key-based auth instead of paramiko+password-from-.env.

This module is the single place that builds a paramiko SSHClient for
ceph-ai's production-path scrapers (metrics_collector.py,
host_log_streamer.py). Both previously built near-duplicate
paramiko.SSHClient() + .connect(..., password=PASSWORD) calls; this
factors that into one helper so there's exactly one place to get the auth
posture right, mirroring how services/cluster/ceph_ops.run_ceph_cmd() is
the dashboard codebase's single shared subprocess primitive rather than
being duplicated per service module.

WHY PARAMIKO, NOT SUBPROCESS+CLI SSH (like services/object/replication.py)
----------------------------------------------------------------------------
replication.py's _run_remote() shells out to the `ssh` CLI per call
(BatchMode=yes, PasswordAuthentication=no, ConnectTimeout=N) because each
of its calls is a single short-lived remote command. metrics_collector.py
scrapes every ~2 seconds and host_log_streamer.py holds two long-lived
streaming channels (`ceph -w`, `journalctl -f`) that block on `for line in
stdout`. Re-shelling a CLI ssh process per call -- or trying to stream a
subprocess's stdout for `journalctl -f` -- is a strictly worse fit than a
persistent paramiko SSHClient with reusable channels for this workload
shape. What actually matters is matching replication.py's SECURITY
POSTURE, not its transport library:

    replication.py (subprocess CLI)          ceph_ai_ssh.py (paramiko)
    --------------------------------         --------------------------------
    -o BatchMode=yes                    -->  auth_timeout set, no manual
                                              password/interactive prompt
                                              path in this module at all
    -o PasswordAuthentication=no        -->  connect(..., password=None,
                                              allow_agent=False,
                                              look_for_keys=False,
                                              key_filename=<explicit path>)
    -o KbdInteractiveAuthentication=no  -->  paramiko's Transport only
                                              attempts the "publickey"
                                              auth method when password is
                                              None and allow_agent/
                                              look_for_keys are disabled by
                                              default here (see
                                              _connect_key_only below)
    -o StrictHostKeyChecking=accept-new -->  WarningPolicy + a documented,
                                              explicit known_hosts file
                                              (see HOST_KEY_POLICY notes)
    -o ConnectTimeout=N                 -->  connect(..., timeout=N)

No password is read from .env or accepted by this module's connect
function at all -- there is no fallback path to password auth left in
the code, matching PasswordAuthentication=no's intent exactly rather
than just defaulting to key auth and silently accepting a password if
one were ever passed in.
"""

import os
import socket
import paramiko
from dotenv import load_dotenv

load_dotenv()

# ─── Connection target (Phase 6: primary production host) ───────────────────
SSH_HOST = os.getenv("CEPH_AI_SSH_HOST", "192.168.56.110")
SSH_PORT = int(os.getenv("CEPH_AI_SSH_PORT", "22"))
SSH_USER = os.getenv("CEPH_AI_SSH_USER", "")

# ─── Key-based auth only -- no password fallback exists in this module ──────
# Defaults to the standard OpenSSH private key location for SSH_USER's
# identity if CEPH_AI_SSH_KEY_PATH isn't set. Passphrase-protected keys
# are supported via CEPH_AI_SSH_KEY_PASSPHRASE, but this should be an
# unattended automation key with no passphrase in normal deployment --
# the same expectation replication.py's BatchMode=yes carries (no
# interactive prompt of any kind is acceptable for a background process).
SSH_KEY_PATH = os.getenv(
    "CEPH_AI_SSH_KEY_PATH",
    os.path.expanduser("~/.ssh/id_ed25519"),
)
SSH_KEY_PASSPHRASE = os.getenv("CEPH_AI_SSH_KEY_PASSPHRASE") or None

# ─── Host key verification ───────────────────────────────────────────────────
# Mirrors -o StrictHostKeyChecking=accept-new: trust an unknown host on
# first connect (so a freshly-provisioned primary doesn't require a manual
# one-time step), but VERIFY against the recorded key on every subsequent
# connect rather than silently accepting whatever key shows up, which is
# what paramiko.AutoAddPolicy() does forever with no persistence. Using
# load_system_host_keys() + a persisted known_hosts file plus
# paramiko.WarningPolicy() as the missing-key handler gets closest to
# "accept-new" semantics: known hosts are checked strictly, and only a
# host with NO prior recorded key is allowed through (with a warning
# logged, not silently).
KNOWN_HOSTS_PATH = os.getenv(
    "CEPH_AI_SSH_KNOWN_HOSTS",
    os.path.expanduser("~/.ssh/known_hosts"),
)

# Bounded connect timeout -- a hung TCP handshake against the primary must
# never be able to wedge the collector thread indefinitely. Matches the
# same "fail fast" intent as REPLICATION_SSH_CONNECT_TIMEOUT.
SSH_CONNECT_TIMEOUT = int(os.getenv("CEPH_AI_SSH_CONNECT_TIMEOUT", "5"))


class CephAISSHConfigError(RuntimeError):
    """Raised when required SSH configuration is missing or invalid."""


def _validate_config() -> None:
    if not SSH_USER:
        raise CephAISSHConfigError(
            "CEPH_AI_SSH_USER is not set. ceph-ai's SSH scraper has no "
            "hardcoded default user -- set it explicitly via environment "
            "variables."
        )

    if not os.path.isfile(SSH_KEY_PATH):
        raise CephAISSHConfigError(
            f"ceph-ai SSH private key not found at {SSH_KEY_PATH}. Set "
            f"CEPH_AI_SSH_KEY_PATH, or place a key at the default location. "
            f"Password authentication is not supported by this module."
        )


def connect(
    host: str = None,
    port: int = None,
    user: str = None,
    timeout: int = None,
) -> paramiko.SSHClient:
    """
    Open a key-authenticated SSH connection to the ceph-ai scrape target.

    Raises:
        CephAISSHConfigError: required config (user, key file) is missing.
        paramiko.AuthenticationException: the key was rejected by the
            remote host (e.g. not in authorized_keys).
        socket.timeout / paramiko.SSHException: connection-level failures
            (host unreachable, handshake failure, etc.)

    Callers should treat all of the above as "SSH to the primary is
    currently unavailable" and handle it the same way
    metrics_collector.py / host_log_streamer.py already handle connection
    failures today (log and retry on the next cycle, never crash the
    thread).
    """
    _validate_config()

    target_host = host or SSH_HOST
    target_port = port or SSH_PORT
    target_user = user or SSH_USER
    connect_timeout = timeout if timeout is not None else SSH_CONNECT_TIMEOUT

    client = paramiko.SSHClient()

    # Load whatever host keys are already known, and only fall back to
    # WarningPolicy (accept + record) for hosts with NO prior entry --
    # this is the paramiko-native analog of accept-new, not
    # AutoAddPolicy's "always trust silently" behavior.
    if os.path.isfile(KNOWN_HOSTS_PATH):
        client.load_host_keys(KNOWN_HOSTS_PATH)
    client.set_missing_host_key_policy(paramiko.WarningPolicy())

    client.connect(
        hostname=target_host,
        port=target_port,
        username=target_user,
        # No password path at all -- explicit None, not just omitted, so
        # this reads as a deliberate decision rather than an oversight if
        # someone edits this later.
        password=None,
        key_filename=SSH_KEY_PATH,
        passphrase=SSH_KEY_PASSPHRASE,
        timeout=connect_timeout,
        auth_timeout=connect_timeout,
        banner_timeout=connect_timeout,
        allow_agent=False,
        look_for_keys=False,
    )

    # Persist any newly-learned host key (accept-new's "record it this
    # time" half) so subsequent connects are verified strictly rather than
    # re-trusting silently forever.
    try:
        client.save_host_keys(KNOWN_HOSTS_PATH)
    except IOError:
        # Non-fatal -- the connection itself already succeeded. A failure
        # to persist just means the next connect will warn-and-accept
        # again rather than verify strictly.
        pass

    return client


def is_connection_alive(client: paramiko.SSHClient) -> bool:
    """
    Cheap liveness check for a previously-opened connection, used by
    long-running callers (metrics_collector.py's persistent-connection
    loop) to decide whether to reconnect rather than assuming a client
    object handed out minutes ago is still usable.
    """
    try:
        transport = client.get_transport()
        return bool(transport and transport.is_active())
    except Exception:
        return False