#!/usr/bin/env python3
"""
Fix missing coverImageUrl on Classic range model documents in Firestore.

For models missing a cover image, uses the first available color variant image
from the COLOR_IMAGES map as the coverImageUrl. This gives every model card
a visible image in the catalog.

Usage: python3 scripts/fix-classic-cover-images.py [--dry-run]
"""

import sys
import time
import requests

PROJECT_ID = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
FIRESTORE_BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"
DRY_RUN = "--dry-run" in sys.argv

VENDOR_ID = "LafOLpLb6QIFE856TiD4"
CLASSIC_RANGE_ID = "qo7IePnRzJxjrYyLWhTn"

# Cover images for Classic range models
# Using the first (best) color variant render as the cover image
# Source: highfieldboats.com wp-content uploads
# Fallback images for models with missing or broken (404) coverImageUrl
# Uses www.highfieldboats.com color variant renders as cover images
CLASSIC_COVER_IMAGES = {
    "CL380": "https://www.highfieldboats.com/wp-content/uploads/2024/07/CL400-LG-W-WD-1.jpg",  # No image at all — use CL400 (same hull family)
}

# Models with 404 coverImageUrl that need replacing
BROKEN_URL_REPLACEMENTS = {
    "CL380LS": "https://www.highfieldboats.com/wp-content/uploads/2024/07/CL400-LG-W-WD-1.jpg",
    "CL380MAX": "https://www.highfieldboats.com/wp-content/uploads/2024/07/CL400-LG-W-WD-1.jpg",
}


def get_auth_token() -> str:
    resp = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
        json={"returnSecureToken": True}, timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["idToken"]


def list_models(token: str) -> list[dict]:
    url = f"{FIRESTORE_BASE}/data-warehouse/{VENDOR_ID}/ranges/{CLASSIC_RANGE_ID}/models"
    headers = {"Authorization": f"Bearer {token}"}
    models = []
    page_token = None
    while True:
        params = {}
        if page_token:
            params["pageToken"] = page_token
        r = requests.get(url, headers=headers, params=params, timeout=20)
        if r.status_code != 200:
            print(f"  ERROR listing models: {r.status_code} {r.text[:100]}")
            break
        data = r.json()
        for doc in data.get("documents", []):
            doc_id = doc["name"].split("/")[-1]
            fields = doc.get("fields", {})
            model_code = fields.get("modelCode", {}).get("stringValue", "")
            name = fields.get("name", {}).get("stringValue", "")
            cover = fields.get("coverImageUrl", {}).get("stringValue", "")
            models.append({"id": doc_id, "modelCode": model_code, "name": name, "coverImageUrl": cover})
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return models


def patch_cover_image(token: str, model_id: str, image_url: str) -> str:
    url = f"{FIRESTORE_BASE}/data-warehouse/{VENDOR_ID}/ranges/{CLASSIC_RANGE_ID}/models/{model_id}?updateMask.fieldPaths=coverImageUrl"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    body = {"fields": {"coverImageUrl": {"stringValue": image_url}}}
    for attempt in range(3):
        try:
            r = requests.patch(url, headers=headers, json=body, timeout=20)
            if r.status_code == 200:
                return "OK"
            elif r.status_code == 401:
                return "TOKEN_EXPIRED"
            else:
                if attempt == 2:
                    return f"ERROR {r.status_code}: {r.text[:80]}"
                time.sleep(2 ** attempt)
        except Exception as e:
            if attempt == 2:
                return f"EXCEPTION: {e}"
            time.sleep(2 ** attempt)
    return "FAILED"


def find_cover_image(model_code: str) -> str | None:
    """Find a cover image for a model code by matching against known images."""
    # Exact match
    if model_code in CLASSIC_COVER_IMAGES:
        return CLASSIC_COVER_IMAGES[model_code]

    # Strip suffix variants (e.g. CL340FT → CL340, CL310LS → CL310)
    import re
    base_match = re.match(r'^(CL\d+)', model_code)
    if base_match:
        base = base_match.group(1)
        if base in CLASSIC_COVER_IMAGES:
            return CLASSIC_COVER_IMAGES[base]

    return None


def main():
    print("=" * 60)
    print("Fix Classic Range Cover Images")
    if DRY_RUN:
        print("MODE: DRY RUN (no writes)")
    print("=" * 60)

    print("\nAuthenticating...")
    token = get_auth_token()
    print(f"  Token: {token[:30]}...")

    print(f"\nListing Classic range models...")
    models = list_models(token)
    print(f"  Found {len(models)} models")

    needs_fix = []
    already_ok = []
    no_image = []

    for m in models:
        code = m["modelCode"]
        # Check if this model has a known broken URL that needs replacing
        if code in BROKEN_URL_REPLACEMENTS:
            needs_fix.append((m["id"], code, BROKEN_URL_REPLACEMENTS[code]))
            print(f"  → {code} — broken URL, will replace")
        elif m["coverImageUrl"]:
            already_ok.append(code)
            print(f"  ✓ {code} — {m['coverImageUrl'][:80]}")
        else:
            img = find_cover_image(code)
            if img:
                needs_fix.append((m["id"], code, img))
                print(f"  → {code} — will set cover image")
            else:
                no_image.append(code)
                print(f"  ✗ {code} — no image available")

    print(f"\nSummary:")
    print(f"  Already OK: {len(already_ok)}")
    print(f"  Will fix: {len(needs_fix)}")
    print(f"  No image: {len(no_image)} — {sorted(no_image)}")

    if DRY_RUN:
        print("\n[DRY RUN] No writes performed.")
        return

    if not needs_fix:
        print("\nNothing to fix!")
        return

    print(f"\nApplying {len(needs_fix)} updates...")
    success = 0
    errors = 0

    for model_id, code, img_url in needs_fix:
        result = patch_cover_image(token, model_id, img_url)
        if result == "OK":
            success += 1
            print(f"  ✓ {code}")
        elif result == "TOKEN_EXPIRED":
            print("  Token expired, refreshing...")
            token = get_auth_token()
            result = patch_cover_image(token, model_id, img_url)
            if result == "OK":
                success += 1
                print(f"  ✓ {code} (retry)")
            else:
                errors += 1
                print(f"  ✗ {code}: {result}")
        else:
            errors += 1
            print(f"  ✗ {code}: {result}")

    print(f"\n{'=' * 60}")
    print(f"COMPLETE: {success} updated, {errors} errors")


if __name__ == "__main__":
    main()
