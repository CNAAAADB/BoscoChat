#!/usr/bin/env python3
"""Hash owner-authorized DBE originals without retaining or publishing them."""
import argparse
import csv
import hashlib
import re
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'data/test-corpus/dbe-public-sources.csv'
ALLOWED_HOSTS = frozenset({'confedebosco.es', 'www.confedebosco.es'})
AUTHORIZED_STATUS = 'owner_authorized_product_testing_private_only'
MAX_BYTES = 30 * 1024 * 1024
CHUNK_BYTES = 64 * 1024
SHA256_PATTERN = re.compile(r'^[0-9a-f]{64}$')


def validate_url(value):
    parsed = urlparse(value)
    host = (parsed.hostname or '').lower().rstrip('.')
    if parsed.scheme != 'https' or host not in ALLOWED_HOSTS or parsed.username or parsed.password:
        raise ValueError('Source and final redirect must use an allowlisted Confederation HTTPS host')
    return value


def hash_source(row, opener=urlopen):
    if row.get('license_status') != AUTHORIZED_STATUS:
        raise ValueError('Catalog entry is not authorized for private product testing')
    validate_url(row['source_url'])
    request = Request(row['source_url'], headers={'User-Agent': 'BoscoChat-source-hash/1.0'})
    digest = hashlib.sha256()
    size = 0
    with opener(request, timeout=45) as response:
        validate_url(response.geturl())
        content_type = response.headers.get('Content-Type', '').split(';', 1)[0].strip().lower()
        if response.status != 200 or content_type != 'application/pdf':
            raise ValueError('Unexpected HTTP status or content type')
        declared = response.headers.get('Content-Length')
        if declared and int(declared) > MAX_BYTES:
            raise ValueError('Declared PDF size exceeds the 30 MiB limit')
        first = True
        while chunk := response.read(CHUNK_BYTES):
            if first and not chunk.startswith(b'%PDF-'):
                raise ValueError('Response does not start with a PDF header')
            first = False
            size += len(chunk)
            if size > MAX_BYTES:
                raise ValueError('PDF exceeds the 30 MiB limit')
            digest.update(chunk)
    if size == 0:
        raise ValueError('Empty PDF response')
    return digest.hexdigest(), size


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--authorized', action='store_true', help='Confirm approved private product-test use')
    args = parser.parse_args()
    if not args.authorized:
        parser.error('Confirm authorized private product-test use with --authorized')
    missing = False
    failures = 0
    with CATALOG.open(newline='', encoding='utf-8') as source:
        for row in csv.DictReader(source):
            try:
                actual, size = hash_source(row)
                expected = row.get('sha256', '').strip().lower()
                print(f'issue={row["issue"]} sha256={actual} bytes={size}', flush=True)
                if not SHA256_PATTERN.fullmatch(expected):
                    missing = True
                    print(f'issue={row["issue"]} catalog_sha256=MISSING', flush=True)
                elif expected != actual:
                    failures += 1
                    print(f'issue={row["issue"]} catalog_sha256=MISMATCH', flush=True)
            except Exception as error:
                failures += 1
                print(f'issue={row.get("issue", "unknown")} error={error}', flush=True)
    if failures:
        return 1
    return 2 if missing else 0


if __name__ == '__main__':
    raise SystemExit(main())
