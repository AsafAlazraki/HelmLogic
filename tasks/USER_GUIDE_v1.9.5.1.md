# HelmLogic — User Guide v1.9.5.1

**For:** Org admins + salespeople
**Companion to:** `RELEASE_NOTES_v1.9.5.1.md`

This release ships a **bug pass** (four fixes you'll notice but didn't have to ask for) and the **first slice of the Fit-Up Catalog** — a place to start cataloguing your fit-up items now, before the salesperson-side quote integration arrives.

---

## At a glance

| What you want to do | Where | Section |
|---|---|---|
| See my cover letter on the PDF again | Send a quote → download PDF | §1 |
| See dealer-fit option names on the PDF | Any proposal | §2 |
| Try to change a discount on a locked quote | Locked proposal | §3 |
| Bulk-import stock without dupes | Stock import screen | §4 |
| Start building my Fit-Up catalog | Manage → Fit-Up Catalog | §5 |
| Mark Epic 9 stories 9.1.1 + 9.1.2 as shipped | Manage → Fit-Up Catalog (one-shot button at top) | §6 |

---

## 1. Cover letter on the customer PDF

### What changed
The salesperson cover letter ("Your message") is back on the customer PDF. If you set it up on **Manage → Document Templates** and you're the salesperson assigned to the quote, it will appear on every PDF the system renders.

### To do nothing different
Send a quote / download the PDF as usual. If your message HTML is set on your Sales Team profile (`/manage` → relevant tab), it appears.

### What this affects
Every PDF render path — manual download, Send Quote email attachment, finalize-snapshot download. All three go through the same `renderQuotePdf` pipeline, so the fix lands everywhere at once.

### Tips
- The cover letter is keyed to the **quote's creator**, not the current user. If you're rendering a PDF for a colleague's quote, you'll see their cover letter (not yours). This is intentional — the proposal must reflect who's actually selling the boat.
- If you can author content on the manage page but the block still doesn't appear on a PDF, the dev-mode canary in the browser console will tell us what went wrong. Capture the warning, send it to engineering.

---

## 2. Dealer-fit option names on the PDF

### What changed
Dealer-fit items (rigging, electronics, accessories) that previously rendered as a blank name with only a dollar amount now show:
- Their full description (from any of the common vendor-feed field names)
- A part code / SKU as a fallback
- A generic "Dealer Fit Item" label as a last resort

### What this affects
Every proposal — on-screen view, downloaded PDF, finalize-snapshot. Legacy quotes already in the wild that had blank names will now show *something* (either the code or the generic label, depending on what's in the snapshot).

### Tips
- If a legacy quote still shows just a code (no description), it means the snapshot truly didn't have a description. Either re-create the quote line item to re-snapshot, or live with the code — the price is correct either way.

---

## 3. Discount on a locked quote — honest feedback

### What changed
If you try to change the discount on a **locked** quote and click Save, you now get an immediate "Quote is locked — Create v2 to change discount" toast. Before, the click silently failed; the change appeared to save until you refreshed the page.

### To do
On a locked quote, use **Create v2** to fork a new editable version. Apply the new discount there. The original locked quote is untouched (audit trail preserved).

### What this affects
The discount field on the proposal-view page. All other locked-quote edit paths already had this guard.

---

## 4. Stock import — duplicate stock numbers fixed

### What changed
If your CSV has rows with blank `stockNumber` cells, the system used to auto-generate `IMP-<6-digit-ms>` — which would collide if two operators imported within the same millisecond. The fallback is now `IMP-<base36-time>-<random>` which is collision-safe in any realistic window.

### To do nothing different
Run your bulk imports as usual.

### Tips
- This only affects the fallback used when `stockNumber` is blank. If your CSV has explicit stock numbers, none of this applies.

---

## 5. Fit-Up Catalog — start populating now

### What this is
A **per-organisation master library** of fit-up items (rigging, installation, prep). Each item has a name, a tier (Simple / Medium / Complex), a cost, an optional sell price, and optional internal notes.

### To do
1. Go to **Manage → Fit-Up Catalog** (new tab next to Modules).
2. Click **Add item**.
3. Fill in:
   - **Name** — descriptive, e.g., *Sound system install*
   - **Tier** — Simple / Medium / Complex (your call; rule-based auto-classification comes later in Epic 9.3.1)
   - **Cost** — what the item costs you to deliver
   - **Sell price** *(optional)* — leave blank if you plan to derive from a margin rule (margin tooling lands in a later release)
   - **Notes** *(optional)* — operator-only; will **not** appear on customer PDFs
4. Save.

### Filtering
Use the tier chips at the top (All / Simple / Medium / Complex) to filter the list as it grows.

### What this affects today
**Nothing in the quote flow yet.** This is intentional. The salesperson side of fit-up (checkbox on quote, summary line on PDF) ships in v1.16+ as part of Epic 9.2. We pulled the catalog *forward* so you can begin authoring real data — when 9.2.x lands, the salesperson UI will already have something to point at.

### Tips
- Keep notes operator-internal. The customer PDF will show a **single summary line** (e.g., "Fit-up & rigging: $X ex GST / $Y inc GST") — no itemised breakdown by design (per the locked Story 9.2.3 product decision).
- Start small. A short, accurate catalog is better than a long catalog full of guesses on tier/cost.
- You can edit any field on any item any time. There's no "lock" on the catalog.

---

## 6. The one-shot "Apply v1.9.5.1 retarget" button

### What it is
A small amber tile at the top of the **Manage → Fit-Up Catalog** tab. Marks Epic 9 stories **9.1.1** and **9.1.2** as `shipped` in `v1.9.5.1` on the planning board.

### To do
**Click it once.** Wait for the green confirmation toast. Done.

If you click it twice, the second click is a no-op (it checks current state and only writes if something needs changing).

### Why it exists
The two stories were previously bucketed in v1.10–13. Pulling them forward into v1.9.5.1 means the planning board's release table needs to reflect that. Rather than ask you to edit two Firestore docs by hand, the button does it.

### After clicking
The button stays visible until the next dev push (the **follow-up cleanup commit** removes it). That's the standard one-shot lifecycle — no harm if it stays a day or two.

---

## How v1.9.5.1 fits the bigger picture

| Release | What it shipped | Status |
|---|---|---|
| v1.9.5 | Roadmap reshuffle + Service Quoting groundwork + clickable release popups | ✅ Shipped 04-27 |
| **v1.9.5.1 (this one)** | **4 prod-bug fixes + Fit-Up schema + admin** | **✅ Shipped 06-02** |
| v1.10 (planned next) | Service Quoting build (Epic 11.1.1 + 11.1.2 + 11.3.1) + remaining bug repros | 🟡 In planning |
| v1.16+ | Fit-Up quote-flow integration (Epic 9.2) | 📋 Backlog |
| v2.2 | Fit-Up auto-classification (Epic 9.3.1) | 📋 Backlog |

---

## What v1.9.5.1 did NOT ship

| Item | When | Why |
|---|---|---|
| Bulk CSV import for Fit-Up | Unscheduled (Story 9.1.3) | Small catalogs hand-author fast; bulk tooling later. |
| Global markup tools for Fit-Up | Unscheduled (Story 9.1.4) | Depends on margin strategy work (v1.20+). |
| Fit-Up on the quote flow | v1.16+ (Epic 9.2) | Quote-flow integration is its own slice. |
| Fit-Up auto-classification | v2.2 (Story 9.3.1) | Depends on 9.2.x being live. |
| "HL Error on saving project" bug | Awaiting repro | Need the exact error + screen to fix precisely; defensive guards may incidentally catch it. |
| "Import doesn't work correctly" bug | Awaiting repro | Need to know which import + what fails. |
| RU200KAM $76.82 price delta | v1.11 | Need real-quote + MPF-row repro. |
| Trailer Catalog missing models | Out of scope | Data re-import, not code. |
