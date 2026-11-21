"""BC-110. Inventory a local read-only mirror of the annual Drive folders.

python scripts/boletin_import.py /path/to/Boletin > inventory.jsonl
Add --stage to copy eligible files to content-addressed private S3 staging.
For a public Drive folder, use an empty local cache directory as the root, add
--drive-folder FOLDER_ID and configure GOOGLE_DRIVE_API_KEY in the environment.
Allow disk space for the corpus. Keep the cache to resume interrupted runs.
Requires Poppler and, for staging, boto3 with conditional PutObject support.
Each run reconciles all inputs. Staging does not publish or invoke the indexer.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import shutil
import tempfile
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from collections import defaultdict


BUCKET = "boscochat-archivo-pdfs"
ISSUE = re.compile(r"(\d{4})(0[1-9]|1[0-2])[-_]N(\d+)\.pdf", re.I | re.ASCII)


def inspect_file(root, path, relative=None):
    relative = path.relative_to(root) if relative is None else relative
    row = {"path": relative.as_posix(), "status": "review"}
    if path.is_symlink():
        return dict(row, reason="symbolic_link")
    if relative.suffix.lower() != ".pdf":
        return dict(row, status="excluded", reason="non_pdf")
    if relative.as_posix() == "1941/1941.pdf":
        return dict(row, reason="1941_notice_excluded_from_staging")
    match = ISSUE.fullmatch(relative.name)
    if not match or len(relative.parts) != 2:
        return dict(row, reason="unrecognized_issue")
    year, month, number = match.groups()
    if (not 1886 <= int(year) <= 2008 or relative.parts[0].strip().rstrip("*").strip() != year
            or int(number) == 0):
        return dict(row, reason="ambiguous_metadata")
    row.update(publication="Boletín Salesiano", year=int(year), month=int(month), number=number)
    try:
        with path.open("rb") as source:
            if source.read(5) != b"%PDF-":
                return dict(row, reason="invalid_pdf_header")
            source.seek(0)
            row["sha256"] = hashlib.file_digest(source, "sha256").hexdigest()
            row["bytes"] = os.fstat(source.fileno()).st_size
        info = subprocess.check_output(["pdfinfo", str(path)], timeout=120, env=dict(os.environ, LC_ALL="C"))
        count = re.search(rb"^Pages:\s+(\d+)\s*$", info, re.M)
        if not count or not 1 <= int(count[1]) <= 5000:
            return dict(row, reason="invalid_page_count")
        row["pages"] = int(count[1])
        data = subprocess.check_output(["pdftotext", "-layout", "-enc", "UTF-8", str(path), "-"], timeout=720)
        pages = data.decode("utf8").split("\f")
        if pages and not pages[-1].strip():
            pages.pop()
        if len(pages) != row["pages"]:
            return dict(row, reason="physical_page_mismatch")
        row["review_pages"] = [n for n, page in enumerate(pages, 1)
                               if len(page.strip()) < 80 or sum(c.isalpha() for c in page) < len(page.strip()) * .3]
        if row["review_pages"]:
            return dict(row, reason="check_text_or_ocr")
        return dict(row, status="candidate")
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        return dict(row, reason=type(error).__name__)


def reconcile(rows):
    issues = defaultdict(list)
    hashes = defaultdict(list)
    for row in rows:
        if "number" in row:
            issues[row["year"], row["month"], int(row["number"])].append(row)
        if "sha256" in row:
            hashes[row["sha256"]].append(row)
    for group in issues.values():
        if len(group) > 1:
            if len({r.get("sha256") for r in group}) != 1 or not all(r.get("sha256") for r in group):
                for r in group:
                    r.update(status="review", reason="issue_conflict")
            else:
                for r in group[1:]:
                    r.update(status="excluded", reason="duplicate", canonical=group[0].get("drive_id", group[0]["path"]))
    for group in hashes.values():
        if len({(r["year"], r["month"], int(r["number"])) for r in group}) > 1:
            for r in group:
                r.update(status="review", reason="same_content_different_issue")


def stage(s3, path, row):
    from botocore.exceptions import ClientError
    digest = row["sha256"]
    checksum = base64.b64encode(bytes.fromhex(digest)).decode("ascii")
    key = "staging/boletin-salesiano/" + digest + ".pdf"
    try:
        with path.open("rb") as source:
            s3.put_object(Bucket=BUCKET, Key=key, Body=source, IfNoneMatch="*",
                          ChecksumSHA256=checksum, ContentType="application/pdf")
    except ClientError as error:
        if error.response["ResponseMetadata"]["HTTPStatusCode"] != 412:
            raise
    head = s3.head_object(Bucket=BUCKET, Key=key, ChecksumMode="ENABLED")
    if head.get("ChecksumSHA256") != checksum or head["ContentLength"] != row["bytes"] or not head.get("VersionId"):
        raise ValueError("staged_object_integrity")
    row.update(staging_key=key, version=head["VersionId"], status="staged")


DRIVE_ID = re.compile(r"[A-Za-z0-9_-]+")
FOLDER = "application/vnd.google-apps.folder"


def drive_request(endpoint, params, api_key):
    url = "https://www.googleapis.com/drive/v3/files" + endpoint + "?" + urlencode(params)
    return urlopen(Request(url, headers={"X-Goog-Api-Key": api_key}), timeout=120)


def drive_children(folder_id, api_key):
    if not DRIVE_ID.fullmatch(folder_id):
        raise ValueError("Invalid Drive folder ID")
    params = {"q": f"'{folder_id}' in parents and trashed = false", "pageSize": 1000,
              "fields": "nextPageToken,incompleteSearch,files(id,name,mimeType,size,md5Checksum)"}
    while True:
        with drive_request("", params, api_key) as response:
            data = json.load(response)
        if data.get("incompleteSearch"):
            raise ValueError("Incomplete Drive listing")
        yield from data["files"]
        if not data.get("nextPageToken"):
            break
        params["pageToken"] = data["nextPageToken"]


def cached_pdf(root, item, api_key):
    file_id = item["id"]
    checksum = item.get("md5Checksum", "")
    if not DRIVE_ID.fullmatch(file_id) or not re.fullmatch(r"[0-9a-f]{32}", checksum):
        raise ValueError("Missing or invalid Drive identity or digest")
    size = int(item["size"])
    path = root / (file_id + "-" + checksum + ".pdf")

    def matches(candidate):
        if candidate.stat().st_size != size:
            return False
        with candidate.open("rb") as stream:
            return hashlib.file_digest(stream, "md5").hexdigest() == checksum

    if path.exists() and matches(path):
        return path
    with tempfile.NamedTemporaryFile(dir=root, delete=False) as output:
        temp = Path(output.name)
    try:
        with drive_request("/" + file_id, {"alt": "media"}, api_key) as response, temp.open("wb") as output:
            shutil.copyfileobj(response, output)
        if not matches(temp):
            raise ValueError("Drive size or digest mismatch")
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)
    return path


def drive_inventory(root, folder_id, api_key):
    rows, paths = [], {}
    pending = [(folder_id, Path())]
    visited = set()
    while pending:
        parent, prefix = pending.pop()
        if parent in visited:
            raise ValueError("Repeated Drive folder")
        visited.add(parent)
        for item in drive_children(parent, api_key):
            name = item["name"]
            if "/" in name or name in ("", ".", ".."):
                raise ValueError("Ambiguous Drive path component")
            relative = prefix / name
            if item["mimeType"] == FOLDER:
                pending.append((item["id"], relative))
                continue
            row = {"path": relative.as_posix(), "status": "excluded", "reason": "non_pdf"}
            if item["mimeType"] == "application/pdf":
                path = cached_pdf(root, item, api_key)
                row = inspect_file(root, path, relative)
                if row.get("reason") == "non_pdf":
                    row.update(status="review", reason="pdf_extension_mismatch")
                paths[item["id"]] = path
            row["drive_id"] = item["id"]
            rows.append(row)
    return rows, paths


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("--drive-folder", metavar="FOLDER_ID")
    parser.add_argument("--stage", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve(strict=True)
    if not root.is_dir():
        parser.error("Expected a directory containing annual folders")
    rows = []
    def fail(error):
        raise error
    paths = {}
    if args.drive_folder:
        api_key = os.environ.get("GOOGLE_DRIVE_API_KEY")
        if not api_key:
            parser.error("Drive mode requires GOOGLE_DRIVE_API_KEY")
        rows, paths = drive_inventory(root, args.drive_folder, api_key)
        if not rows or not paths:
            parser.error("Drive listing returned no PDFs")
    else:
        for folder, dirs, files in os.walk(root, onerror=fail):
            for name in sorted(files + [d for d in dirs if (Path(folder) / d).is_symlink()]):
                rows.append(inspect_file(root, Path(folder) / name))
    rows.sort(key=lambda row: (row["path"], row.get("drive_id", "")))
    reconcile(rows)
    if args.stage:
        import boto3
        s3 = boto3.client("s3", region_name="us-east-1")
    failed = False
    for row in rows:
        if args.stage and row["status"] == "candidate":
            try:
                stage(s3, paths[row["drive_id"]] if args.drive_folder else root / row["path"], row)
            except Exception as error:
                row.update(status="transfer_failed", reason=type(error).__name__)
                failed = True
        print(json.dumps(row, ensure_ascii=False), flush=True)
    return int(failed or not rows or any(row["status"] == "review" for row in rows))


if __name__ == "__main__":
    raise SystemExit(main())
