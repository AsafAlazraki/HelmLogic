#!/usr/bin/env python3
"""
Apply scraped cover image URLs to Highfield model documents in Firestore.

Reads /tmp/highfield_images.json (keys like "CL380", "PA540", "RU200")
and sets coverImageUrl on matching model documents under the correct vendor.

Matching logic: image key is a prefix of the modelCode
  e.g. "PA540" → matches "PA540 open", "PA540ST"
       "RU200" → matches "RU200AL", "RU200KAM"
       "SP700ST" → matches "SP700ST", "SP700WL(Windlass)"  (exact + prefix)

Skips CL380 — already has a proper Firebase Storage image.

Usage: python3 scripts/apply-cover-images.py [--dry-run]
"""

import json
import sys
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

PROJECT_ID = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
FIRESTORE_BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"
DRY_RUN = "--dry-run" in sys.argv

VENDOR_ID = "LafOLpLb6QIFE856TiD4"

RANGE_IDS = {
    "Classic":     "qo7IePnRzJxjrYyLWhTn",
    "Roll-Up":     "EqcKQ51svI1I2Q5poFdl",
    "Ultra-Light": "QsGZuVwutEr5yyMkp97j",
    "Sport":       "nQ2LE50z9Tbf2uss0Ote",
    "Adventure":   "sEzdrM2fZsrOKA3ACrJp",
    "Patrol":      "vfXxDuMpChteKncb7LnG",
    "Coaster":     "coaster",
}

# CL380 already has proper Firebase Storage image
SKIP_MODEL_CODES = {"CL380"}


def get_auth_token() -> str:
    resp = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
        json={"returnSecureToken": True}, timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["idToken"]


def list_models(token: str, range_id: str) -> list[dict]:
    url = f"{FIRESTORE_BASE}/data-warehouse/{VENDOR_ID}/ranges/{range_id}/models"
    headers = {"Authorization": f"Bearer {token}"}
    models = []
    page_token = None
    while True:
        params = {}
        if page_token:
            params["pageToken"] = page_token
        r = requests.get(url, headers=headers, params=params, timeout=20)
        if r.status_code != 200:
            print(f"  ERROR listing {range_id}: {r.status_code}")
            break
        data = r.json()
        for doc in data.get("documents", []):
            doc_id = doc["name"].split("/")[-1]
            fields = doc.get("fields", {})
            model_code = fields.get("modelCode", {}).get("stringValue", "")
            cover = fields.get("coverImageUrl", {}).get("stringValue", "")
            models.append({"id": doc_id, "modelCode": model_code, "coverImageUrl": cover})
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return models


def patch_cover_image(token: str, range_id: str, model_id: str, image_url: str) -> str:
    url = f"{FIRESTORE_BASE}/data-warehouse/{VENDOR_ID}/ranges/{range_id}/models/{model_id}?updateMask.fieldPaths=coverImageUrl"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    body = {"fields": {"coverImageUrl": {"stringValue": image_url}}}
    for attempt in range(3):
        try:
            r = requests.patch(url, headers=headers, json=body, timeout=20)
            if r.status_code == 200:
                return f"OK: {range_id}/{model_id}"
            elif r.status_code == 401:
                return "TOKEN_EXPIRED"
            else:
                if attempt == 2:
                    return f"ERROR {r.status_code}: {range_id}/{model_id} — {r.text[:80]}"
                time.sleep(2 ** attempt)
        except Exception as e:
            if attempt == 2:
                return f"EXCEPTION: {range_id}/{model_id} — {e}"
            time.sleep(2 ** attempt)
    return f"FAILED: {range_id}/{model_id}"


def find_image_for_model(model_code: str, images: dict) -> str | None:
    """
    Try to match a model code to an image key.
    Priority:
      1. Exact match (e.g. "SP700ST" → "SP700ST")
      2. Image key is a prefix of model code (e.g. "PA540" → "PA540 open")
      3. Numeric prefix match for windlass/variant models (e.g. "SP700WL" → "SP700ST")
    """
    # Exact match
    if model_code in images:
        return images[model_code]["coverImageUrl"]

    # Image key as prefix of model code (e.g. "PA540" → "PA540ST")
    upper = model_code.upper()
    for key, val in images.items():
        if upper.startswith(key.upper()):
            return val["coverImageUrl"]

    # Extract numeric part and try matching (e.g. "SP700WL(Windlass)" → match "SP700ST")
    import re
    prefix_match = re.match(r'^([A-Z]+\d+)', upper)
    if prefix_match:
        numeric_prefix = prefix_match.group(1)
        for key, val in images.items():
            if key.upper().startswith(numeric_prefix):
                return val["coverImageUrl"]

    return None


def main():
    print("=" * 60)
    print("Apply Cover Images → Firestore")
    if DRY_RUN:
        print("MODE: DRY RUN")
    print("=" * 60)

    with open("/tmp/highfield_images.json") as f:
        images = json.load(f)
    print(f"Loaded {len(images)} scraped image entries")

    print("\nAuthenticating...")
    token = get_auth_token()
    print(f"  Token: {token[:30]}...")

    updates = []  # (range_id, model_id, model_code, image_url)
    skipped_already_set = 0
    skipped_no_match = []

    print("\nSanning models across all ranges...")
    for range_name, range_id in RANGE_IDS.items():
        models = list_models(token, range_id)
        print(f"  {range_name}: {len(models)} models")
        for m in models:
            model_code = m["modelCode"]
            if model_code in SKIP_MODEL_CODES:
                print(f"    SKIP {model_code} (preserved Firebase Storage image)")
                skipped_already_set += 1
                continue
            image_url = find_image_for_model(model_code, images)
            if image_url:
                updates.append((range_id, m["id"], model_code, image_url))
                print(f"    → {model_code} ({m['id']}) will get image")
            else:
                skipped_no_match.append(model_code)

    print(f"\nReady to update {len(updates)} models")
    print(f"  Preserved: {skipped_already_set}")
    print(f"  No image found for: {sorted(skipped_no_match)}")

    if DRY_RUN:
        print("\n[DRY RUN] No writes performed.")
        return

    print("\nApplying updates...")
    success = 0
    errors = 0

    def do_update(args):
        range_id, model_id, model_code, image_url = args
        return patch_cover_image(token, range_id, model_id, image_url), model_code

    with ThreadPoolExecutor(max_workers=15) as executor:
        futures = {executor.submit(do_update, u): u for u in updates}
        for future in as_completed(futures):
            result, model_code = future.result()
            if result.startswith("OK"):
                success += 1
            elif result == "TOKEN_EXPIRED":
                print("  Token expired, refreshing...")
                token = get_auth_token()
                errors += 1
            else:
                print(f"  !! {result}")
                errors += 1

    print(f"\n{'=' * 60}")
    print(f"COMPLETE: {success} updated, {errors} errors")


if __name__ == "__main__":
    main()
