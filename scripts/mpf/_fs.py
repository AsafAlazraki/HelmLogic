"""Shared Firestore REST helpers for the MPF migration scripts (phase 2 MTF).
READ helpers + patch helper (used only by import script with --apply)."""
import json, os, urllib.request, urllib.parse

API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
PROJECT = "studio-2290360004-3b963"
EMAIL = "billh@nsmarine.com.au"
PASSWORD = "Bill2026!"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"

_token = None

def token():
    global _token
    if _token: return _token
    req = urllib.request.Request(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
        data=json.dumps({"email": EMAIL, "password": PASSWORD, "returnSecureToken": True}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        _token = json.load(r)["idToken"]
    return _token

def _req(url, method="GET", body=None):
    # One automatic token refresh on 401 — long applies (>1h) outlive the
    # Firebase idToken lifetime.
    global _token
    for attempt in (1, 2):
        req = urllib.request.Request(url, method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 401 and attempt == 1:
                _token = None  # force re-sign-in
                continue
            raise

def decode_value(v):
    if "stringValue" in v: return v["stringValue"]
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v: return v["doubleValue"]
    if "booleanValue" in v: return v["booleanValue"]
    if "nullValue" in v: return None
    if "timestampValue" in v: return v["timestampValue"]
    if "mapValue" in v: return {k: decode_value(x) for k, x in (v["mapValue"].get("fields") or {}).items()}
    if "arrayValue" in v: return [decode_value(x) for x in (v["arrayValue"].get("values") or [])]
    if "referenceValue" in v: return v["referenceValue"]
    if "geoPointValue" in v: return v["geoPointValue"]
    return v

def encode_value(v):
    if v is None: return {"nullValue": None}
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, float): return {"doubleValue": v}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [encode_value(x) for x in v]}}
    if isinstance(v, dict): return {"mapValue": {"fields": {k: encode_value(x) for k, x in v.items()}}}
    raise TypeError(f"cannot encode {type(v)}")

def decode_doc(d):
    out = {k: decode_value(v) for k, v in (d.get("fields") or {}).items()}
    out["_id"] = d["name"].rsplit("/", 1)[-1]
    out["_path"] = d["name"].split("/documents/")[1]
    return out

def list_docs(path, page_size=300):
    """List all docs in a collection path (relative to /documents)."""
    docs, page_token = [], None
    while True:
        url = f"{BASE}/{urllib.parse.quote(path)}?pageSize={page_size}"
        if page_token: url += f"&pageToken={page_token}"
        res = _req(url)
        docs.extend(res.get("documents", []))
        page_token = res.get("nextPageToken")
        if not page_token: break
    return [decode_doc(d) for d in docs]

def get_doc(path):
    try:
        return decode_doc(_req(f"{BASE}/{urllib.parse.quote(path)}"))
    except urllib.error.HTTPError as e:
        if e.code == 404: return None
        raise

def patch_doc(path, fields, update_mask=None):
    """Merge-patch a document. fields: plain dict. update_mask: list of field paths."""
    url = f"{BASE}/{urllib.parse.quote(path)}"
    params = []
    for m in (update_mask or list(fields.keys())):
        params.append(("updateMask.fieldPaths", m))
    url += "?" + urllib.parse.urlencode(params)
    body = {"fields": {k: encode_value(v) for k, v in fields.items()}}
    return _req(url, method="PATCH", body=body)


def create_doc(collection_path, fields, doc_id=None):
    """Create a document (auto-ID unless doc_id given)."""
    url = f"{BASE}/{urllib.parse.quote(collection_path)}"
    if doc_id:
        url += f"?documentId={urllib.parse.quote(doc_id)}"
    body = {"fields": {k: encode_value(v) for k, v in fields.items()}}
    return _req(url, method="POST", body=body)


def nested_from_dotted(updates):
    """{'a.b': 1, 'c': 2} -> (nested dict for fields, mask list)."""
    nested = {}
    for path, v in updates.items():
        parts = path.split('.')
        cur = nested
        for p in parts[:-1]:
            cur = cur.setdefault(p, {})
        cur[parts[-1]] = v
    return nested, list(updates.keys())
