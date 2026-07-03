# Image Remediation — Phase 5 (follow-up to IMAGE_AUDIT.md)

**Ran:** 2026-07-03T10:12:20.140376+00:00  |  **Bucket:** `studio-2290360004-3b963.firebasestorage.app`  |  Patch log: `tasks/mpf-audit/apply-log-images.jsonl`  |  Ledger: FFR-15 (fail class → fix → retest)

| Class | Unique URLs | Refs | Mirrored | Docs patched | Remainder |
|---|---:|---:|---:|---:|---|
| YAMAHA (Incapsula) | 45 | 153 | 7 | 31 | 38 URLs unfetchable — needs NSM-supplied assets |
| SHAREPOINT-INTERNAL | 7 | 314 | 0 | 0 | needs NSM export (auth wall; no public alternate field on docs) |
| NSM-WAF 403 | 164 | 1921 | 164 | 896 dealer-fit docs (1792 field refs) | 129 boatModels refs mirrored, patch not sanctioned this pass |
| DEAD (stacer.com.au) | 4 | 4 | 0 | 0 | for NSM report — needs refreshed assets |

**Retest:** 171/171 Storage URLs verified 200 image/* — every Storage URL written into a doc was re-probed after patching.

## Notes
- Mirrors live at `mpf-mirror/motors/{hash}.{ext}` and `mpf-mirror/dfo/{hash}.{ext}` on the app bucket; download URLs are token (`alt=media`) URLs, which the app's weserv skip-list already routes direct.
- Idempotent: docs already pointing at `mpf-mirror/` are skipped; existing Storage objects are reused.
- Yamaha `.ashx` URLs serve an Incapsula JS challenge to both weserv (403/404) and direct browser-UA fetches (200 + 212-byte HTML stub) — genuinely unfetchable from any server-side context.
- SharePoint URLs return the M365 sign-in page anonymously. The referencing trailer docs hold exactly one image field each (the SharePoint logo), so there is no working field to promote. Full doc list is in `image-remediation.json → classes.sharepoint.urls[].docs`.

*Machine-readable detail: `tasks/test-evidence/image-remediation.json`.*
