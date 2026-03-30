"""
Run this on your Windows machine from the data-import folder:
    pip install openpyxl
    python extract_xlsx.py

It reads all .xlsx files, handles merged cells, and writes
one .txt file per sheet with tab-separated values.
"""
import os
from openpyxl import load_workbook
from pathlib import Path

XLSX_FILES = [
    "Copy of Motor Module.xlsx",
    "Parts Module (1).xlsx",
    "Rigging Module.xlsx",
]

output_dir = Path("extracted")
output_dir.mkdir(exist_ok=True)

for xlsx_file in XLSX_FILES:
    if not os.path.exists(xlsx_file):
        print(f"SKIP (not found): {xlsx_file}")
        continue

    print(f"Processing: {xlsx_file}")
    wb = load_workbook(xlsx_file, data_only=True)

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]

        # Build a grid that resolves merged cells
        merged_values = {}
        for merge_range in ws.merged_cells.ranges:
            top_left_value = ws.cell(merge_range.min_row, merge_range.min_col).value
            for row in range(merge_range.min_row, merge_range.max_row + 1):
                for col in range(merge_range.min_col, merge_range.max_col + 1):
                    merged_values[(row, col)] = top_left_value

        # Safe filename
        base = Path(xlsx_file).stem.replace(" ", "_")
        sheet_safe = sheet_name.replace(" ", "_").replace("/", "-")
        out_path = output_dir / f"{base}__{sheet_safe}.txt"

        with open(out_path, "w", encoding="utf-8") as f:
            for row_idx, row in enumerate(ws.iter_rows(min_row=1, max_row=ws.max_row,
                                                        min_col=1, max_col=ws.max_column), start=1):
                values = []
                for col_idx, cell in enumerate(row, start=1):
                    val = merged_values.get((row_idx, col_idx), cell.value)
                    if val is None:
                        val = ""
                    values.append(str(val).replace("\t", " ").replace("\n", " | "))
                f.write("\t".join(values) + "\n")

        print(f"  -> {out_path} ({ws.max_row} rows x {ws.max_column} cols)")

    wb.close()

print("\nDone! All files in ./extracted/")
