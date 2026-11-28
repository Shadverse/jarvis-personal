"""Synthetic document inputs and independent reader check for generated reports."""
import base64
import io
import json
import sys
import zipfile

import fitz
from docx import Document
from openpyxl import Workbook, load_workbook
from PIL import Image
from pptx import Presentation
from pptx.util import Inches
from pypdf import PdfReader


def encoded(document):
    stream = io.BytesIO()
    document.save(stream)
    return base64.b64encode(stream.getvalue()).decode()


if sys.argv[1] == "verify":
    data = json.load(sys.stdin)
    pdf = PdfReader(io.BytesIO(base64.b64decode(data["pdf"])))
    assert len(pdf.pages) >= 1 and pdf.pages[0].extract_text()
    doc = Document(io.BytesIO(base64.b64decode(data["docx"])))
    assert "آزمون" in doc.paragraphs[0].text and "w:bidi" in doc.paragraphs[0]._p.xml
    book = load_workbook(io.BytesIO(base64.b64decode(data["xlsx"])))
    assert book["Report"].sheet_view.rightToLeft and book["Data 1"]["A3"].data_type == "s"
    assert book["Data 1"]["A3"].value == "=1+2"
    slides = Presentation(io.BytesIO(base64.b64decode(data["pptx"])))
    assert "آزمون" in slides.slides[0].shapes[0].text
    assert 'rtl="1"' in slides.slides[0].shapes[0].text_frame.paragraphs[0]._p.xml
    sys.exit(0)

pdf = fitz.open()
pdf.new_page().insert_text((72, 72), "Orion invoice 2048")
word = Document()
word.add_paragraph("شیوهٔ آزمون در گزارش اوریون")
book = Workbook()
book.active.append(["نام", "مبلغ"])
book.active.append(["اوریون", 12])
book.active.append(["آبی", 18])
slide_deck = Presentation()
slide = slide_deck.slides.add_slide(slide_deck.slide_layouts[6])
slide.shapes.add_textbox(Inches(1), Inches(1), Inches(4), Inches(1)).text = "اسلاید اوریون"
image = io.BytesIO()
Image.new("RGB", (13, 7), "#123456").save(image, "PNG")
bad = io.BytesIO()
with zipfile.ZipFile(bad, "w") as archive:
    archive.writestr("[Content_Types].xml", "<Types/>")
    archive.writestr("word/document.xml", '<!DOCTYPE data><data/>')
print(json.dumps({"pdf": base64.b64encode(pdf.tobytes()).decode(), "docx": encoded(word),
                  "xlsx": encoded(book), "pptx": encoded(slide_deck),
                  "png": base64.b64encode(image.getvalue()).decode(),
                  "bad": base64.b64encode(bad.getvalue()).decode()}))
