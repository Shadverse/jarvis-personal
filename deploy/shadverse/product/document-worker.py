"""Bounded, in-memory document extraction and artifact generation."""
import base64
import html
import importlib.util
import io
import json
import re
import resource
import sys
import zipfile
from pathlib import PurePosixPath

MAX_TEXT = 32_000
MAX_ROWS = 250
MAX_COLS = 32
MODULES = {"pdf": "pypdf", "docx": "docx", "xlsx": "openpyxl", "pptx": "pptx",
           "png": "PIL", "jpeg": "PIL", "webp": "PIL"}
WRITERS = {"pdf": "fitz", "docx": "docx", "xlsx": "openpyxl", "pptx": "pptx"}


def safe_ooxml(data, marker):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        members = archive.infolist()
        names = {member.filename for member in members}
        if (len(members) > 1000 or len(names) != len(members) or marker not in names
                or "[Content_Types].xml" not in names
                or sum(member.file_size for member in members) > 18_000_000):
            raise ValueError("invalid package")
        for member in members:
            path = PurePosixPath(member.filename)
            name = member.filename.lower()
            if (path.is_absolute() or ".." in path.parts or "\\" in name
                    or member.flag_bits & 1 or member.file_size > 6_000_000
                    or any(x in name for x in ("vbaproject", "activex/", "embeddings/", "externallinks/"))):
                raise ValueError("blocked package content")
            if name.endswith((".xml", ".rels")):
                xml = archive.read(member)
                if b"\0" in xml or re.search(br"<!\s*(DOCTYPE|ENTITY)\b", xml, re.I):
                    raise ValueError("blocked XML")
                if b"macroenabled" in xml.lower():
                    raise ValueError("blocked macro package")


def units(kind, data):
    source = io.BytesIO(data)
    if kind == "pdf":
        from pypdf import PdfReader
        if not data.startswith(b"%PDF-"):
            raise ValueError("invalid PDF")
        doc = PdfReader(source)
        if doc.is_encrypted:
            raise ValueError("encrypted PDF")
        return [(f"Page {i + 1}", doc.pages[i].extract_text() or "")
                for i in range(min(len(doc.pages), 30))], [], len(doc.pages) > 30
    if kind == "docx":
        from docx import Document
        safe_ooxml(data, "word/document.xml")
        doc = Document(source)
        parts = [("Paragraph", p.text) for p in doc.paragraphs[:350]]
        parts += [("Table", " · ".join(c.text for c in row.cells))
                  for table in doc.tables[:12] for row in table.rows[:30]]
        return parts, [], len(doc.paragraphs) > 350 or len(doc.tables) > 12 or any(len(t.rows) > 30 for t in doc.tables[:12])
    if kind == "pptx":
        from pptx import Presentation
        safe_ooxml(data, "ppt/presentation.xml")
        doc = Presentation(source)
        parts = []
        for i, slide in enumerate(doc.slides):
            if i == 30:
                break
            lines = []
            for shape in list(slide.shapes)[:100]:
                if shape.has_text_frame:
                    lines.append(shape.text)
                if shape.has_table:
                    for row in list(shape.table.rows)[:20]:
                        lines.append(" · ".join(c.text for c in row.cells))
            parts.append((f"Slide {i + 1}", "\n".join(lines)))
        return parts, [], len(doc.slides) > 30
    if kind == "xlsx":
        from openpyxl import load_workbook
        safe_ooxml(data, "xl/workbook.xml")
        doc = load_workbook(source, read_only=True, data_only=True, keep_links=False)
        tables = []
        try:
            clipped = len(doc.worksheets) > 6
            for sheet in doc.worksheets[:6]:
                rows = [[v if isinstance(v, (bool, int, float)) else str(v)[:600] if v is not None else ""
                         for v in row] for row in sheet.iter_rows(max_row=MAX_ROWS, max_col=min(sheet.max_column or MAX_COLS, MAX_COLS), values_only=True)]
                while rows and not any(v != "" for v in rows[-1]):
                    rows.pop()
                clipped |= (sheet.max_row or 0) > MAX_ROWS or (sheet.max_column or 0) > MAX_COLS
                tables.append({"label": sheet.title, "rows": rows})
            return [], tables, clipped
        finally:
            doc.close()
    if kind in ("png", "jpeg", "webp"):
        from PIL import Image
        Image.MAX_IMAGE_PIXELS = 12_000_000
        with Image.open(source) as image:
            if image.format.lower() != kind or image.width * image.height > 12_000_000:
                raise ValueError("incorrect image format or size")
            width, height = image.size
            image.verify()
        return [], [], False, {"width": width, "height": height}
    raise ValueError("unknown format")


def extract(kind, data):
    result = units(kind, data)
    parts, tables, clipped = result[:3]
    text_budget = MAX_TEXT
    passages = []
    for label, text in parts:
        text = text.replace("\x00", "").strip()
        if not text:
            continue
        if not text_budget:
            clipped = True
            break
        limit = min(text_budget, 6000)
        clipped |= len(text) > limit
        passages.append({"label": label, "text": text[:limit]})
        text_budget -= min(limit, len(text))
    for table in tables:
        for index, row in enumerate(table["rows"]):
            remaining = sum(len(str(value)) for value in row)
            if remaining > text_budget:
                table["rows"] = table["rows"][:index]
                clipped = True
                break
            text_budget -= remaining
    return {"passages": passages, "tables": tables, "truncated": clipped,
            "image": result[3] if len(result) > 3 else None}


def generate(kind, title, lines, tables, rtl):
    output = io.BytesIO()
    direction = "rtl" if rtl else "ltr"
    if kind == "pdf":
        import fitz
        # MuPDF Story uses its Unicode shaping, including Persian ligatures and bidi.
        body = "<h1>" + html.escape(title) + "</h1>"
        body += "".join("<p>" + html.escape(s).replace("\n", "<br>") + "</p>" for s in lines)
        story = fitz.Story(html=f'<body dir="{direction}">{body}</body>',
                           user_css="body {font-family: sans-serif; font-size: 12pt;} p {overflow-wrap: anywhere;}")
        writer = fitz.DocumentWriter(output)
        page = fitz.paper_rect("a4")
        content = page + (42, 42, -42, -42)
        more = True
        for _ in range(24):
            if not more:
                break
            device = writer.begin_page(page)
            more, _ = story.place(content)
            story.draw(device)
            writer.end_page()
        writer.close()
    elif kind == "docx":
        from docx import Document
        from docx.oxml import OxmlElement
        from docx.oxml.ns import qn
        doc = Document()
        for index, line in enumerate([title] + lines):
            para = doc.add_paragraph(style="Title" if index == 0 else None)
            run = para.add_run(line)
            if rtl:
                bidi = OxmlElement("w:bidi")
                bidi.set(qn("w:val"), "1")
                para._p.get_or_add_pPr().append(bidi)
                run.font.rtl = True
        doc.save(output)
    elif kind == "xlsx":
        from openpyxl import Workbook
        from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
        book = Workbook()
        sheet = book.active
        sheet.title = "Report"
        sheet.sheet_view.rightToLeft = rtl
        sheet.column_dimensions["A"].width = 86
        for line in [title] + lines:
            sheet.append([ILLEGAL_CHARACTERS_RE.sub("", line)])
            sheet.cell(sheet.max_row, 1).data_type = "s"
        for index, table in enumerate(tables):
            sheet = book.create_sheet(f"Data {index + 1}")
            sheet.sheet_view.rightToLeft = rtl
            for row in table["rows"]:
                values = [ILLEGAL_CHARACTERS_RE.sub("", v) if isinstance(v, str) else v for v in row]
                sheet.append(values)
                for cell in sheet[sheet.max_row]:
                    if isinstance(cell.value, str):
                        cell.data_type = "s"
        book.save(output)
    elif kind == "pptx":
        from pptx import Presentation
        from pptx.enum.text import PP_ALIGN
        from pptx.util import Inches, Pt
        doc = Presentation()
        for line in [title] + lines[:24]:
            slide = doc.slides.add_slide(doc.slide_layouts[6])
            frame = slide.shapes.add_textbox(Inches(.6), Inches(.55), Inches(8.8), Inches(6.25)).text_frame
            frame.word_wrap = True
            paragraph = frame.paragraphs[0]
            paragraph.text = line[:850]
            paragraph.font.size = Pt(24 if len(line) < 240 else 16)
            if rtl:
                paragraph.alignment = PP_ALIGN.RIGHT
                paragraph._p.get_or_add_pPr().set("rtl", "1")
        doc.save(output)
    else:
        raise ValueError("unknown artifact")
    return {"content": base64.b64encode(output.getvalue()).decode("ascii")}


def main():
    resource.setrlimit(resource.RLIMIT_CPU, (5, 6))
    resource.setrlimit(resource.RLIMIT_AS, (384 * 1024 * 1024,) * 2)
    raw = sys.stdin.buffer.read(1_500_000)
    req = json.loads(raw)
    if req["operation"] == "probe":
        return {"read": [kind for kind, mod in MODULES.items() if importlib.util.find_spec(mod)],
                "write": [kind for kind, mod in WRITERS.items() if importlib.util.find_spec(mod)]}
    if req["operation"] == "extract":
        data = base64.b64decode(req["content"], validate=True)
        if not 0 < len(data) <= 1_048_576:
            raise ValueError("input limit")
        return extract(req["kind"], data)
    if req["operation"] == "generate":
        return generate(req["kind"], req["title"], req["lines"], req["tables"], req["rtl"])
    raise ValueError("unknown operation")


if __name__ == "__main__":
    try:
        print(json.dumps(main(), ensure_ascii=False, allow_nan=False))
    except (Exception, MemoryError):
        print('{"error":"file_invalid"}')
