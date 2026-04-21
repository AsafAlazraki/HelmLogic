# v1.1 — Overview (Archive)

Released 2026-04-01. 22 commits since v1.0.

---

## What shipped

### Universal Publish
Publish now writes ALL price levels to catalog in one action (no level
selector at publish time). Each variant stores a `priceLevels` object with
5 levels:

- `hull_cash` — Cash Price (default)
- `hull_trade` — Trade Price
- `hull_subdealer` — Sub-Dealer Price
- `hull_subdealer_excl` — Sub-Dealer Excl Price
- `hull_aus_sailing` — AUS Sailing Price

Primary `sellPriceExclGst` is set from the org's shortCode cash column.

### Price Level Selector in Quotes
Quote builder has a dropdown to switch between price levels live. Totals
update immediately. Default is the org's cash price. **Sub-dealers are
forced to their assigned price level** (no user selection). Every finalized
quote records `priceLevelUsed` for audit.

### Pricing Manager UX
- Export + Global Update work inside Focus Mode (z-index fix).
- All Sell AUD columns labelled `(EXCL. GST)` or `(INCL. GST)` explicitly.

---

## Why it matters for later testers

If you see a quote with a non-default price level, it's not a bug — it's
either a sub-dealer quote or the user explicitly switched levels. Check
`priceLevelUsed` on the saved quote doc.

Motor pricing (v1.2) and Dealer Fit pricing (v1.2.1) both flow through the
same price-level mechanism — see each of their overviews for the per-level
column mapping.

---

Full engineering changelog → [`release-notes.md`](./release-notes.md).
