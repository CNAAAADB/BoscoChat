#!/usr/bin/env python3
"""Download owner-authorized DBE issues into a private, ignored test folder.

The catalog must contain an approved SHA-256 for every PDF. Redirects are
accepted only when their final HTTPS host remains on the Confederation allowlist.
"""
import argparse
import csv
import hashlib
import re
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'data/test-corpus/dbe-public-sources.csv'
OUT = ROOT / 'data/test-corpus/local-pdfs'
ALLOWED_HOSTS = frozenset({'confedebosco.es', 'www.confedebosco.es'})
MAX_BYTES = 30 * 1024 * 1024
CHUNK_BYTES = 64 * 1024
SHA256_PATTERN = re.compile(r'^[0-9a-f]{64}$')
AUTHORIZED_STATUS = 'owner_authorized_product_testing_private_only'


def validate_source_url(value):
    parsed = urlparse(value)
    host = (parsed.hostname or '').lower().rstrip('.')
    if parsed.scheme != 'https' or host not in ALLOWED_HOSTS or parsed.username or parsed.password:
        raise ValueError('Source and final redirect must use an allowlisted Confederation HTTPS host')
    return value


def validate_catalog_item(item):
    validate_source_url(item['source_url'])
    if item.get('license_status') != AUTHORIZED_STATUS:
        raise ValueError('Catalog entry is not authorized for private product testing')
    expected = item.get('sha256', '').strip().lower()
    if not SHA256_PATTERN.fullmatch(expected):
        raise ValueError('Catalog entry requires a verified 64-character SHA-256')
    return expected


def fetch_one(item, opener=urlopen):
    expected = validate_catalog_item(item)
    target = OUT / f'dbe-{int(item["issue"])}.pdf'
    temporary = target.with_suffix('.pdf.part')
    temporary.unlink(missing_ok=True)
    request = Request(item['source_url'], headers={'User-Agent': 'BoscoChat-test-corpus/2.0'})
    digest = hashlib.sha256()
    size = 0
    try:
        with opener(request, timeout=45) as response:
            validate_source_url(response.geturl())
            content_type = response.headers.get('Content-Type', '').split(';', 1)[0].strip().lower()
            if response.status != 200 or content_type != 'application/pdf':
                raise ValueError('Unexpected HTTP status or content type')
            declared = response.headers.get('Content-Length')
            if declared and int(declared) > MAX_BYTES:
                raise ValueError('Declared PDF size exceeds the 30 MiB limit')
            with temporary.open('wb') as output:
                first = True
                while chunk := response.read(CHUNK_BYTES):
                    if first and not chunk.startswith(b'%PDF-'):
                        raise ValueError('Response does not start with a PDF header')
                    first = False
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise ValueError('PDF exceeds the 30 MiB limit')
                    digest.update(chunk)
                    output.write(chunk)
        if size == 0 or digest.hexdigest() != expected:
            raise ValueError(f'SHA-256 mismatch (received {digest.hexdigest()})')
        temporary.replace(target)
        return target, size
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--authorized', action='store_true', help='Confirm approved private product-test use')
    args = parser.parse_args()
    if not args.authorized:
        parser.error('Confirm authorized private product-test use with --authorized')
    OUT.mkdir(parents=True, exist_ok=True)
    failures = 0
    with CATALOG.open(newline='', encoding='utf-8') as source:
        for item in csv.DictReader(source):
            try:
                target, size = fetch_one(item)
                print(f'verified {target.name}: {size} bytes')
            except Exception as exc:
                failures += 1
                print(f'failed {item.get("issue", "unknown")}: {exc}')
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
