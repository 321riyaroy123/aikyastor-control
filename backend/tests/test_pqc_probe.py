"""
Tests for services/security/pqc_probe.py.

Run from the backend/ directory:  python -m pytest tests/test_pqc_probe.py
"""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("APP_MODE", "simulation")

from services.security import pqc_probe  # noqa: E402


# Representative `openssl s_client -brief` outputs.
OUT_MLKEM_35 = """Connecting to 127.0.0.1
CONNECTION ESTABLISHED
Protocol version: TLSv1.3
Ciphersuite: TLS_AES_256_GCM_SHA384
Peer certificate: CN=127.0.0.1
Hash used: SHA256
Signature type: rsa_pss_rsae_sha256
Verification error: self-signed certificate
Negotiated TLS1.3 group: X25519MLKEM768
DONE
"""

OUT_X25519 = """CONNECTION ESTABLISHED
Protocol version: TLSv1.3
Ciphersuite: TLS_AES_256_GCM_SHA384
Peer certificate: CN=127.0.0.1
Server Temp Key: X25519, 253 bits
DONE
"""

OUT_P256 = """CONNECTION ESTABLISHED
Protocol version: TLSv1.2
Ciphersuite: ECDHE-RSA-AES256-GCM-SHA384
Server Temp Key: ECDH, prime256v1, 256 bits
"""

OUT_CLIENT_UNSUPPORTED = """Error with command: "-groups X25519MLKEM768"
40C7A1B2:error:0A080106:SSL routines:gid_cb:passed invalid argument:ssl/t1_lib.c:1150:group 'X25519MLKEM768' cannot be set
"""

OUT_REJECTED = """40F7C2D3:error:0A000410:SSL routines:ssl3_read_bytes:ssl/tls alert handshake failure:ssl/record/rec_layer_s3.c:865:SSL alert number 40
"""

OUT_REFUSED = """40A1:error:8000274D:system library:BIO_connect:No connection could be made:crypto/bio/bio_sock2.c:178:
connect:errno=10061
"""

TLS_OK = {"reachable": True, "tls_version": "TLSv1.3", "cipher_suite": "TLS_AES_256_GCM_SHA384",
          "cipher_bits": 256, "group": None, "group_family": None, "group_detectable": False,
          "connect_and_handshake_ms": 5.0, "error": None}
TLS_DOWN = {**TLS_OK, "reachable": False, "tls_version": None, "cipher_suite": None,
            "cipher_bits": None, "error": "[WinError 10061] refused"}


def attempt(text, rc=0):
    return pqc_probe.classify_s_client_result(rc, text)


class ClassifyGroupTests(unittest.TestCase):
    def test_families(self):
        self.assertEqual(pqc_probe.classify_group("X25519MLKEM768"), "ml-kem")
        self.assertEqual(pqc_probe.classify_group("SecP256r1MLKEM768"), "ml-kem")
        self.assertEqual(pqc_probe.classify_group("x25519_mlkem768"), "ml-kem")
        self.assertEqual(pqc_probe.classify_group("MLKEM1024"), "ml-kem")
        self.assertEqual(pqc_probe.classify_group("x25519_kyber768"), "kyber-draft")
        self.assertEqual(pqc_probe.classify_group("X25519"), "classical")
        self.assertIsNone(pqc_probe.classify_group(None))

    def test_kyber_draft_is_not_counted_as_pqc_verified(self):
        self.assertFalse(pqc_probe.is_pqc_group("X25519Kyber768Draft00"))


class ParseTests(unittest.TestCase):
    def test_mlkem(self):
        a = attempt(OUT_MLKEM_35)
        self.assertEqual(a["outcome"], "established")
        self.assertEqual(a["group"], "X25519MLKEM768")
        self.assertEqual(a["protocol"], "TLSv1.3")
        self.assertEqual(a["group_family"], "ml-kem")

    def test_classical_x25519(self):
        a = attempt(OUT_X25519)
        self.assertEqual(a["group"], "X25519")
        self.assertEqual(a["group_family"], "classical")

    def test_ecdh_named_curve(self):
        self.assertEqual(attempt(OUT_P256)["group"], "prime256v1")

    def test_client_unsupported(self):
        self.assertEqual(attempt(OUT_CLIENT_UNSUPPORTED, 1)["outcome"], "client_unsupported")

    def test_rejected(self):
        self.assertEqual(attempt(OUT_REJECTED, 1)["outcome"], "rejected")

    def test_unreachable(self):
        self.assertEqual(attempt(OUT_REFUSED, 1)["outcome"], "unreachable")


class DeriveStatusTests(unittest.TestCase):
    def derive(self, tls, pqc_only_text, preferred_text):
        return pqc_probe._derive_status(tls, attempt(pqc_only_text), attempt(preferred_text))

    def test_tls13_with_classical_group_is_not_pqc(self):
        """The core regression: TLS 1.3 alone must never mean PQC."""
        status, _, group = self.derive(TLS_OK, OUT_REJECTED, OUT_X25519)
        self.assertEqual(status, "not_negotiated")
        self.assertEqual(group, "X25519")

    def test_mlkem_negotiated(self):
        status, _, group = self.derive(TLS_OK, OUT_MLKEM_35, OUT_MLKEM_35)
        self.assertEqual(status, "pqc_verified")
        self.assertEqual(group, "X25519MLKEM768")

    def test_supported_but_not_preferred(self):
        status, reason, group = self.derive(TLS_OK, OUT_MLKEM_35, OUT_X25519)
        self.assertEqual(status, "not_negotiated")
        self.assertIn("supports", reason)

    def test_pqc_only_success_without_printed_group(self):
        no_group = OUT_X25519.replace("Server Temp Key: X25519, 253 bits\n", "")
        status, _, group = self.derive(TLS_OK, no_group, OUT_CLIENT_UNSUPPORTED)
        self.assertEqual(status, "pqc_verified")
        self.assertEqual(group, "X25519MLKEM768")

    def test_client_cannot_offer_mlkem_is_unverified(self):
        status, _, group = self.derive(TLS_OK, OUT_CLIENT_UNSUPPORTED, OUT_CLIENT_UNSUPPORTED)
        self.assertEqual(status, "unverified")
        self.assertIsNone(group)

    def test_unreachable(self):
        status, _, _ = self.derive(TLS_DOWN, OUT_REFUSED, OUT_REFUSED)
        self.assertEqual(status, "unreachable")

    def test_unreachable_with_incapable_client(self):
        status, _, _ = self.derive(TLS_DOWN, OUT_CLIENT_UNSUPPORTED, OUT_CLIENT_UNSUPPORTED)
        self.assertEqual(status, "unreachable")


class TransitProbeTests(unittest.TestCase):
    def setUp(self):
        pqc_probe._cache.update({"result": None, "at": 0.0})

    def _probe(self, s_client_outputs, tls=TLS_OK):
        results = iter(s_client_outputs)

        def fake_run(cmd, **kwargs):
            if cmd[1] == "version":
                return mock.Mock(returncode=0, stdout="OpenSSL 3.5.0", stderr="")
            text, rc = next(results)
            return mock.Mock(returncode=rc, stdout="", stderr=text)

        with mock.patch.object(pqc_probe, "_python_tls_handshake", return_value=tls), \
                mock.patch.object(pqc_probe.subprocess, "run", side_effect=fake_run):
            return pqc_probe.get_transit_status(block=True, force=True)

    def test_full_result_shape_for_classical_rgw(self):
        r = self._probe([(OUT_REJECTED, 1), (OUT_X25519, 0)])
        self.assertEqual(r["status"], "not_negotiated")
        self.assertIs(r["pqc_verified"], False)
        self.assertEqual(r["rgw_tls"]["tls_version"], "TLSv1.3")
        self.assertEqual(r["negotiated_group"], "X25519")
        self.assertNotIn("quantum_safe", r)

    def test_verified_result(self):
        r = self._probe([(OUT_MLKEM_35, 0), (OUT_MLKEM_35, 0)])
        self.assertIs(r["pqc_verified"], True)
        self.assertEqual(r["negotiated_group_family"], "ml-kem")

    def test_result_is_cached(self):
        self._probe([(OUT_MLKEM_35, 0), (OUT_MLKEM_35, 0)])
        again = pqc_probe.get_transit_status(block=True)
        self.assertTrue(again["cached"])

    def test_plaintext_paths_are_never_pqc(self):
        r = self._probe([(OUT_MLKEM_35, 0), (OUT_MLKEM_35, 0)])
        for conn in r["connections"]:
            if conn["transport"] == "plaintext":
                self.assertIs(conn["pqc"], False)

    def test_dashboard_summary_pending_without_cache(self):
        self.assertEqual(pqc_probe.summarize_for_dashboard(None)["pending"], True)


if __name__ == "__main__":
    unittest.main()
