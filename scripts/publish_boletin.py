"""Publish one versioned BC-110 ZIP inventory and index its available PDFs.

Run with private AWS credentials: python scripts/publish_boletin.py INVENTORY_KEY
Requires boto3, disk space for the largest ZIP and the deployed catalogue-aware worker.
"""
import collections
import hashlib
import json
import re
import sys
import tempfile
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

BUCKET = "boscochat-archivo-pdfs"
PUBLICATION = "Boletín Salesiano"
WORKER = "boscochat-pdf-ingestor"


def catalogue(row):
    name = row["member"].split("/")[-1]
    match = re.fullmatch(r"(\d{4})(0[1-9]|1[0-2])[-_]N(\d+)\.pdf", name, re.I)
    if match:
        year, month, number = map(int, match.groups())
        if (year, month, number) != (row["year"], row["month"], row["number"]) or not number:
            raise ValueError(f"Inconsistent catalogue: {name}")
        label = f"{year:04}{month:02} N{number:03}"
    elif name == "189800_N000.pdf" and row["member"].split("/")[-2] == "1898":
        year, label = 1898, "1898 - 189800_N000"
    else:
        raise ValueError(f"Unresolved catalogue: {name}")
    return f"originals/Boletin Salesiano {label}.pdf", year


def publish(s3, worker, archive, row):
    key, year = catalogue(row)
    member = archive.getinfo(row["member"])
    if not row["crc_ok"] or member.file_size != row["bytes"] or not 0 < member.file_size <= 350 * 1024**2:
        raise ValueError(f"Invalid size or CRC: {key}")
    data = archive.read(member)
    digest = hashlib.sha256(data).hexdigest()
    if digest != row["sha256"] or not data.startswith(b"%PDF-"):
        raise ValueError(f"Invalid PDF: {key}")
    try:
        s3.put_object(Bucket=BUCKET, Key=key, Body=data, ContentType="application/pdf",
                      IfNoneMatch="*", Metadata={"sha256": digest})
    except ClientError as exc:
        if exc.response["ResponseMetadata"]["HTTPStatusCode"] != 412:
            raise
        existing = s3.get_object(Bucket=BUCKET, Key=key)["Body"]
        with existing:
            if hashlib.sha256(existing.read()).hexdigest() != digest:
                raise ValueError(f"Different PDF already stored: {key}") from exc
    del data
    payload = {"action": "index-archive-pdf", "key": key,
               "catalog": {"publication": PUBLICATION, "year": year}}
    response = worker.invoke(FunctionName=WORKER, Payload=json.dumps(payload).encode())
    result = json.load(response["Payload"])
    if response.get("FunctionError") or result.get("pages") != row["pages"] or result.get("year") != year:
        raise RuntimeError(f"Indexing failed for {key}: {result}")
    print(json.dumps({"key": key, **result}, ensure_ascii=False), flush=True)
    return result


def run(inventory_key):
    s3 = boto3.client("s3", region_name="us-east-1")
    worker = boto3.client("lambda", region_name="us-east-1",
                          config=Config(read_timeout=920, retries={"total_max_attempts": 1}))
    groups = collections.defaultdict(list)
    keys = set()
    failures = []
    totals = collections.Counter()
    with s3.get_object(Bucket=BUCKET, Key=inventory_key)["Body"] as stream:
        for line in stream.iter_lines():
            row = json.loads(line)
            if row["disposition"] in {"non_pdf", "duplicate", "notice"}:
                continue
            if row["disposition"] not in {"review", "validated", "metadata_review"}:
                raise ValueError(f"Unknown disposition: {row['disposition']}")
            key, _ = catalogue(row)
            if key in keys or not row["zip"].startswith("importaciones/boletin-salesiano/") or not row["version"]:
                raise ValueError(f"Ambiguous source for {key}")
            keys.add(key)
            groups[row["zip"], row["version"]].append(row)
    if not keys:
        raise ValueError("Empty inventory")
    with tempfile.TemporaryDirectory() as folder, ThreadPoolExecutor(max_workers=2) as pool:
        path = Path(folder) / "source.zip"
        for (source, version), rows in groups.items():
            s3.download_file(BUCKET, source, str(path), ExtraArgs={"VersionId": version})
            with zipfile.ZipFile(path) as archive:
                tasks = [(r, pool.submit(publish, s3, worker, archive, r)) for r in rows]
                for row, task in tasks:
                    try:
                        result = task.result()
                        totals.update(documents=1, pages=result["pages"], needs_review=result["needsReview"])
                    except Exception as exc:
                        failures.append(row["member"])
                        print(f"{row['member']}: {exc}", file=sys.stderr, flush=True)
            path.unlink()
    print(json.dumps({"expected": len(keys), **totals, "failed": failures}), flush=True)
    return bool(failures)


if __name__ == "__main__":
    raise SystemExit(run(sys.argv[1]))
