
#!/usr/bin/env python3
"""
Pipeline reproducible de chunking por página para PDFs con OCR/texto embebido.

Qué hace:
1. Lee PDFs.
2. Extrae texto por página.
3. Limpia OCR de forma conservadora.
4. Detecta metadatos de número/fecha por página (best-effort).
5. Propaga esos metadatos al resto de páginas del mismo número/revista.
6. Genera chunks configurables con solapamiento.
7. Persiste documents, pages y chunks en SQLite.
8. Permite reejecución: si cambia el OCR de una página, borra y regenera sus chunks.

Ejemplo:
python don_bosco_chunk_pipeline.py \
  --input-glob "/mnt/data/Don Bosco en España_*_compressed.pdf" \
  --db-path "/mnt/data/don_bosco_chunks.db" \
  --chunk-size 1200 \
  --overlap 200 \
  --ocr-version v1
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import os
import re
import sqlite3
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, Optional

import fitz  # PyMuPDF

SPANISH_MONTHS = {
    "ENERO": "01",
    "FEBRERO": "02",
    "MARZO": "03",
    "ABRIL": "04",
    "MAYO": "05",
    "JUNIO": "06",
    "JULIO": "07",
    "AGOSTO": "08",
    "SEPTIEMBRE": "09",
    "SETIEMBRE": "09",
    "OCTUBRE": "10",
    "NOVIEMBRE": "11",
    "DICIEMBRE": "12",
}

MONTH_PATTERN = r"(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)"
YEAR_PATTERN = r"(19\d{2})"

# Cabeceras relativamente típicas de número/fecha.
HEADER_PATTERNS = [
    re.compile(rf"\b(?P<month>{MONTH_PATTERN})\s+DE\s+(?P<year>{YEAR_PATTERN})\b", re.IGNORECASE),
    re.compile(rf"\b(?P<month>{MONTH_PATTERN})\b.*?\b(?P<year>{YEAR_PATTERN})\b", re.IGNORECASE | re.DOTALL),
]
NUMBER_PATTERNS = [
    re.compile(r"\bN(?:\s*\.\s*O|[º°])\s*[:.\-]?\s*(?P<number>\d{1,3}|[IVXLCDM]{1,12})\b", re.IGNORECASE),
    re.compile(r"\bN[ÚU]M\.?\s*[:.\-]?\s*(?P<number>\d{1,3}|[IVXLCDM]{1,12})\b", re.IGNORECASE),
    re.compile(r"\bNUMERO\.?\s*[:.\-]?\s*(?P<number>\d{1,3}|[IVXLCDM]{1,12})\b", re.IGNORECASE),
]

PUBLICATION_PATTERNS = [
    re.compile(r"DON\s+BOSCO\s+EN\s+ESPA[ÑN]A", re.IGNORECASE),
    re.compile(r'"DON\s*BOSCO\s*EN\s*ESP[AO]R[AO]"', re.IGNORECASE),  # OCR muy sucio
]

MANUAL_DOC_METADATA = {
    "Don Bosco en España_1922_compressed.pdf": {"issue_number": "1", "issue_date": "1922-09"},
    "Don Bosco en España_1924_compressed.pdf": {"issue_number": "IX", "issue_date": "1924-01"},
    "Don Bosco en España_1925_compressed.pdf": {"issue_number": "XIV", "issue_date": "1925-01"},
    "Don Bosco en España_1926_compressed.pdf": {"issue_number": "1", "issue_date": "1926-02"},
    "Don Bosco en España_1927_compressed.pdf": {"issue_number": "12", "issue_date": "1927-01"},
    "Don Bosco en España_1928_compressed.pdf": {"issue_number": "24", "issue_date": "1928-01"},
    "Don Bosco en España_1929_compressed.pdf": {"issue_number": "36", "issue_date": "1929-01"},
    "Don Bosco en España_1930_compressed.pdf": {"issue_number": "47", "issue_date": "1930-01"},
    "Don Bosco en España_1931_compressed.pdf": {"issue_number": "58", "issue_date": "1931-01"},
    "Don Bosco en España_1944_compressed.pdf": {"issue_number": "1", "issue_date": "1944-01"},

    # Este déjalo pendiente hasta verificar la portada / primeras páginas
    "Don Bosco en España_1923_compressed.pdf": {"issue_number": None, "issue_date": None},
}

def get_manual_issue_metadata(source_filename: str, publication: str, file_year: Optional[int]) -> Optional[IssueMetadata]:
    data = MANUAL_DOC_METADATA.get(source_filename)
    if not data:
        return None

    issue_date = data.get("issue_date")
    issue_number = data.get("issue_number")

    year = file_year
    if issue_date and len(issue_date) >= 4:
        try:
            year = int(issue_date[:4])
        except ValueError:
            pass

    return IssueMetadata(
        publication=publication,
        number=issue_number,
        date_iso=issue_date,
        year=year,
        confidence="manual",
    )

FILENAME_YEAR_RE = re.compile(r"_(19\d{2})_")
FILENAME_PUBLICATION_RE = re.compile(r"^(.*?)_(19\d{2})", re.IGNORECASE)

CONTROL_CHARS_RE = re.compile(r"[\u0000-\u0008\u000b-\u001f\u007f-\u009f]")
MULTISPACE_RE = re.compile(r"[ \t]+")
TOO_MANY_BREAKS_RE = re.compile(r"\n{3,}")
SOFT_HYPHEN_RE = re.compile("\u00ad")
JOIN_HYPHEN_LINE_RE = re.compile(r"(\w+)-\n(\w+)")
INLINE_BREAK_RE = re.compile(r"(?<!\n)\n(?!\n)")
PAGE_MARKER_RE = re.compile(r"<PARSED TEXT FOR PAGE:\s*\d+\s*/\s*\d+>", re.IGNORECASE)

@dataclass
class IssueMetadata:
    publication: Optional[str]
    number: Optional[str]
    date_iso: Optional[str]     # YYYY-MM or YYYY-MM-DD if algún día se amplía
    year: Optional[int]
    confidence: str             # high / medium / low / fallback

@dataclass
class Chunk:
    position_in_page: int
    char_start: int
    char_end: int
    text: str

def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def normalize_publication_from_filename(path: str) -> Optional[str]:
    base = os.path.basename(path)
    m = FILENAME_PUBLICATION_RE.match(base)
    if not m:
        return None
    publication = m.group(1).replace("_compressed.pdf", "").strip()
    return publication

def normalize_year_from_filename(path: str) -> Optional[int]:
    m = FILENAME_YEAR_RE.search(os.path.basename(path))
    return int(m.group(1)) if m else None

def clean_ocr_text(text: str) -> str:
    if not text:
        return ""
    text = SOFT_HYPHEN_RE.sub("", text)
    text = CONTROL_CHARS_RE.sub("", text)
    text = PAGE_MARKER_RE.sub("", text)
    text = text.replace("\r", "\n")
    text = JOIN_HYPHEN_LINE_RE.sub(r"\1\2", text)
    text = MULTISPACE_RE.sub(" ", text)
    text = TOO_MANY_BREAKS_RE.sub("\n\n", text)
    # Conservador: saltos internos simples a espacio, dobles se conservan.
    text = INLINE_BREAK_RE.sub(" ", text)
    return text.strip()

def smart_chunk_text(text: str, chunk_size: int, overlap: int) -> list[Chunk]:
    if chunk_size <= 0:
        raise ValueError("chunk_size debe ser > 0")
    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("overlap debe ser >= 0 y < chunk_size")

    text = text.strip()
    if not text:
        return []

    chunks: list[Chunk] = []
    step = chunk_size - overlap
    start = 0
    pos = 1

    while start < len(text):
        end = min(start + chunk_size, len(text))

        if end < len(text):
            # Preferimos cortar por doble salto, luego por punto, luego por espacio.
            candidate = text.rfind("\n\n", start, end)
            if candidate > start + int(chunk_size * 0.55):
                end = candidate
            else:
                candidate = text.rfind(". ", start, end)
                if candidate > start + int(chunk_size * 0.55):
                    end = candidate + 1
                else:
                    candidate = text.rfind(" ", start, end)
                    if candidate > start + int(chunk_size * 0.55):
                        end = candidate

        chunk_text = text[start:end].strip()
        if chunk_text:
            chunks.append(
                Chunk(
                    position_in_page=pos,
                    char_start=start,
                    char_end=end,
                    text=chunk_text,
                )
            )
            pos += 1

        if end >= len(text):
            break

        start += step

    return chunks

def detect_issue_metadata(page_text: str, file_publication: Optional[str], file_year: Optional[int]) -> IssueMetadata:
    """
    Heurística conservadora.
    Busca metadatos en la zona alta de la página.
    """
    sample = page_text[:1800]
    sample_upper = sample.upper()

    publication = None
    if any(p.search(sample_upper) for p in PUBLICATION_PATTERNS):
        publication = file_publication or "Don Bosco en España"
    else:
        publication = file_publication

    number = None
    for pat in NUMBER_PATTERNS:
        m = pat.search(sample_upper)
        if m:
            number = m.group("number").strip(".- ")
            break

    month = None
    year = None
    for pat in HEADER_PATTERNS:
        m = pat.search(sample_upper)
        if m:
            month = m.groupdict().get("month")
            year = m.groupdict().get("year")
            if month and year:
                break

    date_iso = None
    confidence = "fallback"

    if month and year:
        mm = SPANISH_MONTHS.get(month.upper())
        if mm:
            date_iso = f"{year}-{mm}"
            confidence = "medium"

    # Subimos confianza si parece portada/cabecera de número.
    has_title = publication is not None
    has_number = number is not None
    if date_iso and (has_title or has_number):
        confidence = "high"
    elif has_title and has_number:
        confidence = "medium"

    if not year and file_year is not None:
        year = str(file_year)

    return IssueMetadata(
        publication=publication,
        number=number,
        date_iso=date_iso,
        year=int(year) if year else file_year,
        confidence=confidence,
    )

def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_pdf TEXT NOT NULL UNIQUE,
            source_filename TEXT NOT NULL,
            publication TEXT,
            file_year INTEGER,
            file_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            page_number INTEGER NOT NULL,
            ocr_raw TEXT NOT NULL,
            ocr_clean TEXT NOT NULL,
            ocr_hash TEXT NOT NULL,
            ocr_version TEXT NOT NULL,
            publication TEXT,
            issue_number TEXT,
            issue_date TEXT,
            issue_year INTEGER,
            issue_confidence TEXT,
            updated_at TEXT NOT NULL,
            UNIQUE(document_id, page_number)
        );

        CREATE TABLE IF NOT EXISTS chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
            document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            publication TEXT,
            issue_number TEXT,
            issue_date TEXT,
            issue_year INTEGER,
            page_number INTEGER NOT NULL,
            position_in_page INTEGER NOT NULL,
            char_start INTEGER NOT NULL,
            char_end INTEGER NOT NULL,
            chunk_size_config INTEGER NOT NULL,
            overlap_config INTEGER NOT NULL,
            ocr_version TEXT NOT NULL,
            text TEXT NOT NULL,
            text_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(page_id, position_in_page, ocr_version, chunk_size_config, overlap_config)
        );

        CREATE INDEX IF NOT EXISTS idx_pages_doc_page ON pages(document_id, page_number);
        CREATE INDEX IF NOT EXISTS idx_chunks_doc_page ON chunks(document_id, page_number);
        CREATE INDEX IF NOT EXISTS idx_chunks_issue_date ON chunks(issue_date);
        CREATE INDEX IF NOT EXISTS idx_chunks_issue_number ON chunks(issue_number);
        """
    )
    conn.commit()

def file_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for part in iter(lambda: f.read(1024 * 1024), b""):
            h.update(part)
    return h.hexdigest()

def upsert_document(
    conn: sqlite3.Connection,
    source_pdf: str,
    source_filename: str,
    publication: Optional[str],
    file_year: Optional[int],
    file_hash: str,
) -> int:
    now = datetime.utcnow().isoformat(timespec="seconds")
    cur = conn.execute("SELECT id FROM documents WHERE source_pdf = ?", (source_pdf,))
    row = cur.fetchone()
    if row:
        doc_id = row[0]
        conn.execute(
            """
            UPDATE documents
            SET source_filename = ?, publication = ?, file_year = ?, file_hash = ?, updated_at = ?
            WHERE id = ?
            """,
            (source_filename, publication, file_year, file_hash, now, doc_id),
        )
        conn.commit()
        return doc_id

    cur = conn.execute(
        """
        INSERT INTO documents (source_pdf, source_filename, publication, file_year, file_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (source_pdf, source_filename, publication, file_year, file_hash, now, now),
    )
    conn.commit()
    return cur.lastrowid

def upsert_page(
    conn: sqlite3.Connection,
    document_id: int,
    page_number: int,
    ocr_raw: str,
    ocr_clean: str,
    ocr_hash: str,
    ocr_version: str,
    issue_meta: IssueMetadata,
) -> tuple[int, bool]:
    """
    Devuelve (page_id, changed)
    changed=True si el OCR cambió y por tanto hay que regenerar chunks.
    """
    now = datetime.utcnow().isoformat(timespec="seconds")
    cur = conn.execute(
        """
        SELECT id, ocr_hash, ocr_version, publication, issue_number, issue_date, issue_year
        FROM pages
        WHERE document_id = ? AND page_number = ?
        """,
        (document_id, page_number),
    )
    row = cur.fetchone()

    if row:
        page_id, old_hash, old_ver, old_pub, old_num, old_date, old_year = row
        changed = (
            old_hash != ocr_hash
            or old_ver != ocr_version
            or old_pub != issue_meta.publication
            or old_num != issue_meta.number
            or old_date != issue_meta.date_iso
            or old_year != issue_meta.year
        )
        conn.execute(
            """
            UPDATE pages
            SET ocr_raw = ?, ocr_clean = ?, ocr_hash = ?, ocr_version = ?,
                publication = ?, issue_number = ?, issue_date = ?, issue_year = ?,
                issue_confidence = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                ocr_raw,
                ocr_clean,
                ocr_hash,
                ocr_version,
                issue_meta.publication,
                issue_meta.number,
                issue_meta.date_iso,
                issue_meta.year,
                issue_meta.confidence,
                now,
                page_id,
            ),
        )
        conn.commit()
        return page_id, changed

    cur = conn.execute(
        """
        INSERT INTO pages (
            document_id, page_number, ocr_raw, ocr_clean, ocr_hash, ocr_version,
            publication, issue_number, issue_date, issue_year, issue_confidence, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            document_id,
            page_number,
            ocr_raw,
            ocr_clean,
            ocr_hash,
            ocr_version,
            issue_meta.publication,
            issue_meta.number,
            issue_meta.date_iso,
            issue_meta.year,
            issue_meta.confidence,
            now,
        ),
    )
    conn.commit()
    return cur.lastrowid, True

def delete_chunks_for_page(conn: sqlite3.Connection, page_id: int) -> None:
    conn.execute("DELETE FROM chunks WHERE page_id = ?", (page_id,))
    conn.commit()

def insert_chunks(
    conn: sqlite3.Connection,
    page_id: int,
    document_id: int,
    page_number: int,
    issue_meta: IssueMetadata,
    chunks: list[Chunk],
    chunk_size: int,
    overlap: int,
    ocr_version: str,
) -> int:
    now = datetime.utcnow().isoformat(timespec="seconds")
    rows = []
    for ch in chunks:
        rows.append(
            (
                page_id,
                document_id,
                issue_meta.publication,
                issue_meta.number,
                issue_meta.date_iso,
                issue_meta.year,
                page_number,
                ch.position_in_page,
                ch.char_start,
                ch.char_end,
                chunk_size,
                overlap,
                ocr_version,
                ch.text,
                sha256_text(ch.text),
                now,
            )
        )

    conn.executemany(
        """
        INSERT INTO chunks (
            page_id, document_id, publication, issue_number, issue_date, issue_year,
            page_number, position_in_page, char_start, char_end,
            chunk_size_config, overlap_config, ocr_version,
            text, text_hash, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    return len(rows)

def extract_pages_from_pdf(path: str) -> list[str]:
    doc = fitz.open(path)
    pages = []
    for i in range(doc.page_count):
        page = doc.load_page(i)
        raw = page.get_text("text")
        pages.append(raw or "")
    doc.close()
    return pages

def propagate_issue_metadata(page_texts_clean: list[str], file_publication: Optional[str], file_year: Optional[int]) -> list[IssueMetadata]:
    """
    Detecta cabeceras por página y luego propaga hacia delante el último número/fecha detectado.
    """
    detected = [detect_issue_metadata(t, file_publication, file_year) for t in page_texts_clean]

    current_number = None
    current_date = None
    current_year = file_year
    current_pub = file_publication

    propagated: list[IssueMetadata] = []
    for meta in detected:
        if meta.publication:
            current_pub = meta.publication
        if meta.number:
            current_number = meta.number
        if meta.date_iso:
            current_date = meta.date_iso
        if meta.year:
            current_year = meta.year

        propagated.append(
            IssueMetadata(
                publication=current_pub,
                number=meta.number or current_number,
                date_iso=meta.date_iso or current_date,
                year=meta.year or current_year,
                confidence=meta.confidence if meta.confidence != "fallback" else "propagated",
            )
        )

    return propagated

def process_pdf(
    conn: sqlite3.Connection,
    path: str,
    chunk_size: int,
    overlap: int,
    ocr_version: str,
    verbose: bool = True,
) -> tuple[int, int]:
    source_pdf = str(Path(path).resolve())
    source_filename = os.path.basename(path)
    file_year = normalize_year_from_filename(path)
    publication = normalize_publication_from_filename(path) or "Don Bosco en España"
    pdf_hash = file_sha256(path)

    doc_id = upsert_document(
        conn=conn,
        source_pdf=source_pdf,
        source_filename=source_filename,
        publication=publication,
        file_year=file_year,
        file_hash=pdf_hash,
    )

    raw_pages = extract_pages_from_pdf(path)
    clean_pages = [clean_ocr_text(t) for t in raw_pages]

    manual_meta = get_manual_issue_metadata(source_filename, publication, file_year)

    if manual_meta and manual_meta.number and manual_meta.date_iso:
        issue_metas = [manual_meta for _ in raw_pages]
    else:
        issue_metas = propagate_issue_metadata(raw_pages, publication, file_year)
    
    pages_processed = 0
    chunks_inserted = 0

    for idx, (ocr_raw, ocr_clean, meta) in enumerate(zip(raw_pages, clean_pages, issue_metas), start=1):
        if not ocr_clean.strip():
            continue

        ocr_hash = sha256_text(ocr_clean)
        page_id, changed = upsert_page(
            conn=conn,
            document_id=doc_id,
            page_number=idx,
            ocr_raw=ocr_raw,
            ocr_clean=ocr_clean,
            ocr_hash=ocr_hash,
            ocr_version=ocr_version,
            issue_meta=meta,
        )

        # Regeneración completa de chunks por página si cambió OCR/meta o si todavía no hay chunks.
        cur = conn.execute("SELECT COUNT(*) FROM chunks WHERE page_id = ?", (page_id,))
        chunk_count_existing = cur.fetchone()[0]

        if changed or chunk_count_existing == 0:
            delete_chunks_for_page(conn, page_id)
            chunks = smart_chunk_text(ocr_clean, chunk_size=chunk_size, overlap=overlap)
            inserted = insert_chunks(
                conn=conn,
                page_id=page_id,
                document_id=doc_id,
                page_number=idx,
                issue_meta=meta,
                chunks=chunks,
                chunk_size=chunk_size,
                overlap=overlap,
                ocr_version=ocr_version,
            )
            chunks_inserted += inserted

        pages_processed += 1

    if verbose:
        print(f"[OK] {source_filename}: páginas={pages_processed}, chunks_nuevos={chunks_inserted}")

    return pages_processed, chunks_inserted

def main() -> int:
    parser = argparse.ArgumentParser(description="Pipeline de chunking OCR por página para Don Bosco en España.")
    parser.add_argument("--input-glob", required=True, help='Glob de entrada. Ej: "/mnt/data/Don Bosco en España_*_compressed.pdf"')
    parser.add_argument("--db-path", required=True, help="Ruta al SQLite de salida.")
    parser.add_argument("--chunk-size", type=int, default=1200, help="Tamaño máximo de chunk en caracteres.")
    parser.add_argument("--overlap", type=int, default=200, help="Solapamiento entre chunks en caracteres.")
    parser.add_argument("--ocr-version", default="v1", help="Versión del OCR/pipeline.")
    parser.add_argument("--verbose", action="store_true", help="Imprime progreso detallado.")
    args = parser.parse_args()

    paths = sorted(glob.glob(args.input_glob))
    if not paths:
        print("No se encontraron PDFs con ese patrón.", file=sys.stderr)
        return 1

    os.makedirs(os.path.dirname(os.path.abspath(args.db_path)), exist_ok=True)
    conn = sqlite3.connect(args.db_path)
    ensure_schema(conn)

    total_pages = 0
    total_chunks = 0

    for path in paths:
        pages, chunks = process_pdf(
            conn=conn,
            path=path,
            chunk_size=args.chunk_size,
            overlap=args.overlap,
            ocr_version=args.ocr_version,
            verbose=True,
        )
        total_pages += pages
        total_chunks += chunks

    print(f"\nProcesamiento completado. páginas={total_pages}, chunks_nuevos={total_chunks}, db={args.db_path}")
    conn.close()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
