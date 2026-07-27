# HelmLogic v1.34 User Guide — The Motor Release

**Audience:** org admins + salespeople at Northside Marine. This guide covers how to *use* what v1.34 shipped; the engineering changelog lives in `RELEASE_NOTES_v1.34.0.md`.

## At a glance

| What you want to do | Where | Section |
|---|---|---|
| Quote a motor (new sale or repower) like a boat proposal | Yamaha Outboards module → **New Motor Quote** | 1 |
| Run a limited-time rebate on selected motors | Yamaha module → **Rebates** tab | 2 |
| See who bought motors under a past rebate | Rebates tab → **Past Rebates** → click the rebate | 2 |
| Edit a motor's specs/prices in bulk via spreadsheet | Catalog Manager → Motors → **Export CSV / Import CSV** | 3 |
| Edit everything about one motor in one place | Catalog Manager → Motors → click the **Part #** | 3 |
| Author content that only shows on motor proposals | Manage → Document Templates → **Motor Quote** | 4 |
| Quick counter sale (parts/trailer/rigging) | Service module → New service quote | 5 |

## 1. Motor quotes — the full proposal flow

**To quote a motor:** open the Yamaha Outboards module and click **New Motor Quote** (top right). You get the same full-screen build experience as a boat quote, starting at the Motor step:

1. **Motor** — search the whole catalogue by model, code or HP. Picking a motor automatically brings its package: the standard rigging kit and prop assigned to that motor, plus its installation charge — all from the Master Price File, dollar for dollar. Repowering? Tick the engine-removal line in the accessories list (it's priced from the workshop's operation for that motor's HP band). Untick anything the deal doesn't need.
2. **Dealer Fit** — add electronics and accessories exactly as on a boat quote.
3. **Administration** — trade-in, delivery, insurance, finance, licence upload. (No boat/trailer rego here — motor quotes don't have them.)
4. **Summary → Finalize** — same finalize dialog, same proposal page, same PDF pipeline. The customer PDF opens with a full-bleed Yamaha motor hero cover and your dealership branding, and the Investment Summary starts at the motor line.

**What this affects:** the quote lands in your normal proposals list, named after the motor. Price levels (Cash / Trade / Commercial / Boating Alliance) work exactly as on boats. All figures are GST-inclusive Master Price File money.

**Tips:** the running price card appears as soon as you pick a motor. If a rebate is live on the motor you pick, the price arrives already discounted — you'll see the red banner.

## 2. Yamaha Rebates

**To create a rebate:** Yamaha module → **Rebates** tab → **New Rebate**. Give it a name, an optional promo photo and offer-website link, an optional start date and an **auto-end date** (the timer). Search and add SKUs, then type each one's temporary rebate price (or use "Apply % off to all"). Click **Go live**.

**What happens while it runs:** every quoting surface shows it — a red band at the top of the Motor step, slashed was-prices on the motor cards, and a "Factory rebate applied / You save" banner on customer PDFs. Every quote finalized with a rebated motor is recorded under the rebate automatically.

**To end it:** click **End now**, or let the timer do it. Prices return to normal immediately and the rebate moves to **Past Rebates**.

**Past Rebates:** click any past rebate to see its SKUs and prices, every sale made under it (customer, motor, salesperson, discount given, deal total, link to the deal), and the full audit trail of who created/edited/ended it.

**Tips:** a motor can only be on one rebate at a time — the dialog will tell you if a SKU is already committed. The offer link shows wherever the rebate shows, including on the PDF.

## 3. Motor catalogue management

**Spreadsheet round-trip:** Catalog Manager → pick Yamaha → **Export CSV** gives you 17 columns (specs, details, cost, all four sell levels, install sell). Edit in Excel and **Import CSV** the same file back — rows match by Part Number, only changed cells are written, blank cells never erase data, and unknown part numbers become new rows. The toast tells you exactly what happened.

**One-motor editor:** click any **Part #** in the table to open the full editor — every spec, every price level, install economics, and the motor's accessory package with "comes standard" toggles. Fields save when you click away.

**What this affects:** these are the same Master Price File rows quotes price from — an edit here shows up in quoting immediately. The next MPF import wins over manual edits (by design).

## 4. Motor-proposal content (admins)

Manage → Document Templates now has a **Motor Quote** tab. Blocks you author there (e.g. a "Why Yamaha" section) appear on motor proposals only — boat quotes keep their own Quote content set. Toggling, ordering and zone assignment work the same as for boats, and from v1.34 the order you set drives the *actual downloaded PDF*, not just the preview.

## 5. Counter sales (unchanged home, clearer job)

The quick popup wizard lives on the **Service module** for over-the-counter quotes (parts, trailers, rigging kits, and quick motor counter quotes). For anything customer-facing that deserves a proposal, use **New Motor Quote** on the Yamaha module instead.

## How motor pricing works (synthesis)

Every motor figure on every surface comes from that motor's own Master Price File row: NSM Retail feeds the Cash level, Trade/Commercial/Boating Alliance feed theirs, the install line is the row's own Install - Sell, the engine-removal charge is the row's named workshop operation, and the rigging/prop standards are the row's assigned accessories. Rebates temporarily replace the price for selected SKUs and restore it on end — with an audit trail. If a number looks wrong, fix the catalogue row (or the MPF and re-import); never the quote.

## What v1.34 did NOT ship (deferred)

- **3.10.5 image pipeline UI** (find/fetch/review/mirror) → v1.35. The 122-image harvest shipped; 82 motors remain imageless pending NSM originals.
- **NSM-Hub migration (11.3.x)** — still blocked on the service-account.
- Battery sections for motor-quote invariants, rebate badge on the admin motors table, Document Templates motor-quote preview using the proposal layout — small follow-ups, none demo-blocking.
