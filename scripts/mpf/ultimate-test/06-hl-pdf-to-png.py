#!/usr/bin/env python3
"""Phase 6 Ultimate Test — step 6: rasterise the HelmLogic customer PDF.

Renders pages 1-2 of test-results/ultimate/hl-customer-quote.pdf to PNG at
100 dpi for the side-by-side exhibit, and extracts the PDF text for the
figure verification (hlPdfTotal).
"""
import sys, os, re, json
import pypdfium2 as pdfium

SRC = "/home/user/HelmLogic/test-results/ultimate/hl-customer-quote.pdf"
OUT = "/home/user/HelmLogic/tasks/test-evidence/ultimate-test"

def main():
    os.makedirs(OUT, exist_ok=True)
    doc = pdfium.PdfDocument(SRC)
    print("pages:", len(doc))
    for i in range(min(len(doc), 2)):
        img = doc[i].render(scale=100 / 72).to_pil()
        img.save(f"{OUT}/hl-customer-quote-page{i+1}.png")
        print(f"page{i+1}: {img.size}")
    text = "\n".join(doc[i].get_textpage().get_text_range() for i in range(len(doc)))
    doc.close()
    with open(f"{OUT.replace('tasks/test-evidence/ultimate-test','test-results/ultimate')}/hl-pdf-text.txt", "w") as f:
        f.write(text)
    money = re.findall(r"\$[\d,]+(?:\.\d{2})?", text)
    print("money strings (last 20):", money[-20:])

if __name__ == "__main__":
    main()
