---
name: pdf-handling
description: PDF creation, text extraction, merging, splitting, and form-filling.
platforms: [linux, macos, windows]
tags: [pdf, extraction, merge, split, forms, html-to-pdf, ocr, reportlab, pypdf]
---

# PDF Handling SOP

Select the right tool for each PDF job and execute it correctly. Covers text extraction, merging, splitting, HTML-to-PDF conversion, form filling, and scanned PDF (OCR) handling.

## When to Use

- User wants to extract text or tables from a PDF
- User wants to merge multiple PDFs into one
- User wants to split a PDF into separate files
- User wants to create a PDF from HTML, Markdown, or data
- User wants to fill fields in a PDF form
- User wants to process a scanned (image-based) PDF

---

## Part 1 — Tool Selection Guide

| Task | Best tool | Install |
|------|-----------|---------|
| Extract text (digital PDF) | `pdfplumber` | `pip install pdfplumber` |
| Extract tables | `pdfplumber` | `pip install pdfplumber` |
| Merge / split / rotate pages | `pypdf` | `pip install pypdf` |
| Create PDF from scratch (programmatic) | `reportlab` | `pip install reportlab` |
| Convert HTML / CSS to PDF | `weasyprint` | `pip install weasyprint` |
| Convert Markdown to PDF | `weasyprint` + `markdown` | `pip install weasyprint markdown` |
| Fill PDF forms | `pypdf` or `pdfrw` | `pip install pypdf` |
| Scanned PDF — OCR | `pytesseract` + `pdf2image` | `pip install pytesseract pdf2image` + system `tesseract` |
| Encrypt / decrypt | `pypdf` | `pip install pypdf` |

---

## Part 2 — Text Extraction

### Digital PDF — Plain Text

```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    for page_num, page in enumerate(pdf.pages, 1):
        text = page.extract_text()
        if text:
            print(f"=== Page {page_num} ===")
            print(text)
```

### Extract Text from Specific Pages

```python
with pdfplumber.open("report.pdf") as pdf:
    # Pages 2-5 (0-indexed: pages[1:5])
    for page in pdf.pages[1:5]:
        text = page.extract_text(x_tolerance=3, y_tolerance=3)
        print(text)
```

### Extract Text with Coordinates (for layout-aware parsing)

```python
with pdfplumber.open("form.pdf") as pdf:
    page = pdf.pages[0]
    words = page.extract_words()
    for word in words:
        print(f"  '{word['text']}' at x={word['x0']:.0f}, y={word['top']:.0f}")
```

### Extract All Text to a File

```python
import pdfplumber

def pdf_to_text(input_path, output_path):
    with pdfplumber.open(input_path) as pdf:
        with open(output_path, "w", encoding="utf-8") as out:
            for page in pdf.pages:
                text = page.extract_text() or ""
                out.write(text)
                out.write("\n\n")
    print(f"Extracted {len(pdf.pages)} pages to {output_path}")

pdf_to_text("input.pdf", "output.txt")
```

---

## Part 3 — Table Extraction

```python
import pdfplumber, csv

with pdfplumber.open("report.pdf") as pdf:
    all_tables = []
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            all_tables.extend(table)

# Write to CSV
with open("tables.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerows(all_tables)

print(f"Extracted {len(all_tables)} rows")
```

### Fine-tuned Table Extraction

```python
with pdfplumber.open("complex.pdf") as pdf:
    page = pdf.pages[0]
    table = page.extract_table({
        "vertical_strategy":   "lines",   # "lines", "text", "explicit"
        "horizontal_strategy": "lines",
        "snap_tolerance":      3,
        "join_tolerance":      3,
        "edge_min_length":     3,
        "min_words_vertical":  1,
    })
    for row in table:
        print(row)
```

---

## Part 4 — Merge, Split, and Rotate

### Merge Multiple PDFs

```python
from pypdf import PdfWriter

writer = PdfWriter()
files = ["chapter1.pdf", "chapter2.pdf", "appendix.pdf"]

for path in files:
    writer.append(path)

with open("combined.pdf", "wb") as out:
    writer.write(out)

print(f"Merged {len(files)} files → combined.pdf")
```

### Split — Extract a Range of Pages

```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("large_report.pdf")
writer = PdfWriter()

# Extract pages 3–7 (0-indexed: 2–6)
for page_num in range(2, 7):
    writer.add_page(reader.pages[page_num])

with open("pages_3_to_7.pdf", "wb") as out:
    writer.write(out)
```

### Split — One File Per Page

```python
from pypdf import PdfReader, PdfWriter
import os

reader = PdfReader("document.pdf")
os.makedirs("pages", exist_ok=True)

for i, page in enumerate(reader.pages):
    writer = PdfWriter()
    writer.add_page(page)
    with open(f"pages/page_{i+1:03d}.pdf", "wb") as out:
        writer.write(out)

print(f"Split into {len(reader.pages)} files in pages/")
```

### Rotate Pages

```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("sideways.pdf")
writer = PdfWriter()

for page in reader.pages:
    page.rotate(90)  # 90, 180, or 270 degrees
    writer.add_page(page)

with open("rotated.pdf", "wb") as out:
    writer.write(out)
```

---

## Part 5 — Create PDFs

### HTML / CSS → PDF (weasyprint)

```python
from weasyprint import HTML, CSS

html_content = """
<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; }
  h1   { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #3498db; color: white; }
  tr:nth-child(even) { background: #f2f2f2; }
  @page { margin: 20mm; }
</style>
</head>
<body>
  <h1>Quarterly Report — Q2 2026</h1>
  <p>Generated: May 18, 2026</p>
  <table>
    <tr><th>Item</th><th>Revenue</th><th>Growth</th></tr>
    <tr><td>Product A</td><td>$120,000</td><td>+12%</td></tr>
    <tr><td>Product B</td><td>$85,000</td><td>+5%</td></tr>
  </table>
</body>
</html>
"""

HTML(string=html_content).write_pdf("report.pdf")
print("Created report.pdf")
```

### Markdown → PDF

```python
import markdown
from weasyprint import HTML

with open("README.md", "r") as f:
    md_content = f.read()

html_body = markdown.markdown(md_content, extensions=["tables", "fenced_code"])

full_html = f"""<!DOCTYPE html>
<html>
<head>
<style>
  body {{ font-family: Georgia, serif; max-width: 800px; margin: 40px auto; }}
  code {{ background: #f4f4f4; padding: 2px 4px; border-radius: 3px; font-size: 0.9em; }}
  pre  {{ background: #f4f4f4; padding: 16px; border-radius: 6px; overflow-x: auto; }}
  @page {{ margin: 20mm; }}
</style>
</head>
<body>{html_body}</body>
</html>"""

HTML(string=full_html).write_pdf("output.pdf")
```

### Programmatic PDF with reportlab

```python
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

def create_invoice(filename, data):
    c = canvas.Canvas(filename, pagesize=A4)
    width, height = A4

    # Header
    c.setFont("Helvetica-Bold", 24)
    c.drawString(20*mm, height - 30*mm, "INVOICE")
    c.setFont("Helvetica", 11)
    c.drawString(20*mm, height - 42*mm, f"Invoice #: {data['number']}")
    c.drawString(20*mm, height - 50*mm, f"Date: {data['date']}")

    # Line items
    y = height - 80*mm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(20*mm, y, "Description")
    c.drawString(120*mm, y, "Amount")
    y -= 8*mm
    c.line(20*mm, y, 190*mm, y)
    y -= 6*mm

    c.setFont("Helvetica", 10)
    for item in data["items"]:
        c.drawString(20*mm, y, item["description"])
        c.drawRightString(190*mm, y, f"${item['amount']:,.2f}")
        y -= 7*mm

    # Total
    y -= 5*mm
    c.line(20*mm, y, 190*mm, y)
    y -= 8*mm
    c.setFont("Helvetica-Bold", 12)
    c.drawString(120*mm, y, "Total:")
    c.drawRightString(190*mm, y, f"${data['total']:,.2f}")

    c.save()

create_invoice("invoice.pdf", {
    "number": "INV-2026-042",
    "date": "May 18, 2026",
    "items": [
        {"description": "Consulting — 10 hours @ $150/hr", "amount": 1500},
        {"description": "Setup fee", "amount": 250},
    ],
    "total": 1750,
})
```

---

## Part 6 — Scanned PDFs (OCR)

> Scanned PDFs are images. `pdfplumber` returns no text — you must OCR first.

```bash
# System requirements
brew install tesseract          # macOS
sudo apt-get install tesseract-ocr  # Ubuntu/Debian
pip install pytesseract pdf2image
```

```python
import pytesseract
from pdf2image import convert_from_path

# Convert PDF pages to images, then OCR each
pages = convert_from_path("scanned.pdf", dpi=300)

full_text = []
for i, page_image in enumerate(pages, 1):
    text = pytesseract.image_to_string(page_image, lang="eng")
    print(f"=== Page {i} ===")
    print(text)
    full_text.append(text)

with open("scanned_output.txt", "w", encoding="utf-8") as f:
    f.write("\n\n".join(full_text))
```

---

## Part 7 — Encrypt and Decrypt

```python
from pypdf import PdfReader, PdfWriter

# Encrypt
reader = PdfReader("document.pdf")
writer = PdfWriter()
writer.append_pages_from_reader(reader)
writer.encrypt(user_password="view123", owner_password="admin456", use_128bit=True)
with open("protected.pdf", "wb") as f:
    writer.write(f)

# Decrypt
reader = PdfReader("protected.pdf")
if reader.is_encrypted:
    reader.decrypt("view123")
writer = PdfWriter()
writer.append_pages_from_reader(reader)
with open("unlocked.pdf", "wb") as f:
    writer.write(f)
```

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| `extract_text()` returns empty string | Scanned PDF (image-based) | Use OCR (Part 6) |
| Garbled text order | Complex multi-column layout | Try `extract_words()` with coordinate sorting |
| `weasyprint` missing fonts | System fonts not found | Install system font packages |
| Table extraction misses columns | Poor line detection | Adjust `vertical_strategy` to `"text"` |
| Large PDF slow to process | All pages loaded at once | Process page-by-page in a loop |

---

## Checklist

- [ ] Identified whether PDF is digital (has selectable text) or scanned (image)
- [ ] Chose correct tool for the task (extraction vs creation vs merge)
- [ ] Scanned PDFs routed through OCR pipeline
- [ ] For HTML→PDF, tested output at target paper size (A4 or Letter)
- [ ] Merged output verified with page count check
- [ ] Large PDFs processed page-by-page to avoid memory issues
