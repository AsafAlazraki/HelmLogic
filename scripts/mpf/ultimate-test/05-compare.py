#!/usr/bin/env python3
"""Phase 6 Ultimate Test — step 5: build comparison.json.

Merges:
  /tmp/ultimate/mpf-figures.boatrow.json      (recalculated Boat Module row 829)
  /tmp/ultimate/mpf-figures.components.json   (recalculated sibling modules)
  test-results/ultimate/hl-notes.json         (browser run: totals + choices)
  test-results/ultimate/hl-summary-text.txt   (step-6 DOM text, line items)
  test-results/ultimate/hl-customer-quote.pdf (generated customer PDF - text)

into tasks/test-evidence/ultimate-test/comparison.json with per-component
deltas and interpretation notes.
"""
import json, re, os, sys

REPO = "/home/user/HelmLogic"
UD = "/tmp/ultimate"
HL = f"{REPO}/test-results/ultimate"
OUT_DIR = f"{REPO}/tasks/test-evidence/ultimate-test"

def money(s):
    return float(str(s).replace(",", "").replace("$", ""))

def main():
    boat = json.load(open(f"{UD}/mpf-figures.boatrow.json"))
    comp = json.load(open(f"{UD}/mpf-figures.components.json"))
    notes = json.load(open(f"{HL}/hl-notes.json"))
    summary = open(f"{HL}/hl-summary-text.txt").read()

    # ---- MPF figures (all from RECALCULATED workbooks) ----
    hull_cash_inc = boat["boatRow"]["hullCash"]                     # 41,340 inc GST (NSM hand-rounded)
    mpf = {
        "boatHullPackageCashIncGst": hull_cash_inc,
        "boatHullPackageCashExGst": round(hull_cash_inc / 1.1, 2),
        "motorNsmRetail": comp["motor"]["nsmRetail"],               # 17,643 (MPF lists one figure; GST basis = NSM open question)
        "riggingKitTotalSellExGst": comp["rigging"]["rowDump"]["29"],  # 3,110 = kit 2,110 + install 1,000
        "propSellExGst": 247.0,
        "propSellIncInstallExGst": 272.0,
        "trailerSell": comp["trailer"]["sell"],                     # 10,430
        "dealerFit": {
            "tubeCoversActSell": comp["tubeCovers"]["rowDump"]["18"],  # 4,634
            "vhfActSell": comp["vhf"]["rowDump"]["18"],                # 1,016
        },
        "rego": {"boat_4_51_to_6_0m": 250.0, "trailerLargeOver1021kg": 283.0},  # GST-free
    }

    # ---- HL figures ----
    hl = {
        "totalIncGst": money(notes["hlTotalIncGst"]) if notes.get("hlTotalIncGst") else None,
        "proposalUrl": notes.get("proposalUrl"),
        "summaryLines": {},
    }
    # Pull line items out of the summary text (label -> $ amount pairs).
    for m in re.finditer(r"^(.{3,90}?)\n\$([\d,]+(?:\.\d{2})?)$", summary, re.M):
        hl["summaryLines"][m.group(1).strip()] = money(m.group(2))

    # PDF total
    try:
        import pypdfium2 as pdfium
        doc = pdfium.PdfDocument(f"{HL}/hl-customer-quote.pdf")
        pdf_text = "\n".join(p.get_textpage().get_text_range() for p in doc)
        doc.close()
        with open(f"{HL}/hl-pdf-text.txt", "w") as f:
            f.write(pdf_text)
        totals = re.findall(r"\$([\d,]+(?:\.\d{2})?)", pdf_text)
        hl["pdfMoneyStrings"] = totals[-12:]
    except Exception as e:
        hl["pdfTextError"] = str(e)

    out = {"config": {
        "boat": "Highfield SP560 (PVC) W-W-WB — MPF row 829, model code HBS113",
        "motor": "Yamaha - F90XB (menu slot 1, NSM Recommended)",
        "riggingKit": "Mech Rigging Kit - 6X3 Concealed (Left Hand) Mount w 6Y5 2 Gauges, 5m Harness, 15' Cables & Filter",
        "prop": "6FP-45943-00 Propeller - Aluminium SDS GP K Series - 15\"",
        "trailer": "REDCO Custom / Highfield SP560 Aluminium - TA600-MOB (standard)",
        "dealerFit": ["Tube Covers to suit PVC Boat - 5.6 Mtr", "VHF Radio - GME GX750B Hideaway with 1.8m Aerial"],
        "rego": "boat 4.51m-6.0m + trailer Large Over 1.021t (QLD)",
        "factoryOptions": [], "fitUp": [], "priceLevel": "NSM Retail (hull_cash)",
    }, "mpf": mpf, "hl": hl, "modeUsed": boat["mode"], "recalcVsSavedDrift": boat["recalcVsSavedDrift"]}

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(f"{UD}/comparison-draft.json", "w") as f:
        json.dump(out, f, indent=1, default=str)
    print(json.dumps(out, indent=1, default=str))

if __name__ == "__main__":
    main()
