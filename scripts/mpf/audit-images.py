#!/usr/bin/env python3
"""Image integrity audit — Phase 5 task #18 layer 1 (images are HYPER priority).

READ-ONLY against live Firestore. Collects every image URL reference from:
  - boat models + variants (all vendors: data-warehouse/{v}/ranges/{r}/models[/variants])
  - org modelOverrides (org-level cover-image overrides merged by catalog views)
  - Yamaha/motor rows (data-warehouse/{v}/dataSets/{ds}/rows + masterDataSet)
  - trailer docs (data-warehouse/{v}/series/{s}/trailers + flat trailers)
  - organisations/{org}/dealerFitSelections (doc-level imageLink + items[].data['Image Link'])
  - organisations/{org}/fitUpItems (imageUrl)

Dedupes URLs, probes each unique URL (GET stream, browser UA, 10 workers, 10s
timeout), classifies:
  ok-image / redirect-to-html / 403-blocked-wall / 4xx-dead / timeout /
  sharepoint-internal / not-http-url / data-uri / other

403-blocked-wall is split out from 4xx-dead because it was verified NOT dead:
www.northsidemarine.com.au serves 403+HTML to datacenter probes but the same
URL returns 200 image/png via images.weserv.nl (2026-07-03 spot-check).
Yamaha (.ashx) URLs return 200+HTML (Incapsula challenge) AND weserv gets 404
on them — those genuinely need the Firebase-Storage mirror (v1.11 pattern).

Outputs:
  tasks/test-evidence/image-audit.json   (machine-readable, per-collection)
  tasks/test-evidence/IMAGE_AUDIT.md     (summary + top offenders + remediation)
  tasks/mpf-audit/AUDIT_LOG.jsonl        (append, action=phase5.images)

NO Firestore writes. NO fixes — audit only.
"""
import json
import os
import re
import sys
import threading
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from urllib.parse import urlparse, quote

import requests

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVIDENCE_DIR = os.path.join(REPO, "tasks", "test-evidence")
AUDIT_LOG = os.path.join(REPO, "tasks", "mpf-audit", "AUDIT_LOG.jsonl")

PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
FS_BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
AUTH_EMAIL = "billh@nsmarine.com.au"
AUTH_PASSWORD = "Bill2026!"
ORG_ID = "AcFZVEFA5UDJG2hyetWT"  # Northside Marine

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

# Field names (lowercased) treated as image references when they hold strings.
IMAGE_KEYS = {
    "imageurl", "coverimageurl", "galleryimageurls", "imagelink", "image link",
    "summaryimage", "image url", "image", "heroimageurl", "thumbnailurl",
}

# ---------------------------------------------------------------- Firestore REST

def now_iso():
    return datetime.now(timezone.utc).isoformat()


def sign_in():
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


_tls = threading.local()
_token = None
_token_lock = threading.Lock()


def get_session():
    if not hasattr(_tls, "s"):
        s = requests.Session()
        s.headers["Authorization"] = f"Bearer {_token}"
        _tls.s = s
    return _tls.s


def list_collection(path, page_size=300):
    """Full paginated listing -> [(docPath, fieldsDict)]. Read-only.
    Returns [] for missing/empty collections."""
    s = get_session()
    out, token = [], None
    while True:
        url = f"{FS_BASE}/{quote(path)}?pageSize={page_size}"
        if token:
            url += f"&pageToken={token}"
        for attempt in range(4):
            try:
                r = s.get(url, timeout=60)
                break
            except requests.RequestException:
                if attempt == 3:
                    raise
        if r.status_code == 403:
            print(f"  [WARN] 403 on {path} (rules deny read) — skipping", file=sys.stderr)
            return out
        if r.status_code != 200:
            print(f"  [WARN] {r.status_code} on {path} — skipping", file=sys.stderr)
            return out
        body = r.json()
        for d in body.get("documents", []):
            doc_path = d["name"].split("/documents/")[1]
            fields = {k: fs_val(v) for k, v in d.get("fields", {}).items()}
            out.append((doc_path, fields))
        token = body.get("nextPageToken")
        if not token:
            return out


# ---------------------------------------------------------------- ref collection

def walk_image_refs(obj, field_prefix=""):
    """Recursively collect (fieldPath, value) for image-named string fields."""
    refs = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            fp = f"{field_prefix}.{k}" if field_prefix else k
            if k.lower() in IMAGE_KEYS:
                if isinstance(v, str) and v.strip():
                    refs.append((fp, v.strip()))
                elif isinstance(v, list):
                    for i, x in enumerate(v):
                        if isinstance(x, str) and x.strip():
                            refs.append((f"{fp}[{i}]", x.strip()))
            elif isinstance(v, (dict, list)):
                refs.extend(walk_image_refs(v, fp))
    elif isinstance(obj, list):
        for i, x in enumerate(obj):
            if isinstance(x, (dict, list)):
                refs.extend(walk_image_refs(x, f"{field_prefix}[{i}]"))
    return refs


def scan_docs(group, docs, registry, doc_stats):
    """docs: [(docPath, fields)]. Registers refs into registry[url] and counts."""
    st = doc_stats[group]
    for doc_path, fields in docs:
        st["totalDocs"] += 1
        refs = walk_image_refs(fields)
        if refs:
            st["docsWithImage"] += 1
            st["refCount"] += len(refs)
            for field_path, url in refs:
                registry[url].append({"docPath": doc_path, "field": field_path, "group": group})


# ---------------------------------------------------------------- collection walkers

def collect_all():
    registry = defaultdict(list)  # url -> [ref, ...]
    doc_stats = defaultdict(lambda: {"totalDocs": 0, "docsWithImage": 0, "refCount": 0})

    vendors = list_collection("data-warehouse")
    print(f"vendors: {len(vendors)}")
    vendor_meta = {}
    for path, f in vendors:
        vid = path.rsplit("/", 1)[-1]
        vendor_meta[vid] = {
            "name": f.get("name") or f.get("slug") or vid,
            "type": f.get("vendorType") or "",
            "slug": f.get("slug") or "",
        }
        # vendor doc itself can carry logo/cover images — count under vendors group
        scan_docs("vendors", [(path, f)], registry, doc_stats)

    tasks = []  # (group, collection_path, needs_fanout)
    ex = ThreadPoolExecutor(max_workers=10)
    futures = {}

    def submit_list(group, path):
        futures[ex.submit(list_collection, path)] = (group, path)

    for vid, m in vendor_meta.items():
        vt = m["type"]
        is_boat = "Boat" in vt
        is_motor = "Motor" in vt
        is_trailer = "Trailer" in vt
        untyped = not vt
        if is_boat or untyped:
            submit_list(f"boats/{m['name']}/ranges", f"data-warehouse/{vid}/ranges")
        if is_motor or untyped:
            submit_list(f"motors/{m['name']}/masterDataSet", f"data-warehouse/{vid}/masterDataSet")
            submit_list(f"motors/{m['name']}/dataSets", f"data-warehouse/{vid}/dataSets")
        if is_trailer or untyped:
            submit_list(f"trailers/{m['name']}/series", f"data-warehouse/{vid}/series")
            submit_list(f"trailers/{m['name']}/flat", f"data-warehouse/{vid}/trailers")

    submit_list("dealerFitSelections", f"organisations/{ORG_ID}/dealerFitSelections")
    submit_list("fitUpItems", f"organisations/{ORG_ID}/fitUpItems")
    submit_list("fitUpPackages", f"organisations/{ORG_ID}/fitUpPackages")
    submit_list("modelOverrides", f"organisations/{ORG_ID}/modelOverrides")

    # fan-out queue processed iteratively: ranges -> models -> variants,
    # dataSets -> rows, series -> trailers
    while futures:
        done_map, futures_new = dict(futures), {}
        futures.clear()
        for fut in as_completed(done_map):
            group, path = done_map[fut]
            try:
                docs = fut.result()
            except Exception as e:
                print(f"  [WARN] list failed {path}: {e}", file=sys.stderr)
                continue
            if group.endswith("/ranges"):
                base = group.rsplit("/ranges", 1)[0]  # boats/{vendor}
                for dp, _f in docs:
                    futures_new[ex.submit(list_collection, f"{dp}/models")] = (f"{base}/models", f"{dp}/models")
            elif group.endswith("/models"):
                base = group.rsplit("/models", 1)[0]
                scan_docs(f"{base}/models", docs, registry, doc_stats)
                for dp, _f in docs:
                    futures_new[ex.submit(list_collection, f"{dp}/variants")] = (f"{base}/variants", f"{dp}/variants")
            elif group.endswith("/dataSets"):
                base = group.rsplit("/dataSets", 1)[0]
                for dp, _f in docs:
                    futures_new[ex.submit(list_collection, f"{dp}/rows")] = (f"{base}/rows", f"{dp}/rows")
            elif group.endswith("/series"):
                base = group.rsplit("/series", 1)[0]
                for dp, _f in docs:
                    futures_new[ex.submit(list_collection, f"{dp}/trailers")] = (f"{base}/trailers", f"{dp}/trailers")
            else:
                scan_docs(group, docs, registry, doc_stats)
        futures.update(futures_new)

    ex.shutdown(wait=True)
    return registry, dict(doc_stats)


# ---------------------------------------------------------------- probing

def classify_pre(url):
    """Classification decidable from the URL alone (no probe)."""
    u = url.lower()
    if u.startswith("data:"):
        return "data-uri"
    if not (u.startswith("http://") or u.startswith("https://")):
        return "not-http-url"
    host = urlparse(url).netloc.lower()
    if "sharepoint.com" in host or "sharepoint" in host or "1drv.ms" in host or "onedrive" in host:
        return "sharepoint-internal"
    return None


def probe(url):
    pre = classify_pre(url)
    if pre:
        return {"url": url, "class": pre, "status": None, "contentType": None, "bytes": None, "finalHost": None}
    try:
        r = requests.get(
            url, stream=True, timeout=10, allow_redirects=True,
            headers={"User-Agent": UA, "Accept": "image/avif,image/webp,image/*,*/*;q=0.8"},
        )
        status = r.status_code
        ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        clen = r.headers.get("Content-Length")
        nbytes = int(clen) if clen and clen.isdigit() else None
        chunk = b""
        try:
            chunk = next(r.iter_content(chunk_size=2048), b"")
        except Exception:
            pass
        finally:
            r.close()
        if nbytes is None:
            nbytes = len(chunk)
        final_host = urlparse(r.url).netloc.lower()
        # sniff: some CDNs lie about content-type
        looks_image = ctype.startswith("image/") or chunk[:4] in (b"\x89PNG", b"RIFF") \
            or chunk[:3] == b"\xff\xd8\xff" or chunk[:6] in (b"GIF87a", b"GIF89a") \
            or (len(chunk) > 12 and chunk[4:12] == b"ftypavif")
        looks_html = ctype in ("text/html", "application/xhtml+xml") or chunk.lstrip()[:15].lower().startswith((b"<!doctype html", b"<html"))
        if 200 <= status < 300:
            if looks_image:
                cls = "ok-image"
            elif looks_html:
                cls = "redirect-to-html"
            else:
                cls = "other"
        elif status == 403:
            # WAF/anti-hotlink wall, not necessarily dead (NSM host verified
            # recoverable via weserv). Distinct remediation from true 404s.
            cls = "403-blocked-wall"
        elif 400 <= status < 500:
            cls = "4xx-dead"
        else:
            cls = "other"
        return {"url": url, "class": cls, "status": status, "contentType": ctype or None,
                "bytes": nbytes, "finalHost": final_host}
    except requests.Timeout:
        return {"url": url, "class": "timeout", "status": None, "contentType": None, "bytes": None,
                "finalHost": urlparse(url).netloc.lower()}
    except requests.RequestException as e:
        return {"url": url, "class": "timeout" if "timed out" in str(e).lower() else "other",
                "status": None, "contentType": None, "bytes": None,
                "finalHost": urlparse(url).netloc.lower(), "error": type(e).__name__}


# ---------------------------------------------------------------- main

BAD_CLASSES = ("redirect-to-html", "403-blocked-wall", "4xx-dead", "timeout",
               "sharepoint-internal", "not-http-url", "other")


def rollup_group(g):
    """Collapse per-vendor granularity to the reporting collection level."""
    if g.startswith("boats/"):
        return "boatModels" if g.endswith("/models") else "boatVariants"
    if g.startswith("motors/"):
        return "motorRows"
    if g.startswith("trailers/"):
        return "trailers"
    return g


def main():
    global _token
    print("signing in...")
    _token = sign_in()

    print("collecting image refs from Firestore (read-only)...")
    registry, doc_stats = collect_all()
    unique_urls = sorted(registry.keys())
    print(f"unique URLs: {len(unique_urls)} across {sum(len(v) for v in registry.values())} refs")

    print("probing (10 workers, 10s timeout)...")
    results = {}
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs = {ex.submit(probe, u): u for u in unique_urls}
        n = 0
        for fut in as_completed(futs):
            res = fut.result()
            results[res["url"]] = res
            n += 1
            if n % 50 == 0:
                print(f"  {n}/{len(unique_urls)}")

    # ---- aggregate per rolled-up collection
    coll = {}
    for g, st in doc_stats.items():
        rg = rollup_group(g)
        c = coll.setdefault(rg, {"totalDocs": 0, "docsWithImage": 0, "refCount": 0,
                                 "probeBreakdown": Counter(), "broken": []})
        c["totalDocs"] += st["totalDocs"]
        c["docsWithImage"] += st["docsWithImage"]
        c["refCount"] += st["refCount"]

    for url, refs in registry.items():
        res = results[url]
        for ref in refs:
            rg = rollup_group(ref["group"])
            coll[rg]["probeBreakdown"][res["class"]] += 1
            if res["class"] in BAD_CLASSES:
                coll[rg]["broken"].append({
                    "url": url, "class": res["class"], "status": res["status"],
                    "docPath": ref["docPath"], "field": ref["field"],
                })

    host_fail = Counter()
    for url, res in results.items():
        if res["class"] in BAD_CLASSES:
            host = urlparse(url).netloc.lower() or "(non-url)"
            host_fail[host] += 1

    overall = Counter(r["class"] for r in results.values())
    total_docs = sum(c["totalDocs"] for c in coll.values())
    docs_with = sum(c["docsWithImage"] for c in coll.values())

    for c in coll.values():
        c["coveragePct"] = round(100 * c["docsWithImage"] / c["totalDocs"], 1) if c["totalDocs"] else None
        c["probeBreakdown"] = dict(c["probeBreakdown"])
        c["broken"].sort(key=lambda b: (b["class"], b["url"]))
        c["brokenCount"] = len(c["broken"])

    report = {
        "meta": {
            "auditedAt": now_iso(),
            "task": "phase5.images (task #18 layer 1)",
            "project": PROJECT,
            "orgId": ORG_ID,
            "readOnly": True,
            "uniqueUrls": len(unique_urls),
            "totalRefs": sum(len(v) for v in registry.values()),
            "totalDocsScanned": total_docs,
            "docsWithImage": docs_with,
            "overallProbeBreakdown": dict(overall),
        },
        "collections": coll,
        "topOffendingHosts": host_fail.most_common(15),
        "rawGroupStats": doc_stats,
    }

    os.makedirs(EVIDENCE_DIR, exist_ok=True)
    json_path = os.path.join(EVIDENCE_DIR, "image-audit.json")
    with open(json_path, "w") as f:
        json.dump(report, f, indent=1, default=str)
    print(f"wrote {os.path.relpath(json_path, REPO)}")

    write_markdown(report)
    append_audit(report)
    print_summary(report)


REMEDIATION = {
    "403-blocked-wall": "WAF/anti-hotlink 403 — the asset is NOT dead. Verified 2026-07-03: a www.northsidemarine.com.au 403 URL returns 200 image/png via images.weserv.nl. Route rendering through the weserv image-preload pipeline (already in the app since v1.11), or mirror to Firebase Storage.",
    "4xx-dead": "Dead link (404/410). MPF-sourced links: report list to NSM for refreshed source data; catalog-authored links: re-upload via the v1.11 motor-photo pattern (mirror to Firebase Storage).",
    "redirect-to-html": "Anti-hotlink wall serving an HTML challenge with HTTP 200 (Yamaha = Incapsula). Verified 2026-07-03: weserv gets 404 on these — the weserv pipeline CANNOT recover them (hence WESERV_SKIP_HOSTS). Mirror to Firebase Storage per the v1.11 motor-photo pattern.",
    "sharepoint-internal": "SharePoint/OneDrive internal URL — requires an authed session; will never render for customers. Mirror the asset to Firebase Storage and rewrite the field.",
    "timeout": "Host unreachable within 10s. Re-probe before acting; persistent offenders should be mirrored to Firebase Storage.",
    "not-http-url": "Not an http(s) URL (local/UNC path or bare filename from a source spreadsheet). Cannot render in-app; needs the real asset sourced + uploaded to Firebase Storage.",
    "other": "Unexpected response (5xx / non-image non-html payload / connection error). Re-probe; mirror if persistent.",
}


def write_markdown(report):
    m = report["meta"]
    lines = []
    lines.append("# Image Integrity Audit — Phase 5 (task #18, layer 1)")
    lines.append("")
    lines.append(f"**Audited:** {m['auditedAt']}  |  **Project:** `{m['project']}`  |  READ-ONLY (no fixes applied)")
    lines.append("")
    lines.append(f"Scanned **{m['totalDocsScanned']:,} docs**, found **{m['totalRefs']:,} image refs** "
                 f"(**{m['uniqueUrls']:,} unique URLs**). Docs with at least one image: "
                 f"**{m['docsWithImage']:,}** ({100*m['docsWithImage']/max(m['totalDocsScanned'],1):.1f}%).")
    lines.append("")
    lines.append("## Coverage + probe results per collection")
    lines.append("")
    lines.append("| Collection | Docs | With image | Coverage | Refs | OK | Broken/blocked (by class) |")
    lines.append("|---|---:|---:|---:|---:|---:|---|")
    for name in sorted(report["collections"], key=lambda k: -report["collections"][k]["totalDocs"]):
        c = report["collections"][name]
        bd = c["probeBreakdown"]
        ok = bd.get("ok-image", 0) + bd.get("data-uri", 0)
        bad = ", ".join(f"{k}: {v}" for k, v in sorted(bd.items()) if k in BAD_CLASSES) or "—"
        cov = f"{c['coveragePct']}%" if c["coveragePct"] is not None else "n/a"
        lines.append(f"| `{name}` | {c['totalDocs']:,} | {c['docsWithImage']:,} | {cov} | {c['refCount']:,} | {ok:,} | {bad} |")
    lines.append("")
    lines.append("## Overall probe breakdown (unique URLs)")
    lines.append("")
    for k, v in sorted(m["overallProbeBreakdown"].items(), key=lambda kv: -kv[1]):
        lines.append(f"- **{k}**: {v}")
    lines.append("")
    lines.append("## Top offending hosts (unique failing URLs)")
    lines.append("")
    if report["topOffendingHosts"]:
        lines.append("| Host | Failing URLs |")
        lines.append("|---|---:|")
        for host, n in report["topOffendingHosts"]:
            lines.append(f"| `{host}` | {n} |")
    else:
        lines.append("None — every probed URL is healthy.")
    lines.append("")
    lines.append("## Recommended remediation per class")
    lines.append("")
    present = set()
    for c in report["collections"].values():
        present.update(k for k in c["probeBreakdown"] if k in BAD_CLASSES)
    for cls in BAD_CLASSES:
        if cls in present:
            lines.append(f"- **{cls}** — {REMEDIATION[cls]}")
    if not present:
        lines.append("- No broken or blocked images found. No remediation required.")
    lines.append("")
    lines.append("## Broken / blocked URLs (full list, per collection)")
    lines.append("")
    for name, c in sorted(report["collections"].items()):
        if not c["broken"]:
            continue
        lines.append(f"### `{name}` — {c['brokenCount']} refs")
        lines.append("")
        lines.append("| Class | Status | URL | Doc | Field |")
        lines.append("|---|---|---|---|---|")
        for b in c["broken"][:400]:
            u = b["url"] if len(b["url"]) <= 110 else b["url"][:107] + "..."
            lines.append(f"| {b['class']} | {b['status'] or '—'} | {u} | `{b['docPath']}` | `{b['field']}` |")
        if c["brokenCount"] > 400:
            lines.append(f"| … | | +{c['brokenCount']-400} more (see image-audit.json) | | |")
        lines.append("")
    lines.append("---")
    lines.append("*Full machine-readable detail: `tasks/test-evidence/image-audit.json`. "
                 "Remediation is a follow-up task — this audit made no writes.*")
    md_path = os.path.join(EVIDENCE_DIR, "IMAGE_AUDIT.md")
    with open(md_path, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"wrote {os.path.relpath(md_path, REPO)}")


def append_audit(report):
    m = report["meta"]
    cov = {name: f"{c['coveragePct']}% ({c['docsWithImage']}/{c['totalDocs']})"
           for name, c in report["collections"].items()}
    broken = sum(c["brokenCount"] for c in report["collections"].values())
    entry = {
        "ts": now_iso(),
        "action": "phase5.images",
        "detail": {
            "headline": f"image coverage {m['docsWithImage']}/{m['totalDocsScanned']} docs "
                        f"({100*m['docsWithImage']/max(m['totalDocsScanned'],1):.1f}%), "
                        f"{m['uniqueUrls']} unique URLs probed, {broken} broken/blocked refs",
            "coverageByCollection": cov,
            "probeBreakdown": m["overallProbeBreakdown"],
            "outputs": ["tasks/test-evidence/image-audit.json", "tasks/test-evidence/IMAGE_AUDIT.md"],
            "readOnly": True,
        },
    }
    os.makedirs(os.path.dirname(AUDIT_LOG), exist_ok=True)
    with open(AUDIT_LOG, "a") as f:
        f.write(json.dumps(entry, default=str) + "\n")
    print(f"appended AUDIT_LOG (action=phase5.images)")


def print_summary(report):
    print("\n=== SUMMARY ===")
    for name, c in sorted(report["collections"].items()):
        cov = f"{c['coveragePct']}%" if c["coveragePct"] is not None else "n/a"
        print(f"{name}: {c['docsWithImage']}/{c['totalDocs']} docs with image ({cov}), "
              f"{c['refCount']} refs, broken={c['brokenCount']} {c['probeBreakdown']}")
    print("hosts:", report["topOffendingHosts"][:8])


if __name__ == "__main__":
    main()
