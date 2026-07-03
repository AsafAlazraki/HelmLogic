#!/usr/bin/env python3
"""Image remediation — Phase 5 task (images are HYPER priority).

Consumes tasks/test-evidence/image-audit.json (phase5.images layer-1 audit)
and remediates each failure class:

  1. YAMAHA (redirect-to-html, 45 unique URLs on motor rows' SummaryImage):
     retry images.weserv.nl once + direct browser-UA fetch once per URL;
     anything that yields real image bytes -> mirror to Firebase Storage at
     mpf-mirror/motors/{sha1[:16]}.{ext} and PATCH the referencing motor-row
     docs. Unfetchable URLs recorded as 'unfetchable - needs NSM-supplied
     assets' (Incapsula JS challenge blocks both paths).

  2. SHAREPOINT-INTERNAL (7 unique URLs; 306 trailer + 6 dealerFit + 2
     modelOverride refs): probe once (expected auth wall). No equivalent
     public URL field exists on the referencing docs (each trailer doc holds
     exactly one image ref = the SharePoint logo), so DO NOT guess - record
     'needs NSM export' with the full doc list.

  3. NSM-WAF 403 (403-blocked-wall, 164 unique URLs, verified recoverable
     via weserv): mirror each via weserv -> mpf-mirror/dfo/{sha1[:16]}.{ext}
     -> PATCH referencing organisations/{org}/dealerFitSelections docs
     (imageLink + items[*].data['Image Link']). boatModels refs to the same
     host are mirrored but NOT patched (not sanctioned for this pass) -
     mirror URLs recorded in the report, ready to apply.

  4. DEAD (4xx-dead, 4 stacer.com.au URLs): recorded for the NSM report only.

Every Firestore PATCH logs before/after to
tasks/mpf-audit/apply-log-images.jsonl. Idempotent: docs already pointing at
mpf-mirror/ Storage URLs are skipped; Storage objects are reused when they
already exist. After remediation every written Storage URL is RE-PROBED and
the retest lands in image-remediation.json (ledger FFR-15: fail class ->
fix -> retest).

Outputs:
  tasks/test-evidence/image-remediation.json
  tasks/test-evidence/image-remediation.md
  tasks/mpf-audit/AUDIT_LOG.jsonl (append, action=phase5.images.remediated)
"""
import hashlib
import json
import os
import sys
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from urllib.parse import quote

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs  # Firestore REST helpers (sign-in, get_doc, patch_doc)

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVIDENCE_DIR = os.path.join(REPO, "tasks", "test-evidence")
AUDIT_JSON = os.path.join(EVIDENCE_DIR, "image-audit.json")
OUT_JSON = os.path.join(EVIDENCE_DIR, "image-remediation.json")
OUT_MD = os.path.join(EVIDENCE_DIR, "image-remediation.md")
APPLY_LOG = os.path.join(REPO, "tasks", "mpf-audit", "apply-log-images.jsonl")
AUDIT_LOG = os.path.join(REPO, "tasks", "mpf-audit", "AUDIT_LOG.jsonl")

BUCKET = "studio-2290360004-3b963.firebasestorage.app"  # src/firebase/config.ts storageBucket
STORAGE_BASE = f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o"
MIRROR_MARKER = "mpf-mirror%2F"  # url-encoded prefix present in every mirror download URL

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

WORKERS = 5          # polite parallelism against weserv (public service)
FETCH_SLEEP = 0.25   # small pause per weserv fetch

EXT_BY_CT = {"image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg",
             "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
             "image/svg+xml": "svg"}

_log_lock = threading.Lock()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def sniff_image(content_type, body):
    """(is_image, ext) from content-type header + magic bytes."""
    ct = (content_type or "").split(";")[0].strip().lower()
    if body[:8] == b"\x89PNG\r\n\x1a\n":
        return True, "png"
    if body[:3] == b"\xff\xd8\xff":
        return True, "jpg"
    if body[:6] in (b"GIF87a", b"GIF89a"):
        return True, "gif"
    if body[:4] == b"RIFF" and body[8:12] == b"WEBP":
        return True, "webp"
    if len(body) > 12 and body[4:12] in (b"ftypavif", b"ftypavis"):
        return True, "avif"
    if ct in EXT_BY_CT and not body.lstrip()[:15].lower().startswith((b"<!doctype", b"<html")):
        return True, EXT_BY_CT[ct]
    return False, None


def fetch_weserv(url):
    """Fetch a URL through images.weserv.nl. -> (bytes|None, note)."""
    noproto = url.replace("https://", "").replace("http://", "")
    wurl = f"https://images.weserv.nl/?url={quote(noproto, safe='')}"
    try:
        r = requests.get(wurl, timeout=30, headers={"User-Agent": UA})
        ok, ext = sniff_image(r.headers.get("Content-Type"), r.content[:64] if r.content else b"")
        if r.status_code == 200 and ok:
            return r.content, {"via": "weserv", "status": 200, "contentType": r.headers.get("Content-Type"), "ext": ext}
        return None, {"via": "weserv", "status": r.status_code,
                      "contentType": (r.headers.get("Content-Type") or "").split(";")[0]}
    except requests.RequestException as e:
        return None, {"via": "weserv", "status": None, "error": type(e).__name__}
    finally:
        time.sleep(FETCH_SLEEP)


def fetch_direct(url):
    """Direct fetch with a browser UA (goes through the sandbox proxy)."""
    try:
        r = requests.get(url, timeout=20, headers={
            "User-Agent": UA,
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "Accept-Language": "en-AU,en;q=0.9",
            "Referer": f"https://{url.split('/')[2]}/",
        })
        ok, ext = sniff_image(r.headers.get("Content-Type"), r.content[:64] if r.content else b"")
        if r.status_code == 200 and ok:
            return r.content, {"via": "direct", "status": 200, "contentType": r.headers.get("Content-Type"), "ext": ext}
        return None, {"via": "direct", "status": r.status_code,
                      "contentType": (r.headers.get("Content-Type") or "").split(";")[0]}
    except requests.RequestException as e:
        return None, {"via": "direct", "status": None, "error": type(e).__name__}


# ---------------------------------------------------------------- Storage REST

def storage_headers():
    return {"Authorization": f"Bearer {_fs.token()}"}


def storage_object_exists(name):
    """Return existing download URL if the object is already mirrored."""
    r = requests.get(f"{STORAGE_BASE}/{quote(name, safe='')}", headers=storage_headers(), timeout=20)
    if r.status_code == 200:
        tok = r.json().get("downloadTokens")
        if tok:
            return f"{STORAGE_BASE}/{quote(name, safe='')}?alt=media&token={tok.split(',')[0]}"
    return None


def storage_upload(name, body, content_type):
    """uploadType=media upload -> public alt=media token URL."""
    r = requests.post(
        f"{STORAGE_BASE}?uploadType=media&name={quote(name, safe='')}",
        data=body, timeout=60,
        headers={**storage_headers(), "Content-Type": content_type},
    )
    r.raise_for_status()
    meta = r.json()
    tok = meta["downloadTokens"].split(",")[0]
    return f"{STORAGE_BASE}/{quote(name, safe='')}?alt=media&token={tok}"


def mirror_url(url, folder):
    """Fetch (weserv then direct) + upload. -> (downloadUrl|None, attempts[])."""
    h = hashlib.sha1(url.encode()).hexdigest()[:16]
    attempts = []
    body, note = fetch_weserv(url)
    attempts.append(note)
    if body is None:
        body, note = fetch_direct(url)
        attempts.append(note)
    if body is None:
        return None, attempts
    ext = note["ext"]
    name = f"mpf-mirror/{folder}/{h}.{ext}"
    existing = storage_object_exists(name)
    if existing:
        attempts.append({"via": "storage", "reused": True, "object": name})
        return existing, attempts
    ct = {"png": "image/png", "jpg": "image/jpeg", "gif": "image/gif",
          "webp": "image/webp", "avif": "image/avif", "svg": "image/svg+xml"}[ext]
    dl = storage_upload(name, body, ct)
    attempts.append({"via": "storage", "uploaded": True, "object": name, "bytes": len(body)})
    return dl, attempts


# ---------------------------------------------------------------- patch logging

def log_patch(entry):
    with _log_lock:
        with open(APPLY_LOG, "a") as f:
            f.write(json.dumps({"ts": now_iso(), **entry}, default=str) + "\n")


def is_mirrored(value):
    return isinstance(value, str) and "firebasestorage" in value and "mpf-mirror" in value


# ---------------------------------------------------------------- doc patchers

def patch_motor_row(doc_path, field, old_url, new_url):
    """PATCH one motor-row doc's image field (flat field name, e.g. SummaryImage)."""
    doc = _fs.get_doc(doc_path)
    if doc is None:
        return "missing-doc"
    current = doc.get(field)
    if is_mirrored(current):
        return "already-mirrored"
    if current != old_url:
        return f"skipped-value-changed ({str(current)[:80]})"
    _fs.patch_doc(doc_path, {field: new_url})
    log_patch({"action": "patch", "class": "yamaha", "docPath": doc_path, "field": field,
               "before": current, "after": new_url})
    return "patched"


def patch_dealer_fit(doc_path, url_map):
    """PATCH a dealerFitSelections doc: imageLink + items[*].data['Image Link'].
    url_map: {oldUrl: storageUrl}. Whole `items` array rewritten (Firestore
    updateMask cannot target array elements)."""
    doc = _fs.get_doc(doc_path)
    if doc is None:
        return "missing-doc", 0
    fields, mask, before, after = {}, [], {}, {}
    n = 0
    cur = doc.get("imageLink")
    if is_mirrored(cur):
        pass
    elif isinstance(cur, str) and cur in url_map:
        fields["imageLink"] = url_map[cur]
        mask.append("imageLink")
        before["imageLink"], after["imageLink"] = cur, url_map[cur]
        n += 1
    items = doc.get("items")
    if isinstance(items, list):
        changed = False
        new_items = json.loads(json.dumps(items))  # deep copy
        for i, it in enumerate(new_items):
            data = it.get("data") if isinstance(it, dict) else None
            if isinstance(data, dict):
                v = data.get("Image Link")
                if isinstance(v, str) and not is_mirrored(v) and v in url_map:
                    before[f"items[{i}].data['Image Link']"] = v
                    data["Image Link"] = url_map[v]
                    after[f"items[{i}].data['Image Link']"] = url_map[v]
                    changed = True
                    n += 1
        if changed:
            fields["items"] = new_items
            mask.append("items")
    if not fields:
        return "already-mirrored-or-no-match", 0
    _fs.patch_doc(doc_path, fields, update_mask=mask)
    log_patch({"action": "patch", "class": "nsm-403", "docPath": doc_path,
               "before": before, "after": after})
    return "patched", n


# ---------------------------------------------------------------- retest

def probe_storage_url(url):
    try:
        r = requests.get(url, timeout=20, stream=True)
        ct = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        chunk = next(r.iter_content(chunk_size=1024), b"")
        r.close()
        ok = r.status_code == 200 and (ct.startswith("image/") or sniff_image(ct, chunk)[0])
        return {"url": url, "status": r.status_code, "contentType": ct, "ok": bool(ok)}
    except requests.RequestException as e:
        return {"url": url, "status": None, "contentType": None, "ok": False, "error": type(e).__name__}


# ---------------------------------------------------------------- main

def main():
    print("loading audit + signing in ...")
    audit = json.load(open(AUDIT_JSON))
    _fs.token()

    # class -> url -> [ (collection, docPath, field) ]
    by_class = defaultdict(lambda: defaultdict(list))
    for coll_name, coll in audit["collections"].items():
        for b in coll["broken"]:
            by_class[b["class"]][b["url"]].append((coll_name, b["docPath"], b["field"]))

    report = {"meta": {
        "ranAt": now_iso(),
        "task": "phase5.images remediation (ledger FFR-15: fail class -> fix -> retest)",
        "project": "studio-2290360004-3b963",
        "bucket": BUCKET,
        "sourceAudit": "tasks/test-evidence/image-audit.json",
        "applyLog": "tasks/mpf-audit/apply-log-images.jsonl",
        "workers": WORKERS,
    }, "classes": {}}
    all_storage_urls = set()

    # ---------------------------------------------------------- 1. YAMAHA
    yam = by_class.get("redirect-to-html", {})
    print(f"\n[1/4] YAMAHA — {len(yam)} unique URLs, {sum(len(v) for v in yam.values())} refs")
    yam_mirrors, yam_unfetchable = {}, []
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(mirror_url, u, "motors"): u for u in sorted(yam)}
        for fut in as_completed(futs):
            u = futs[fut]
            dl, attempts = fut.result()
            if dl:
                yam_mirrors[u] = {"storageUrl": dl, "attempts": attempts}
                all_storage_urls.add(dl)
            else:
                yam_unfetchable.append({"url": u, "attempts": attempts,
                                        "verdict": "unfetchable — needs NSM-supplied assets",
                                        "refCount": len(yam[u])})
    print(f"  mirrored {len(yam_mirrors)}, unfetchable {len(yam_unfetchable)}")

    yam_patched, yam_skips = 0, defaultdict(int)
    if yam_mirrors:
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = {}
            for u, m in yam_mirrors.items():
                for _coll, doc_path, field in yam[u]:
                    futs[ex.submit(patch_motor_row, doc_path, field, u, m["storageUrl"])] = doc_path
            for fut in as_completed(futs):
                res = fut.result()
                if res == "patched":
                    yam_patched += 1
                else:
                    yam_skips[res.split(" ")[0]] += 1
    report["classes"]["yamaha"] = {
        "class": "redirect-to-html (Incapsula wall)",
        "uniqueUrls": len(yam), "refs": sum(len(v) for v in yam.values()),
        "mirrored": len(yam_mirrors), "mirrors": {u: m["storageUrl"] for u, m in yam_mirrors.items()},
        "docsPatched": yam_patched, "patchSkips": dict(yam_skips),
        "unfetchable": yam_unfetchable,
    }

    # ---------------------------------------------------------- 2. SHAREPOINT
    sp = by_class.get("sharepoint-internal", {})
    print(f"\n[2/4] SHAREPOINT — {len(sp)} unique URLs, {sum(len(v) for v in sp.values())} refs")
    sp_entries = []
    for u in sorted(sp):
        body, note = fetch_direct(u)  # expected auth wall; try once, no guessing
        refs = sp[u]
        sp_entries.append({
            "url": u, "probe": note,
            "fetchable": body is not None,
            "verdict": "needs NSM export" if body is None else "fetched (unexpected) — NOT auto-applied",
            "refCount": len(refs),
            "docs": [{"collection": c, "docPath": d, "field": f} for c, d, f in refs],
        })
    sp_fetchable = sum(1 for e in sp_entries if e["fetchable"])
    print(f"  fetchable {sp_fetchable}/{len(sp_entries)} — all recorded as needs-NSM-export")
    report["classes"]["sharepoint"] = {
        "class": "sharepoint-internal (auth wall)",
        "uniqueUrls": len(sp), "refs": sum(len(v) for v in sp.values()),
        "alternatePublicFieldCheck": (
            "Checked referencing docs: trailer docs carry exactly ONE image field "
            "(imageUrl = the SharePoint brand logo; audit shows 467 refs on 467 docs) and no "
            "public-host URL field (sourceRow is a spreadsheet row number). dealerFitSelections "
            "and modelOverrides refs likewise have no equivalent public URL on the same doc. "
            "No field promotion possible — do not guess."),
        "docsPatched": 0,
        "urls": sp_entries,
    }

    # ---------------------------------------------------------- 3. NSM WAF 403
    nsm = by_class.get("403-blocked-wall", {})
    print(f"\n[3/4] NSM-WAF 403 — {len(nsm)} unique URLs, {sum(len(v) for v in nsm.values())} refs")
    nsm_mirrors, nsm_failed = {}, []
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(mirror_url, u, "dfo"): u for u in sorted(nsm)}
        n = 0
        for fut in as_completed(futs):
            u = futs[fut]
            dl, attempts = fut.result()
            n += 1
            if n % 25 == 0:
                print(f"  mirrored {n}/{len(nsm)} ...")
            if dl:
                nsm_mirrors[u] = dl
                all_storage_urls.add(dl)
            else:
                nsm_failed.append({"url": u, "attempts": attempts, "refCount": len(nsm[u])})
    print(f"  mirrored {len(nsm_mirrors)}, failed {len(nsm_failed)}")

    # group dealerFitSelections refs per doc; boatModels refs recorded, not patched
    dfs_docs = defaultdict(set)   # docPath -> {oldUrl}
    boat_refs = []
    for u, refs in nsm.items():
        for coll, doc_path, field in refs:
            if coll == "dealerFitSelections":
                dfs_docs[doc_path].add(u)
            else:
                boat_refs.append({"collection": coll, "docPath": doc_path, "field": field,
                                  "url": u, "mirrorReady": nsm_mirrors.get(u)})

    dfs_patched, dfs_fields_patched, dfs_skips = 0, 0, defaultdict(int)
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {}
        for doc_path, urls in dfs_docs.items():
            url_map = {u: nsm_mirrors[u] for u in urls if u in nsm_mirrors}
            if url_map:
                futs[ex.submit(patch_dealer_fit, doc_path, url_map)] = doc_path
            else:
                dfs_skips["no-mirror-available"] += 1
        n = 0
        for fut in as_completed(futs):
            res, nfields = fut.result()
            n += 1
            if n % 100 == 0:
                print(f"  patched {n}/{len(futs)} docs ...")
            if res == "patched":
                dfs_patched += 1
                dfs_fields_patched += nfields
            else:
                dfs_skips[res] += 1
    print(f"  dealerFitSelections: {dfs_patched} docs patched ({dfs_fields_patched} field refs), skips={dict(dfs_skips)}")
    report["classes"]["nsm403"] = {
        "class": "403-blocked-wall (NSM WAF; recoverable via weserv)",
        "uniqueUrls": len(nsm), "refs": sum(len(v) for v in nsm.values()),
        "mirrored": len(nsm_mirrors), "mirrorFailures": nsm_failed,
        "mirrors": nsm_mirrors,
        "dealerFitDocsTargeted": len(dfs_docs),
        "dealerFitDocsPatched": dfs_patched,
        "dealerFitFieldRefsPatched": dfs_fields_patched,
        "patchSkips": dict(dfs_skips),
        "boatModelsRefsNotPatched": {
            "note": ("boatModels imageUrl refs hit the same NSM WAF and their mirrors are uploaded "
                     "and ready, but patching boatModels was not sanctioned for this pass — "
                     "listed here for the follow-up."),
            "count": len(boat_refs), "refs": boat_refs,
        },
    }

    # ---------------------------------------------------------- 4. DEAD
    dead = by_class.get("4xx-dead", {})
    print(f"\n[4/4] DEAD — {len(dead)} URLs (report only)")
    report["classes"]["dead"] = {
        "class": "4xx-dead",
        "uniqueUrls": len(dead), "refs": sum(len(v) for v in dead.values()),
        "verdict": "dead at origin (stacer.com.au 404) — for the NSM report; needs refreshed source assets",
        "urls": [{"url": u, "docs": [{"collection": c, "docPath": d, "field": f} for c, d, f in refs]}
                 for u, refs in sorted(dead.items())],
    }

    # ---------------------------------------------------------- retest (FFR-15)
    print(f"\nretesting {len(all_storage_urls)} written Storage URLs ...")
    retest = []
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for fut in as_completed({ex.submit(probe_storage_url, u): u for u in sorted(all_storage_urls)}):
            retest.append(fut.result())
    ok = sum(1 for r in retest if r["ok"])
    print(f"  retest: {ok}/{len(retest)} return 200 image/*")
    report["retest"] = {
        "what": "re-probe of every Storage mirror URL now referenced by patched docs",
        "tested": len(retest), "ok": ok,
        "failures": [r for r in retest if not r["ok"]],
        "results": sorted(retest, key=lambda r: r["url"]),
    }
    report["summary"] = {
        "yamaha": f"{len(yam_mirrors)}/{len(yam)} URLs mirrored, {yam_patched} motor-row docs patched, "
                  f"{len(yam_unfetchable)} unfetchable (needs NSM-supplied assets)",
        "sharepoint": f"0/{len(sp)} fetchable — {sum(len(v) for v in sp.values())} refs need NSM export",
        "nsm403": f"{len(nsm_mirrors)}/{len(nsm)} URLs mirrored, {dfs_patched} dealerFitSelections docs patched "
                  f"({dfs_fields_patched} field refs), {len(boat_refs)} boatModels refs mirrored-not-patched",
        "dead": f"{len(dead)} stacer.com.au URLs recorded for NSM report",
        "retest": f"{ok}/{len(retest)} Storage URLs verified 200 image/*",
    }

    with open(OUT_JSON, "w") as f:
        json.dump(report, f, indent=1, default=str)
    print(f"wrote {os.path.relpath(OUT_JSON, REPO)}")
    write_md(report)

    with open(AUDIT_LOG, "a") as f:
        f.write(json.dumps({"ts": now_iso(), "action": "phase5.images.remediated", "detail": {
            "headline": (f"yamaha {len(yam_mirrors)}/{len(yam)} mirrored ({yam_patched} docs patched); "
                         f"nsm403 {len(nsm_mirrors)}/{len(nsm)} mirrored ({dfs_patched} dealer-fit docs / "
                         f"{dfs_fields_patched} refs patched); sharepoint {sum(len(v) for v in sp.values())} refs "
                         f"need NSM export; {len(dead)} dead; retest {ok}/{len(retest)} storage URLs OK"),
            "counts": report["summary"],
            "bucket": BUCKET,
            "outputs": ["tasks/test-evidence/image-remediation.json",
                        "tasks/test-evidence/image-remediation.md",
                        "tasks/mpf-audit/apply-log-images.jsonl"],
        }}, default=str) + "\n")
    print("appended AUDIT_LOG (action=phase5.images.remediated)")
    print("\n=== SUMMARY ===")
    for k, v in report["summary"].items():
        print(f"{k}: {v}")


def write_md(report):
    s = report["summary"]
    c = report["classes"]
    lines = [
        "# Image Remediation — Phase 5 (follow-up to IMAGE_AUDIT.md)",
        "",
        f"**Ran:** {report['meta']['ranAt']}  |  **Bucket:** `{report['meta']['bucket']}`  |  "
        f"Patch log: `tasks/mpf-audit/apply-log-images.jsonl`  |  Ledger: FFR-15 (fail class → fix → retest)",
        "",
        "| Class | Unique URLs | Refs | Mirrored | Docs patched | Remainder |",
        "|---|---:|---:|---:|---:|---|",
        f"| YAMAHA (Incapsula) | {c['yamaha']['uniqueUrls']} | {c['yamaha']['refs']} | {c['yamaha']['mirrored']} | "
        f"{c['yamaha']['docsPatched']} | {len(c['yamaha']['unfetchable'])} URLs unfetchable — needs NSM-supplied assets |",
        f"| SHAREPOINT-INTERNAL | {c['sharepoint']['uniqueUrls']} | {c['sharepoint']['refs']} | 0 | 0 | needs NSM export (auth wall; no public alternate field on docs) |",
        f"| NSM-WAF 403 | {c['nsm403']['uniqueUrls']} | {c['nsm403']['refs']} | {c['nsm403']['mirrored']} | "
        f"{c['nsm403']['dealerFitDocsPatched']} dealer-fit docs ({c['nsm403']['dealerFitFieldRefsPatched']} field refs) | "
        f"{c['nsm403']['boatModelsRefsNotPatched']['count']} boatModels refs mirrored, patch not sanctioned this pass |",
        f"| DEAD (stacer.com.au) | {c['dead']['uniqueUrls']} | {c['dead']['refs']} | 0 | 0 | for NSM report — needs refreshed assets |",
        "",
        f"**Retest:** {s['retest']} — every Storage URL written into a doc was re-probed after patching.",
        "",
        "## Notes",
        "- Mirrors live at `mpf-mirror/motors/{hash}.{ext}` and `mpf-mirror/dfo/{hash}.{ext}` on the app bucket; "
        "download URLs are token (`alt=media`) URLs, which the app's weserv skip-list already routes direct.",
        "- Idempotent: docs already pointing at `mpf-mirror/` are skipped; existing Storage objects are reused.",
        "- Yamaha `.ashx` URLs serve an Incapsula JS challenge to both weserv (403/404) and direct browser-UA "
        "fetches (200 + 212-byte HTML stub) — genuinely unfetchable from any server-side context.",
        "- SharePoint URLs return the M365 sign-in page anonymously. The referencing trailer docs hold exactly one "
        "image field each (the SharePoint logo), so there is no working field to promote. Full doc list is in "
        "`image-remediation.json → classes.sharepoint.urls[].docs`.",
        "",
        "*Machine-readable detail: `tasks/test-evidence/image-remediation.json`.*",
    ]
    with open(OUT_MD, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"wrote {os.path.relpath(OUT_MD, REPO)}")


if __name__ == "__main__":
    main()
