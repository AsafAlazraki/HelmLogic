#!/usr/bin/env python3
"""Shared helpers for the MPF Phase-2 PARTS wave (extract / diff / import).

Conventions (locked by tasks/mpf-audit/MAPPING.md + phase-2 brief):
- Sources under tasks/mpf-source/ are STRICTLY READ-ONLY.
- All prices stored ex GST; any inc-GST source column is converted (/1.1)
  with the conversion recorded per row.
- Excel error artifacts (#N/A, #DIV/0!, ...) are treated as null / quarantined,
  never imported as values.
- Doc-id slugs are shared between diff-parts.py and import-parts.py so the
  two scripts always agree on identity.
"""
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOURCE_DIR = os.path.join(REPO, "tasks", "mpf-source")
EXTRACT_DIR = os.path.join(REPO, "tasks", "mpf-audit", "extracted")
AUDIT_LOG = os.path.join(REPO, "tasks", "mpf-audit", "AUDIT_LOG.jsonl")
APPLY_LOG = os.path.join(REPO, "tasks", "mpf-audit", "apply-log-parts.jsonl")

ORG_ID = "AcFZVEFA5UDJG2hyetWT"  # Northside Marine
PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
FS_BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
AUTH_EMAIL = "billh@nsmarine.com.au"
AUTH_PASSWORD = "Bill2026!"

EXCEL_ERRORS = {"#N/A", "#DIV/0!", "#REF!", "#VALUE!", "#NAME?", "#NULL!", "#NUM!"}

GST_MULTIPLIER = 1.1


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def slug(s) -> str:
    """Doc-id slug. MUST stay in sync between diff + import."""
    s = str(s).strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")[:200] or "unknown"


def clean_text(v):
    """Normalise a text cell: strip, drop placeholders / nbsp / Excel errors."""
    if v is None:
        return None
    s = str(v).replace("\xa0", " ").strip()
    if s in ("", ".", "-") or s in EXCEL_ERRORS:
        return None
    return s


def clean_number(v, ndigits=4):
    """Numeric cell -> rounded float, or None (Excel errors / text -> None)."""
    if v is None:
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return round(float(v), ndigits)
    s = str(v).replace("\xa0", "").strip()
    if not s or s in EXCEL_ERRORS:
        return None
    try:
        return round(float(s.replace(",", "").replace("$", "")), ndigits)
    except ValueError:
        return None


def money(v):
    return clean_number(v, ndigits=2)


def is_excel_error(v) -> bool:
    return isinstance(v, str) and v.strip() in EXCEL_ERRORS


def ex_gst(inc):
    """Inc-GST -> ex-GST (2dp)."""
    if inc is None:
        return None
    return round(float(inc) / GST_MULTIPLIER, 2)


def write_dataset(filename, meta, rows, **extra):
    os.makedirs(EXTRACT_DIR, exist_ok=True)
    path = os.path.join(EXTRACT_DIR, filename)
    doc = {"_meta": {**meta, "extractedAt": now_iso(), "rowCount": len(rows)}, "rows": rows}
    doc.update(extra)
    with open(path, "w") as f:
        json.dump(doc, f, indent=1, default=str)
    print(f"  wrote {os.path.relpath(path, REPO)}  ({len(rows)} rows, {os.path.getsize(path)//1024} KB)")
    return path


def load_dataset(filename):
    with open(os.path.join(EXTRACT_DIR, filename)) as f:
        return json.load(f)


def append_audit(action, detail):
    with open(AUDIT_LOG, "a") as f:
        f.write(json.dumps({"ts": now_iso(), "action": action, "detail": detail}, default=str) + "\n")


# ---------------------------------------------------------------- Firestore REST

def sign_in():
    """Password sign-in as Bill Hull (NSM org admin). Read scope for diff; writes only via import --apply."""
    import requests
    r = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
        json={"email": AUTH_EMAIL, "password": AUTH_PASSWORD, "returnSecureToken": True},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()["idToken"]


def fs_val(v):
    if "stringValue" in v: return v["stringValue"]
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v: return v["doubleValue"]
    if "booleanValue" in v: return v["booleanValue"]
    if "timestampValue" in v: return v["timestampValue"]
    if "arrayValue" in v: return [fs_val(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v: return {k: fs_val(x) for k, x in v["mapValue"].get("fields", {}).items()}
    if "nullValue" in v: return None
    return v


def fs_fields(doc):
    return {k: fs_val(x) for k, x in doc.get("fields", {}).items()}


def to_fs(v):
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, float): return {"doubleValue": v}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [to_fs(x) for x in v]}}
    if isinstance(v, dict): return {"mapValue": {"fields": {k: to_fs(x) for k, x in v.items()}}}
    if v is None: return {"nullValue": None}
    raise TypeError(f"unsupported firestore value: {type(v)}")


def list_collection(session, headers, path, page_size=300):
    """Full paginated listing -> {docId: fields}. Read-only."""
    out = {}
    token = None
    while True:
        url = f"{FS_BASE}/{path}?pageSize={page_size}"
        if token:
            url += f"&pageToken={token}"
        r = session.get(url, headers=headers, timeout=60)
        if r.status_code != 200:
            return out, r.status_code
        body = r.json()
        for d in body.get("documents", []):
            out[d["name"].split("/")[-1]] = fs_fields(d)
        token = body.get("nextPageToken")
        if not token:
            return out, 200
