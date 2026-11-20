import importlib.util
import io
import os
from pathlib import Path
import stat
import struct
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("tiff_ocr", Path(__file__).with_name("tiff-ocr.py"))
ocr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ocr)


def make_tiff(multipage=False):
    head = b"II*\x00" + struct.pack("<I", 8)
    tags = (struct.pack("<HHII", 256, 4, 1, 100)
            + struct.pack("<HHII", 257, 4, 1, 150))
    return head + struct.pack("<H", 2) + tags + struct.pack("<I", 8 if multipage else 0)


def make_zip(path, files):
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for filename, data in files:
            archive.writestr(filename, data)


class TestTiffOcr(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = os.path.join(self.tmp.name, "pages.zip")

    def test_natural_order_and_original_file_names(self):
        make_zip(self.path, [("2.tif", make_tiff()), ("10.tif", make_tiff()),
                             ("9.tif", make_tiff()), ("8.tif", make_tiff()),
                             ("7.tif", make_tiff()), ("6.tif", make_tiff()),
                             ("5.tif", make_tiff()), ("4.tif", make_tiff()),
                             ("3.tif", make_tiff())])
        order = [name for name, _ in ocr.inspect_zip(self.path)]
        self.assertEqual(order, [f"{i}.tif" for i in range(2, 11)])

    def test_multiple_issues_in_folders_preserve_sequence(self):
        make_zip(self.path, [("02 Febrero/0002.tiff", make_tiff()),
                             ("01 Enero/0001.tif", make_tiff()),
                             ("02 Febrero/0001.tiff", make_tiff())])
        names = [name for name, _ in ocr.inspect_zip(self.path)]
        self.assertEqual(names, ["01 Enero/0001.tif", "02 Febrero/0001.tiff",
                                 "02 Febrero/0002.tiff"])

    def test_multiple_issues_without_numbered_folders_are_ambiguous(self):
        make_zip(self.path, [("Febrero/0001.tif", make_tiff()),
                             ("Enero/0001.tif", make_tiff())])
        with self.assertRaises(ocr.RejectedImport) as error:
            ocr.inspect_zip(self.path)
        self.assertEqual(error.exception.code, "AMBIGUOUS_ISSUE_ORDER")

    def test_archive_rejects_ambiguous_missing_and_unsafe_files(self):
        cases = [
            ([("1.tif", make_tiff()), ("3.tif", make_tiff())], "MISSING_PAGE_NUMBER"),
            ([("page.tif", make_tiff())], "AMBIGUOUS_PAGE_ORDER"),
            ([("1.tif", make_tiff()), ("1.TIFF", make_tiff())], "DUPLICATE_PAGE_NUMBER"),
            ([("../1.tif", make_tiff())], "UNSAFE_ZIP_ENTRY"),
            ([("a\\1.tif", make_tiff())], "UNSAFE_ZIP_ENTRY"),
            ([("1.tif", make_tiff()), ("script.exe", b"bin")], "NON_TIFF_IN_ZIP"),
            ([("1.tif", make_tiff())] * 2, "DUPLICATE_ZIP_ENTRY"),
        ]
        for files, code in cases:
            with self.subTest(code=code):
                make_zip(self.path, files)
                with self.assertRaises(ocr.RejectedImport) as error:
                    ocr.inspect_zip(self.path)
                self.assertEqual(error.exception.code, code)

    def test_symlink_rejected(self):
        link = zipfile.ZipInfo("0001.tif")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        with zipfile.ZipFile(self.path, "w") as archive:
            archive.writestr(link, "target")
        with self.assertRaises(ocr.RejectedImport) as error:
            ocr.inspect_zip(self.path)
        self.assertEqual(error.exception.code, "UNSAFE_ZIP_ENTRY")

    def test_tiff_rejects_multipage_and_forged_dimensions(self):
        self.assertEqual(ocr.check_single_page_tiff(make_tiff()), (100, 150))
        with self.assertRaises(ocr.RejectedImport) as err:
            ocr.check_single_page_tiff(make_tiff(multipage=True))
        self.assertEqual(err.exception.code, "MULTIPAGE_TIFF_NOT_SUPPORTED")
        with self.assertRaises(ocr.RejectedImport) as err:
            ocr.check_single_page_tiff(b"not really an image")
        self.assertEqual(err.exception.code, "INVALID_TIFF")

    def test_review_is_non_publishing_and_exposes_evidence_hints(self):
        make_zip(self.path, [("0001.tif", make_tiff())])
        class FakeTextract:
            def detect_document_text(self, Document):
                self_data = Document["Bytes"]
                self.test_data = self_data
                return {"DocumentMetadata": {"Pages": 1}, "Blocks": [
                    {"BlockType": "LINE", "Text": "Don Bosco en España enero 1954",
                     "Confidence": 97.2, "Geometry": {"BoundingBox": {"Left": 0.1, "Top": 0.2, "Width": 0.7, "Height": 0.04}}},
                    {"BlockType": "LINE", "Text": "La Asociación de Cádiz",
                     "Confidence": 91.4, "Geometry": {"BoundingBox": {"Left": 0.1, "Top": 0.3, "Width": 0.7, "Height": 0.04}}},
                ]}
        review = ocr.build_review(self.path, FakeTextract())
        self.assertEqual(review["status"], "ocr_complete_review_required")
        self.assertFalse(review["publishable"])
        self.assertFalse(review["indexed"])
        self.assertTrue(review["requiresHumanReview"])
        self.assertEqual(review["pageCount"], 1)
        self.assertEqual(review["pages"][0]["sourceFilename"], "0001.tif")
        self.assertEqual(review["hints"][0]["yearsMentioned"], ["1954"])
        self.assertEqual(review["hints"][0]["monthsMentioned"], ["enero"])
        self.assertEqual(review["pages"][0]["confidence"], 94.3)
        self.assertFalse(review["pages"][0]["needsReview"])


if __name__ == "__main__":
    unittest.main()
