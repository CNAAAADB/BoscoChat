#!/usr/bin/env python3
"""Build/query a local SQLite FTS5 index from verified, private DBE PDFs."""
import argparse
import csv
import hashlib
import os
import resource
import sqlite3
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'data/test-corpus'
PDF_DIR = BASE / 'local-pdfs'
DB = BASE / 'local-index.sqlite3'
CATALOG = BASE / 'dbe-public-sources.csv'
MAX_PDF_BYTES = 30 * 1024 * 1024
MAX_TEXT_BYTES = 64 * 1024 * 1024


def manifest():
    with CATALOG.open(newline='', encoding='utf-8') as source:
        return list(csv.DictReader(source))


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        while chunk := source.read(64 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def verify_pdf(row, pdf):
    if not pdf.is_file() or pdf.stat().st_size > MAX_PDF_BYTES:
        raise ValueError(f'Missing or oversized PDF: {pdf}')
    with pdf.open('rb') as source:
        if source.read(5) != b'%PDF-':
            raise ValueError(f'Invalid PDF header: {pdf}')
    expected = row.get('sha256', '').strip().lower()
    if len(expected) != 64 or sha256_file(pdf) != expected:
        raise ValueError(f'Unverified PDF checksum: {pdf}')


def parser_limits():
    resource.setrlimit(resource.RLIMIT_CPU, (60, 60))
    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_TEXT_BYTES, MAX_TEXT_BYTES))
    resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))


def pages_of(pdf):
    with tempfile.TemporaryDirectory(prefix='boscochat-pdftotext-') as directory:
        output = Path(directory) / 'extracted.txt'
        completed = subprocess.run(
            ['pdftotext', '-layout', '-enc', 'UTF-8', str(pdf), str(output)],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
            timeout=90,
            close_fds=True,
            env={'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'LANG': 'C.UTF-8'},
            preexec_fn=parser_limits,
        )
        if completed.returncode != 0:
            raise RuntimeError(f'pdftotext failed safely: {completed.stderr[:500]}')
        if not output.is_file() or output.stat().st_size > MAX_TEXT_BYTES:
            raise ValueError('Extracted text is missing or exceeds the 64 MiB limit')
        text = output.read_text(encoding='utf-8', errors='strict')
    return [page.strip() for page in text.split(chr(12)) if page.strip()]


def build():
    if not PDF_DIR.exists():
        raise SystemExit('No local PDFs. Run the authorized fetch first.')
    with sqlite3.connect(DB) as db:
        db.execute('CREATE VIRTUAL TABLE IF NOT EXISTS page_index USING fts5(issue UNINDEXED, publication UNINDEXED, period UNINDEXED, page UNINDEXED, text, tokenize="unicode61 remove_diacritics 2")')
        db.execute('DELETE FROM page_index')
        total = 0
        for row in manifest():
            pdf = PDF_DIR / f'dbe-{int(row["issue"])}.pdf'
            verify_pdf(row, pdf)
            pages = pages_of(pdf)
            db.executemany(
                'INSERT INTO page_index(issue, publication, period, page, text) VALUES(?,?,?,?,?)',
                [(row['issue'], row['publication'], row['period'], number, text[:100000])
                 for number, text in enumerate(pages, 1)],
            )
            print(f'indexed issue {row["issue"]}: {len(pages)} pages')
            total += len(pages)
        if not total:
            raise SystemExit('No text pages indexed (check PDFs/OCR)')
        print(f'{total} pages indexed locally in {DB}')


def search(query):
    if not DB.exists():
        raise SystemExit('No index. Run build first.')
    with sqlite3.connect(f'file:{DB}?mode=ro', uri=True) as db:
        rows = db.execute(
            'SELECT issue, period, page, snippet(page_index, 4, "[", "]", " ... ", 18) '
            'FROM page_index WHERE page_index MATCH ? ORDER BY rank LIMIT 20',
            (query,),
        ).fetchall()
    for issue, period, page, excerpt in rows:
        print(f'DBE {issue} ({period}), PDF page {page}: {excerpt.replace(chr(10), " ")[:300]}')
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('build')
    search_parser = sub.add_parser('search')
    search_parser.add_argument('query')
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
