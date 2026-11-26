"""BC-110 regression coverage for boto3 StreamingBody JSONL imports."""
import importlib.util
import io
from pathlib import Path
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


if __name__ == "__main__":
    unittest.main()
