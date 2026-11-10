import hashlib
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    'hash_dbe_authorized_sources',
    ROOT / 'scripts/hash-dbe-authorized-sources.py',
)
HASHER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HASHER)


class FakeResponse:
    def __init__(self, body, url='https://confedebosco.es/original.pdf'):
        self.body = body
        self.url = url
        self.status = 200
        self.headers = {'Content-Type': 'application/pdf', 'Content-Length': str(len(body))}
        self.offset = 0

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def geturl(self):
        return self.url

    def read(self, size):
        chunk = self.body[self.offset:self.offset + size]
        self.offset += len(chunk)
        return chunk


class SourceHashTests(unittest.TestCase):
    def row(self):
        return {
            'issue': '766',
            'source_url': 'https://confedebosco.es/original.pdf',
            'license_status': HASHER.AUTHORIZED_STATUS,
            'sha256': '',
        }

    def test_hashes_the_exact_received_bytes_without_writing_a_file(self):
        body = b'%PDF-1.7\nexact-original-bytes'
        actual, size = HASHER.hash_source(
            self.row(),
            opener=lambda *_args, **_kwargs: FakeResponse(body),
        )
        self.assertEqual(actual, hashlib.sha256(body).hexdigest())
        self.assertEqual(size, len(body))

    def test_rejects_untrusted_final_redirect(self):
        body = b'%PDF-1.7\ncontent'
        with self.assertRaises(ValueError):
            HASHER.hash_source(
                self.row(),
                opener=lambda *_args, **_kwargs: FakeResponse(body, 'https://evil.example/original.pdf'),
            )

    def test_rejects_non_pdf_bytes(self):
        body = b'not-a-pdf'
        with self.assertRaises(ValueError):
            HASHER.hash_source(
                self.row(),
                opener=lambda *_args, **_kwargs: FakeResponse(body),
            )


if __name__ == '__main__':
    unittest.main()
