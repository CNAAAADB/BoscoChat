#!/usr/bin/env python3
"""BC-106: private, review-only TIFF ZIP import using Textract.

No PDF creation, database writes, document indexing, or model-driven actions.
Untrusted ZIP/OCR text is data; every source page retains its original name/hash.
"""
import datetime
import hashlib
import io
import json
import os
from pathlib import PurePosixPath
import re
import stat
import struct
import sys
import tempfile
import time
import unicodedata
import zipfile

MAX_ZIP_BYTES = 100 * 1024 * 1024
MAX_TIFF_BYTES = 9 * 1024 * 1024
MAX_UNPACKED_BYTES = 250 * 1024 * 1024
MAX_PAGES = 40
MAX_PIXELS = 45_000_000
MAX_SIDE = 12_000
MAX_RATIO = 150
BUCKET = "boscochat-archivo-pdfs"
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
MONTHS = re.compile(r"\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b", re.I)
YEARS = re.compile(r"\b(18[0-9]{2}|19[0-9]{2}|20[0-9]{2})\b")
NUMBERED = re.compile(r"^(.*?)([0-9]{1,6})\.(tif|tiff)$", re.I)


class RejectedImport(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def key_of(job_id):
    return "imports/reviews/" + job_id + ".json"


def natural(value):
    text = unicodedata.normalize("NFC", value)
    return tuple((0, int(part)) if part.isdigit() else (1, part.casefold())
                 for part in re.split(r"([0-9]+)", text))


def inspect_zip(archive_path):
    if os.stat(archive_path).st_size > MAX_ZIP_BYTES:
        raise RejectedImport("ZIP_TOO_LARGE")
    pages = []
    seen_paths = set()
    folder_numbers = {}
    unpacked = 0
    try:
        archive = zipfile.ZipFile(archive_path)
    except (zipfile.BadZipFile, OSError):
        raise RejectedImport("INVALID_ZIP") from None

    with archive:
        for info in archive.infolist():
            name = unicodedata.normalize("NFC", info.filename)
            if info.is_dir():
                continue
            if name.startswith("__MACOSX/") or name.endswith("/.DS_Store"):
                continue
            bits = info.external_attr >> 16
            if (bits and stat.S_ISLNK(bits)) or info.flag_bits & 0x1:
                raise RejectedImport("UNSAFE_ZIP_ENTRY")
            if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                raise RejectedImport("UNSUPPORTED_ZIP_COMPRESSION")
            if (not name or name.startswith("/") or "\\" in name
                    or any(ord(c) < 32 for c in name)):
                raise RejectedImport("UNSAFE_ZIP_ENTRY")
            path = PurePosixPath(name)
            if (".." in path.parts or "." in path.parts
                    or len(path.parts) > 3 or any(part.startswith(".") for part in path.parts)):
                raise RejectedImport("UNSAFE_ZIP_ENTRY")
            if path.suffix.lower() not in (".tif", ".tiff"):
                raise RejectedImport("NON_TIFF_IN_ZIP")
            folded = name.casefold()
            if folded in seen_paths:
                raise RejectedImport("DUPLICATE_ZIP_ENTRY")
            seen_paths.add(folded)
            if not 0 < info.file_size <= MAX_TIFF_BYTES:
                raise RejectedImport("TIFF_SIZE_LIMIT")
            if (info.compress_size <= 0 or info.file_size / info.compress_size > MAX_RATIO):
                raise RejectedImport("ZIP_BOMB_SUSPECTED")
            unpacked += info.file_size
            if unpacked > MAX_UNPACKED_BYTES:
                raise RejectedImport("ZIP_BOMB_SUSPECTED")
            match = NUMBERED.fullmatch(path.name)
            if not match:
                raise RejectedImport("AMBIGUOUS_PAGE_ORDER")
            parent = str(path.parent)
            number = int(match.group(2))
            ids = folder_numbers.setdefault(parent.casefold(), set())
            if number in ids:
                raise RejectedImport("DUPLICATE_PAGE_NUMBER")
            ids.add(number)
            pages.append((name, info, parent, number))
            if len(pages) > MAX_PAGES:
                raise RejectedImport("TOO_MANY_PAGES")
        if not pages:
            raise RejectedImport("NO_TIFF_PAGES")
        if len(folder_numbers) > 1:
            for folder in folder_numbers:
                if folder == '.' or not re.match(r'^[0-9]+', PurePosixPath(folder).name):
                    raise RejectedImport('AMBIGUOUS_ISSUE_ORDER')
        for ids in folder_numbers.values():
            if max(ids) - min(ids) + 1 != len(ids):
                raise RejectedImport("MISSING_PAGE_NUMBER")
        pages.sort(key=lambda entry: (natural(entry[2]), entry[3], natural(entry[0])))
        return [entry[:2] for entry in pages]


def check_single_page_tiff(data):
    """Reject BigTIFF, malformed offsets, huge raster dimensions, multipage TIFF."""
    if len(data) < 14:
        raise RejectedImport("INVALID_TIFF")
    if data[:4] == b"II*\x00":
        fmt = "<"
    elif data[:4] == b"MM\x00*":
        fmt = ">"
    else:
        raise RejectedImport("INVALID_TIFF")
    ifd = struct.unpack_from(fmt + "I", data, 4)[0]
    if ifd > len(data) - 6:
        raise RejectedImport("INVALID_TIFF")
    count = struct.unpack_from(fmt + "H", data, ifd)[0]
    if count > 256 or ifd + 2 + count * 12 + 4 > len(data):
        raise RejectedImport("INVALID_TIFF")
    width = height = None
    for i in range(count):
        at = ifd + 2 + 12 * i
        tag, typ = struct.unpack_from(fmt + "HH", data, at)
        items = struct.unpack_from(fmt + "I", data, at + 4)[0]
        if tag in (256, 257) and items == 1 and typ in (3, 4):
            value = struct.unpack_from(fmt + ("H" if typ == 3 else "I"), data, at + 8)[0]
            if tag == 256:
                width = value
            else:
                height = value
    if not width or not height or width > MAX_SIDE or height > MAX_SIDE or width * height > MAX_PIXELS:
        raise RejectedImport("TIFF_PIXEL_LIMIT")
    next_ifd = struct.unpack_from(fmt + "I", data, ifd + 2 + count * 12)[0]
    if next_ifd:
        raise RejectedImport("MULTIPAGE_TIFF_NOT_SUPPORTED")
    return width, height


def load_page(archive, info):
    chunks = []
    total = 0
    try:
        with archive.open(info) as page:
            while True:
                part = page.read(min(1024 * 1024, MAX_TIFF_BYTES + 1 - total))
                if not part:
                    break
                total += len(part)
                if total > MAX_TIFF_BYTES:
                    raise RejectedImport("TIFF_SIZE_LIMIT")
                chunks.append(part)
    except (zipfile.BadZipFile, RuntimeError, OSError):
        raise RejectedImport("CORRUPTED_ZIP_ENTRY") from None
    if total != info.file_size:
        raise RejectedImport("CORRUPTED_ZIP_ENTRY")
    data = b"".join(chunks)
    width, height = check_single_page_tiff(data)
    return data, width, height


def textract_page(textract, data):
    response = textract.detect_document_text(Document={"Bytes": data})
    if int(response.get("DocumentMetadata", {}).get("Pages", 1)) != 1:
        raise RejectedImport("MULTIPAGE_TIFF_NOT_SUPPORTED")
    lines = []
    for block in response.get("Blocks", []):
        if block.get("BlockType") != "LINE":
            continue
        value = str(block.get("Text", "")).strip()
        if not value:
            continue
        box = (block.get("Geometry") or {}).get("BoundingBox") or {}
        lines.append({
            "text": value[:500],
            "confidence": round(float(block.get("Confidence", 0)), 2),
            "bbox": [round(float(box.get(k, 0)), 5)
                     for k in ("Left", "Top", "Width", "Height")],
        })
        if len(lines) > 400:
            raise RejectedImport("OCR_LINE_LIMIT")
    text = "\n".join(line["text"] for line in lines)
    if len(text.encode("utf8")) > 100_000:
        raise RejectedImport("OCR_TEXT_LIMIT")
    confidence = round(sum(x["confidence"] for x in lines) / len(lines), 2) if lines else 0
    return text, lines, confidence


def metadata_hints(pages):
    """Only literal text evidence, never inferred publication names or dates."""
    result = []
    for page in pages[:8]:
        text = page["ocrText"][:3000]
        years = sorted(set(YEARS.findall(text)))
        months = sorted({item.casefold() for item in MONTHS.findall(text)})
        if years or months:
            result.append({
                "pageNumber": page["pageNumber"],
                "yearsMentioned": years[:8],
                "monthsMentioned": months[:12],
                "unverified": True,
            })
    return result


def build_review(archive_path, textract):
    pages = []
    with zipfile.ZipFile(archive_path) as archive:
        for index, (name, info) in enumerate(inspect_zip(archive_path), start=1):
            data, width, height = load_page(archive, info)
            text, lines, confidence = textract_page(textract, data)
            pages.append({
                "pageNumber": index, "sourceFilename": name,
                "sha256": hashlib.sha256(data).hexdigest(),
                "width": width, "height": height,
                "ocrText": text, "lines": lines,
                "confidence": confidence,
                "needsReview": confidence < 85 or len(lines) < 2,
            })
    return {
        "status": "ocr_complete_review_required", "engine": "Amazon Textract DetectDocumentText",
        "pageCount": len(pages), "pages": pages,
        "hints": metadata_hints(pages),
        "requiresHumanReview": True, "publishable": False, "indexed": False,
        "notes": "La identificación de publicaciones, meses y cortes está pendiente de revisión humana.",
    }


def run(job_id, key, version):
    if (not UUID.fullmatch(job_id)
        or not key.startswith("imports/tiff/" + job_id + "/")
        or not re.fullmatch(r"[a-zA-Z0-9+=_./~-]{1,256}", version)
        or not key.lower().endswith(".zip")):
        raise RejectedImport("INVALID_OCR_EVENT")
    import boto3
    from botocore.config import Config
    config = Config(connect_timeout=4, read_timeout=30,
                    retries={"max_attempts": 2, "mode": "standard"})
    s3 = boto3.client("s3", region_name="us-east-1", config=config)
    textract = boto3.client("textract", region_name="us-east-1", config=config)
    state = {
        "jobId": job_id, "status": "error", "errorCode": "OCR_PROCESSING_FAILED",
        "pageCount": 0, "requiresHumanReview": True, "publishable": False, "indexed": False,
    }
    try:
        head = s3.head_object(Bucket=BUCKET, Key=key)
        if head.get("VersionId") != version:
            raise RejectedImport("SOURCE_VERSION_CHANGED")
        if not 0 < int(head.get("ContentLength", 0)) <= MAX_ZIP_BYTES:
            raise RejectedImport("ZIP_TOO_LARGE")
        if head.get("ContentType") != "application/zip":
            raise RejectedImport("INVALID_ZIP_CONTENT_TYPE")
        with tempfile.TemporaryDirectory(prefix="boscochat-tiff-") as folder:
            target = os.path.join(folder, "source.zip")
            total = 0
            sha = hashlib.sha256()
            with open(target, "wb") as output:
                response = s3.get_object(Bucket=BUCKET, Key=key, VersionId=version)
                for chunk in response["Body"].iter_chunks(1024 * 1024):
                    if not chunk:
                        continue
                    total += len(chunk)
                    if total > MAX_ZIP_BYTES:
                        raise RejectedImport("ZIP_TOO_LARGE")
                    output.write(chunk)
                    sha.update(chunk)
            if total != head["ContentLength"]:
                raise RejectedImport("ZIP_SIZE_MISMATCH")
            review = build_review(target, textract)
            latest = s3.head_object(Bucket=BUCKET, Key=key)
            if latest.get("VersionId") != version:
                raise RejectedImport("SOURCE_VERSION_CHANGED")
            state.update(review)
            state["sourceKey"] = key
            state["sourceVersionId"] = version
            state["sourceSha256"] = sha.hexdigest()
            state["processedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            state.pop("errorCode", None)
    except RejectedImport as error:
        state["errorCode"] = error.code
    except (OSError, zipfile.BadZipFile):
        state["errorCode"] = "CORRUPTED_ZIP"
    except Exception as error:
        code = getattr(error, "response", {}).get("Error", {}).get("Code")
        if code in ("ThrottlingException", "ProvisionedThroughputExceededException"):
            state["errorCode"] = "TEXTRACT_THROTTLED"
        elif code == "AccessDeniedException":
            state["errorCode"] = "OCR_PERMISSION_DENIED"
        elif code in ("InvalidS3ObjectException", "NoSuchKey", "NoSuchVersion"):
            state["errorCode"] = "SOURCE_NOT_AVAILABLE"
        elif code in ("BadDocumentException", "UnsupportedDocumentException", "DocumentTooLargeException"):
            state["errorCode"] = "TIFF_UNSUPPORTED_BY_TEXTRACT"
        else:
            state["errorCode"] = "OCR_PROCESSING_FAILED"
    # Results are review-only, inside the existing private S3 bucket.
    s3.put_object(
        Bucket=BUCKET, Key=key_of(job_id),
        Body=json.dumps(state, ensure_ascii=False, separators=(",", ":")).encode("utf8"),
        ContentType="application/json", ServerSideEncryption="AES256",
    )
    return {"jobId": job_id, "status": state["status"], "pageCount": state["pageCount"],
            "errorCode": state.get("errorCode")}


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(2)
    print(json.dumps(run(sys.argv[1], sys.argv[2], sys.argv[3])))
