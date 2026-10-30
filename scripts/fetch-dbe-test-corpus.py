#!/usr/bin/env python3
"""Fetch public Don Bosco en España issues into a LOCAL, non-versioned test folder.

Usage: python3 scripts/fetch-dbe-test-corpus.py --authorized
This script does not upload PDFs or enable public serving. Obtain permission
before redistributing, hosting, or importing them to any shared environment.
"""
import argparse
import csv
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'data/test-corpus/dbe-public-sources.csv'
OUT = ROOT / 'data/test-corpus/local-pdfs'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--authorized', action='store_true', help='Confirm permission for intended local test use')
    args = parser.parse_args()
    if not args.authorized:
        parser.error('Confirm authorized local test use with --authorized')
    OUT.mkdir(parents=True, exist_ok=True)
    with CATALOG.open(newline='', encoding='utf-8') as fh:
        for item in csv.DictReader(fh):
            target = OUT / f'dbe-{int(item["issue"])}.pdf'
            if target.exists():
                print(f'already exists: {target}')
                continue
            req = Request(item['source_url'], headers={'User-Agent': 'BoscoChat-test-corpus/1.0'})
            try:
                with urlopen(req, timeout=45) as response:
                    if response.status != 200 or 'pdf' not in response.headers.get('Content-Type', '').lower():
                        raise ValueError('Unexpected HTTP response or content type')
                    body = response.read(30 * 1024 * 1024 + 1)
                if len(body) > 30 * 1024 * 1024 or not body.startswith(b'%PDF-'):
                    raise ValueError('Not a valid bounded PDF download')
                target.write_bytes(body)
                print(f'downloaded {target.name}: {len(body)} bytes')
            except Exception as exc:
                target.unlink(missing_ok=True)
                print(f'failed {item["issue"]}: {exc}')


if __name__ == '__main__':
    main()
