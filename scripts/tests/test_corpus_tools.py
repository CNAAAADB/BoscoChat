import hashlib
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


fetcher = load('fetch_dbe_test_corpus', 'scripts/fetch-dbe-test-corpus.py')
indexer = load('index_dbe_test_corpus', 'scripts/index-dbe-test-corpus.py')


class FakeResponse:
    def __init__(self, body, url='https://confedebosco.es/issue.pdf'):
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


class CorpusToolTests(unittest.TestCase):
    def item(self, body):
        return {
            'issue': '766',
            'source_url': 'https://confedebosco.es/issue.pdf',
            'license_status': fetcher.AUTHORIZED_STATUS,
            'sha256': hashlib.sha256(body).hexdigest(),
        }

    def test_source_and_final_redirect_hosts_are_allowlisted(self):
        self.assertEqual(fetcher.validate_source_url('https://confedebosco.es/a.pdf'), 'https://confedebosco.es/a.pdf')
        for url in ('http://confedebosco.es/a.pdf', 'https://evil.example/a.pdf',
                    'https://confedebosco.es.evil.example/a.pdf'):
            with self.assertRaises(ValueError):
                fetcher.validate_source_url(url)

    def test_download_is_atomic_and_checksum_verified(self):
        body = b'%PDF-1.7\nowner-authorized-test'
        with tempfile.TemporaryDirectory() as directory:
            original = fetcher.OUT
            fetcher.OUT = Path(directory)
            try:
                target, size = fetcher.fetch_one(self.item(body), opener=lambda *_args, **_kwargs: FakeResponse(body))
                self.assertEqual(size, len(body))
                self.assertEqual(target.read_bytes(), body)
                self.assertFalse(target.with_suffix('.pdf.part').exists())
            finally:
                fetcher.OUT = original

    def test_redirect_to_untrusted_host_is_rejected_and_removed(self):
        body = b'%PDF-1.7\ncontent'
        with tempfile.TemporaryDirectory() as directory:
            original = fetcher.OUT
            fetcher.OUT = Path(directory)
            try:
                with self.assertRaises(ValueError):
                    fetcher.fetch_one(
                        self.item(body),
                        opener=lambda *_args, **_kwargs: FakeResponse(body, 'https://evil.example/issue.pdf'),
                    )
                self.assertEqual(list(Path(directory).iterdir()), [])
            finally:
                fetcher.OUT = original

    def test_fetch_command_returns_nonzero_when_any_download_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            catalog = Path(directory) / 'catalog.csv'
            catalog.write_text(
                'issue,source_url,license_status,sha256\n'
                f'766,https://confedebosco.es/issue.pdf,{fetcher.AUTHORIZED_STATUS},{"0" * 64}\n',
                encoding='utf-8',
            )
            original_catalog, original_out = fetcher.CATALOG, fetcher.OUT
            original_fetch, original_argv = fetcher.fetch_one, sys.argv
            fetcher.CATALOG, fetcher.OUT = catalog, Path(directory) / 'pdfs'
            fetcher.fetch_one = lambda _item: (_ for _ in ()).throw(ValueError('expected failure'))
            sys.argv = ['fetch-dbe-test-corpus.py', '--authorized']
            try:
                self.assertEqual(fetcher.main(), 1)
            finally:
                fetcher.CATALOG, fetcher.OUT = original_catalog, original_out
                fetcher.fetch_one, sys.argv = original_fetch, original_argv

    def test_indexer_rejects_checksum_mismatch(self):
        with tempfile.TemporaryDirectory() as directory:
            pdf = Path(directory) / 'issue.pdf'
            pdf.write_bytes(b'%PDF-1.7\ncontent')
            with self.assertRaisesRegex(ValueError, 'Unverified PDF checksum'):
                indexer.verify_pdf({'sha256': '0' * 64}, pdf)


if __name__ == '__main__':
    unittest.main()
