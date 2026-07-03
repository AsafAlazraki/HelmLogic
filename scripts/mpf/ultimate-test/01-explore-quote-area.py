#!/usr/bin/env python3
"""Phase 6 Ultimate Test — step 1: determine what a 'quote' IS in the MPF.

Examines /tmp/ultimate copies (never the source):
- Boat Module.xlsx: sheet list, Dropdowns row 1-3 (live selection cells?),
  formula census (which cells contain formulas, what they reference),
  defined names.
- Sibling workbooks: sheet names only (looking for a Quote sheet).
READ-ONLY on all files.
"""
import openpyxl, glob, json, re, sys

UD = "/tmp/ultimate"

def main():
    out = {}
    # 1. Sheet inventory of every workbook copied
    for path in sorted(glob.glob(f"{UD}/*.xlsx")):
        wb = openpyxl.load_workbook(path, read_only=True, keep_links=True)
        out[path.split("/")[-1]] = {
            "sheets": [(ws.title, ws.sheet_state, ws.max_row, ws.max_column) for ws in wb.worksheets],
            "defined_names": list(wb.defined_names.keys())[:40],
        }
        wb.close()
    print(json.dumps(out, indent=1, default=str))

    # 2. Boat Module: Dropdowns sheet rows 1-3 (non-empty cells)
    wb = openpyxl.load_workbook(f"{UD}/Boat Module.xlsx", read_only=True, data_only=False)
    dd = wb["Dropdowns"]
    print("\n=== Dropdowns rows 1-3 (formulas/values) ===")
    for r, row in enumerate(dd.iter_rows(min_row=1, max_row=3, max_col=26), 1):
        for c in row:
            if c.value not in (None, "", 0):
                print(f"  R{r}C{c.column} [{c.coordinate}]: {repr(c.value)[:120]}")

    # 3. Formula census on Boat Module sheet: first 60 rows x 700 cols
    bm = wb["Boat Module"]
    print("\n=== Boat Module formula cells (rows 1-10 + row 445 region) ===")
    nform = 0
    for row in bm.iter_rows(min_row=1, max_row=10, max_col=700):
        for c in row:
            if isinstance(c.value, str) and c.value.startswith("="):
                nform += 1
                if nform <= 60:
                    print(f"  {c.coordinate}: {c.value[:140]}")
    print(f"  (rows1-10 formula count: {nform})")
    nform = 0
    for row in bm.iter_rows(min_row=444, max_row=446, max_col=700):
        for c in row:
            if isinstance(c.value, str) and c.value.startswith("="):
                nform += 1
                if nform <= 80:
                    print(f"  {c.coordinate}: {c.value[:160]}")
    print(f"  (row 444-446 formula count: {nform})")
    wb.close()

if __name__ == "__main__":
    main()
