#!/usr/bin/env python3
"""v1.34 — mirror every CDN-hosted motor image to our Storage.

Motor rows: 122 SummaryImage URLs still point at yamaha-motor.com.au
(Incapsula-fronted; blocks server fetch, 404s weserv, and the customer
PDF collapses the slot). This walks every Yamaha motor row whose image
is NOT already on our Storage, attempts weserv -> direct browser-UA ->
weserv-with-referer, mirrors winners to mpf-mirror/motors/{sha1[:16]}
.{ext}, and patches the row's SummaryImage + imageUrl. Idempotent:
rows already on firebasestorage/mpf-mirror are skipped.

Unfetchable URLs are listed at the end — that residue is the standing
NSM asset ask (they own the originals).

DRY-RUN by default (fetch test only, no writes); --apply mirrors+patches.
Log: tasks/mpf-audit/apply-log-motor-images.jsonl
"""
import hashlib, json, os, sys, time
from datetime import datetime, timezone
from urllib.parse import quote

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs  # noqa: E402

VENDOR = "mRAzkE8PUX8GMHELCvJo"
DS = "FQ5uTMyUorrJPlpbWIY8"
ROWS = f"data-warehouse/{VENDOR}/dataSets/{DS}/rows"
BUCKET = "studio-2290360004-3b963.firebasestorage.app"
STORAGE_BASE = f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
LOG = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                   "tasks", "mpf-audit", "apply-log-motor-images.jsonl")

IMG_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}


def is_image(resp):
    ct = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
    return ct in IMG_TYPES and len(resp.content) > 2000, ct


def try_fetch(url):
    """-> (bytes, ext, how) or (None, None, notes)."""
    notes = []
    # 1. weserv
    noproto = url.replace("https://", "").replace("http://", "")
    try:
        r = requests.get(f"https://images.weserv.nl/?url={quote(noproto, safe='')}&w=900&output=jpg&q=80",
                         timeout=30, headers={"User-Agent": UA})
        ok, ct = is_image(r)
        if r.status_code == 200 and ok:
            return r.content, "jpg", "weserv"
        notes.append(f"weserv:{r.status_code}/{ct}")
    except Exception as e:
        notes.append(f"weserv:err {str(e)[:40]}")
    # 2. direct browser-UA with referer
    try:
        r = requests.get(url, timeout=30, headers={
            "User-Agent": UA, "Referer": "https://www.yamaha-motor.com.au/",
            "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*"})
        ok, ct = is_image(r)
        if r.status_code == 200 and ok:
            return r.content, IMG_TYPES.get(ct, "jpg"), "direct"
        notes.append(f"direct:{r.status_code}/{ct}")
    except Exception as e:
        notes.append(f"direct:err {str(e)[:40]}")
    return None, None, "; ".join(notes)


def storage_upload(name, body, ext):
    ct = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif"}[ext]
    r = requests.post(f"{STORAGE_BASE}?uploadType=media&name={quote(name, safe='')}",
                      data=body, timeout=60,
                      headers={"Content-Type": ct, "Authorization": f"Bearer {_fs.token()}"})
    r.raise_for_status()
    tok = r.json().get("downloadTokens")
    return f"{STORAGE_BASE}/{quote(name, safe='')}?alt=media" + (f"&token={tok}" if tok else "")


def main():
    apply = "--apply" in sys.argv
    rows = _fs.list_docs(ROWS)
    targets = []
    for r in rows:
        img = str(r.get("SummaryImage") or "").strip()
        if not img:
            continue
        if "firebasestorage" in img:
            continue  # already mirrored
        targets.append((r["_id"], str(r.get("MODEL CODE") or r.get("MODEL") or r["_id"]), img))
    print(f"{len(targets)} CDN-hosted motor images to attempt · mode: {'APPLY' if apply else 'DRY-RUN'}")

    mirrored, failed = [], []
    with open(LOG, "a") as log:
        for i, (rid, code, url) in enumerate(targets):
            body, ext, how = try_fetch(url)
            if body is None:
                failed.append((code, url, how))
                print(f"  [{i+1}/{len(targets)}] FAIL {code}: {how}")
                continue
            if not apply:
                mirrored.append((code, how, len(body)))
                print(f"  [{i+1}/{len(targets)}] OK   {code}: {how} ({len(body)//1024}KB) — dry-run, not written")
                continue
            sha = hashlib.sha1(url.encode()).hexdigest()[:16]
            name = f"mpf-mirror/motors/{sha}.{ext}"
            dl = storage_upload(name, body, ext)
            _fs.patch_doc(f"{ROWS}/{rid}", {"SummaryImage": dl, "imageUrl": dl,
                                            "imageMirroredFrom": url},
                          update_mask=["SummaryImage", "imageUrl", "imageMirroredFrom"])
            log.write(json.dumps({"at": datetime.now(timezone.utc).isoformat(), "row": rid,
                                  "code": code, "from": url, "to": dl, "via": how}) + "\n")
            mirrored.append((code, how, len(body)))
            print(f"  [{i+1}/{len(targets)}] MIRRORED {code} via {how}")
            time.sleep(0.2)

    print(f"\nRESULT: {len(mirrored)} fetched, {len(failed)} unfetchable")
    if failed:
        print("Unfetchable (NSM asset ask):")
        for code, url, how in failed[:20]:
            print(f"  {code}: {how}")
        json.dump([{"code": c, "url": u, "notes": n} for c, u, n in failed],
                  open("test-results/motor-images-unfetchable.json", "w"), indent=1)


if __name__ == "__main__":
    main()
