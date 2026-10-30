#!/usr/bin/env python3
"""Build and query a LOCAL SQLite FTS5 index of authorized DBE test PDFs.

Requires pdftotext (Poppler) and Python SQLite with FTS5 support.
No database/PDF is committed or uploaded to AWS. Usage:
  python3 scripts/index-dbe-test-corpus.py build
  python3 scripts/index-dbe-test-corpus.py search 'Don Bosco'
  python3 scripts/index-dbe-test-corpus.py smoke
"""
import argparse
import csv
import sqlite3
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'data/test-corpus'
PDF_DIR = BASE / 'local-pdfs'
DB = BASE / 'local-index.sqlite3'
CATALOG = BASE / 'dbe-public-sources.csv'


def manifest():
    with CATALOG.open(newline='', encoding='utf-8') as source:
        return list(csv.DictReader(source))


def pages_of(pdf):
    # Form-feed is Poppler's page separator; no shell interpolation.
    result = subprocess.run(['pdftotext', '-layout', '-enc', 'UTF-8', str(pdf), '-'],
                            capture_output=True, text=True, check=True, timeout=120)
    return [p.strip() for p in result.stdout.split(chr(12)) if p.strip()]


def build():
    if not PDF_DIR.exists():
        raise SystemExit('No local PDFs. Use fetch-dbe-test-corpus.py --authorized first.')
    with sqlite3.connect(DB) as db:
        db.execute('CREATE VIRTUAL TABLE IF NOT EXISTS page_index USING fts5(issue UNINDEXED, publication UNINDEXED, period UNINDEXED, page UNINDEXED, text, tokenize="unicode61 remove_diacritics 2")')
        db.execute('DELETE FROM page_index')
        total = 0
        for row in manifest():
            pdf = PDF_DIR / f'dbe-{int(row["issue"])}.pdf'
            if not pdf.is_file():
                print(f'skip {row["issue"]}: missing PDF')
                continue
            if not pdf.open('rb').read(5) == b'%PDF-':
                raise ValueError(f'Invalid PDF header: {pdf}')
            pages = pages_of(pdf)
            db.executemany('INSERT INTO page_index(issue, publication, period, page, text) VALUES(?,?,?,?,?)',
                           [(row['issue'], row['publication'], row['period'], i, text[:100000]) for i, text in enumerate(pages, 1)])
            print(f'indexed issue {row["issue"]}: {len(pages)} pages')
            total += len(pages)
        if not total:
            raise SystemExit('No text pages indexed (check PDFs/OCR)')
        print(f'{total} pages indexed locally in {DB}')


def search(query):
    if not DB.exists():
        raise SystemExit('No index. Run build first.')
    with sqlite3.connect(f'file:{DB}?mode=ro', uri=True) as db:
        rows = db.execute('SELECT issue, period, page, snippet(page_index, 4, "[", "]", " ... ", 18) FROM page_index WHERE page_index MATCH ? ORDER BY rank LIMIT 20', (query,)).fetchall()
    for issue, period, page, excerpt in rows:
        print(f'DBE {issue} ({period}), PDF page {page}: {excerpt.replace(chr(10), " ")[:300]}')
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('build')
    s = sub.add_parser('search')
    s.add_argument('query')
    sub.add_parser('smoke')
    args = parser.parse_args()
    if args.command == 'build':
        build()
    elif args.command == 'search':
        search(args.query)
    else:
        count = search('"Don Bosco"')
        if count < 1:
            raise SystemExit('FAIL: no Don Bosco matches found')
        print(f'PASS: {count} ranked matches with issue and PDF page')


if __name__ == '__main__':
    main()
