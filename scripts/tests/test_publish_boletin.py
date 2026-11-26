"""BC-110 regression coverage for boto3 StreamingBody JSONL imports."""
import importlib.util
import io
import hashlib
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import Mock
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "publish_boletin.py"
spec = importlib.util.spec_from_file_location("publish_boletin", SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class S3ResponseBody(io.BytesIO):
    """Boto3-compatible body: read() is available, iter_lines() is not."""


class PublishBoletinTests(unittest.TestCase):
    def test_inventory_reads_jsonl_without_requests_iter_lines(self):
        rows = [
            b'{"member":"1886/188610_N001.pdf","disposition":"validated"}',
            b'',
            b'{"member":"1886/188611_N002.pdf","disposition":"review"}',
        ]
        body = S3ResponseBody(b"\n".join(rows))
        self.assertEqual([x["disposition"] for x in mod.read_inventory_rows(body)],
                         ["validated", "review"])

    def test_inventory_bounded_before_parsing(self):
        with self.assertRaisesRegex(ValueError, "safe size limit"):
            list(mod.read_inventory_rows(S3ResponseBody(b"x" * (mod.MAX_INVENTORY_BYTES + 1))))

    def test_catalogue_only_accepts_recognizable_month_and_issue(self):
        row = {"member": "1886/188610_N001.pdf", "year": 1886, "month": 10, "number": 1}
        self.assertEqual(mod.catalogue(row),
                         ("originals/Boletin Salesiano 188610 N001.pdf", 1886))
        row["month"] = 11
        with self.assertRaisesRegex(ValueError, "Inconsistent"):
            mod.catalogue(row)


    def test_index_request_uses_auto_catalogue_for_regular_issues(self):
        row = {"disposition": "review"}
        payload = mod.index_payload("originals/Boletin Salesiano 188610 N001.pdf", 1886, row)
        self.assertEqual(payload, {
            "action": "index-archive-pdf",
            "key": "originals/Boletin Salesiano 188610 N001.pdf",
        })

    def test_metadata_review_requires_explicit_manual_catalogue(self):
        payload = mod.index_payload("originals/Boletin Salesiano 1898 - 189800_N000.pdf",
                                    1898, {"disposition": "metadata_review"})
        self.assertEqual(payload["catalog"], {"publication": "Boletín Salesiano", "year": 1898})

    def test_upload_only_never_invokes_lambda_or_claims_indexed(self):
        data = b"%PDF-1.7\npartial source"
        digest = hashlib.sha256(data).hexdigest()
        row = {"member": "1886/188610_N001.pdf", "bytes": len(data),
               "crc_ok": True, "sha256": digest, "year": 1886, "month": 10, "number": 1,
               "disposition": "validated", "pages": 3, "review_pages": []}
        archive = Mock()
        archive.getinfo.return_value = SimpleNamespace(file_size=len(data))
        archive.read.return_value = data
        s3 = Mock()
        worker = Mock()
        result = mod.publish(s3, worker, archive, row, upload_only=True)
        self.assertEqual(result["indexing"], "unverified")
        self.assertTrue(result["stored"])
        worker.invoke.assert_not_called()
        self.assertEqual(s3.put_object.call_args.kwargs["IfNoneMatch"], "*")


if __name__ == "__main__":
    unittest.main()
