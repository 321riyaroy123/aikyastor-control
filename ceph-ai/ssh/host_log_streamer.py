import os
import sys
import re
import threading
import json
import time
import sqlite3
from datetime import datetime
import paramiko
from dotenv import load_dotenv

import ceph_ai_ssh  # Phase 6: key-based auth against the primary host

# Load configuration from .env file
load_dotenv()

HOST = ceph_ai_ssh.SSH_HOST
PORT = ceph_ai_ssh.SSH_PORT
USER = ceph_ai_ssh.SSH_USER

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv("DB_PATH", os.path.join(ROOT_DIR, "ceph_monitor.db"))

# Print lock to prevent interleaved stdout writes from multiple threads
print_lock = threading.Lock()

# Regex patterns for log parsing
CEPH_EVENT_PATTERN = re.compile(
    r'^(\S+)\s+(\S+)\s+(?:\(\S+\)\s+)?\d+\s+:\s+\S+\s+\[([A-Z]+)\]\s+(.*)$'
)
JOURNAL_PATTERN = re.compile(
    r'^([A-Z][a-z]{2}\s+\d+\s+\d+:\d+:\d+)\s+(\S+)\s+([^:\[]+)(?:\[(\d+)\])?:\s+(.*)$'
)

def format_output(source, timestamp, severity, component, message, raw_line):
    """Prints a unified JSON line representation of the log and saves it to SQLite."""
    ts = timestamp or datetime.utcnow().isoformat() + "Z"
    sev = severity or "INFO"
    comp = component or "unknown"
    msg = message or raw_line.strip()
    
    log_data = {
        "timestamp": ts,
        "source": source,
        "severity": sev,
        "component": comp,
        "message": msg
    }
    with print_lock:
        print(json.dumps(log_data), flush=True)
        
    # Write to database
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO events_log (timestamp, source, severity, component, message, raw_line) VALUES (?, ?, ?, ?, ?, ?)",
            (ts, source, sev, comp, msg, raw_line.strip())
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Database write error in streamer: {e}", file=sys.stderr)

def handle_ssh_sudo_command(client, command, line_handler):
    """
    Executes a command via SSH and streams output lines.
    """
    try:
        stdin, stdout, stderr = client.exec_command(command)
        stdin.close()  # No password to send; close stdin so a
                        # misconfigured remote sudo prompt fails fast
                        # (EOF on stdin) instead of hanging forever.

        for line in stdout:
            if "[sudo] password for" in line:
                with print_lock:
                    print(
                        "[host_log_streamer] Remote sudo is prompting for "
                        "a password -- configure NOPASSWD sudo for the "
                        "ceph-ai SSH user on the primary host. Skipping "
                        "this line.",
                        file=sys.stderr,
                    )
                continue
            line_handler(line)

        err_content = stderr.read().decode('utf-8', errors='ignore')
        if err_content and "[sudo] password for" not in err_content:
            with print_lock:
                print(f"Error in command '{command}': {err_content.strip()}", file=sys.stderr)

    except Exception as e:
        with print_lock:
            print(f"Exception running '{command}': {e}", file=sys.stderr)

def parse_ceph_event(line):
    """Parses lines from 'ceph -w'."""
    raw = line.strip()
    if not raw:
        return
        
    match = CEPH_EVENT_PATTERN.match(raw)
    if match:
        timestamp, component, severity, msg = match.groups()
        format_output(
            source="ceph-cluster",
            timestamp=timestamp,
            severity=severity,
            component=component,
            message=msg,
            raw_line=raw
        )
    else:
        # Fallback if log format is slightly different
        format_output(
            source="ceph-cluster",
            timestamp=None,
            severity="INFO",
            component="cluster-event",
            message=raw,
            raw_line=raw
        )

def parse_journal_event(line):
    """Parses lines from 'journalctl -f'."""
    raw = line.strip()
    if not raw:
        return
        
    match = JOURNAL_PATTERN.match(raw)
    if match:
        time_str, hostname, service, pid, msg = match.groups()
        
        # Convert syslog style date (e.g. 'Jul 19 12:00:00') to ISO format for AI parser consistency
        try:
            parsed_time = datetime.strptime(time_str, "%b %d %H:%M:%S")
            # Assume current year since journalctl logs don't output year by default
            current_year = datetime.now().year
            parsed_time = parsed_time.replace(year=current_year)
            iso_time = parsed_time.isoformat() + "Z"
        except ValueError:
            iso_time = None
            
        # Determine severity based on common daemon log keywords
        severity = "INFO"
        lower_msg = msg.lower()
        if "err" in lower_msg or "fail" in lower_msg or "crit" in lower_msg:
            severity = "ERROR"
        elif "warn" in lower_msg:
            severity = "WARNING"
            
        format_output(
            source="ceph-daemon",
            timestamp=iso_time,
            severity=severity,
            component=service,
            message=msg,
            raw_line=raw
        )
    else:
        # Fallback
        format_output(
            source="ceph-daemon",
            timestamp=None,
            severity="INFO",
            component="systemd-journal",
            message=raw,
            raw_line=raw
        )

def main():
    print(f"Connecting to Ceph primary host at {ceph_ai_ssh.SSH_HOST}:{ceph_ai_ssh.SSH_PORT} as user '{ceph_ai_ssh.SSH_USER}' (key-based auth)...", file=sys.stderr)

    try:
        client = ceph_ai_ssh.connect()
        print("Connected successfully! Starting log streaming threads...", file=sys.stderr)

        client_event = ceph_ai_ssh.connect()
        client_journal = ceph_ai_ssh.connect()

        cmd_ceph_event = "sudo -S ceph -w"
        cmd_journal = "sudo -S journalctl -f -u 'ceph-*'"

        # Spawn daemon threads for log streams
        t1 = threading.Thread(
            target=handle_ssh_sudo_command,
            args=(client_event, cmd_ceph_event, parse_ceph_event),
            daemon=True
        )
        t2 = threading.Thread(
            target=handle_ssh_sudo_command,
            args=(client_journal, cmd_journal, parse_journal_event),
            daemon=True
        )

        t1.start()
        t2.start()

        # Main thread loop
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\nStopping log streaming client...", file=sys.stderr)
    except ceph_ai_ssh.CephAISSHConfigError as e:
        print(f"SSH configuration error: {e}", file=sys.stderr)
    except Exception as e:
        print(f"SSH Connection failed: {e}", file=sys.stderr)
    finally:
        try:
            client.close()
        except Exception:
            pass
        print("SSH Connection closed.", file=sys.stderr)

if __name__ == "__main__":
    main()