# Private document processing

Workspace → Files stores original bytes by authenticated owner. TXT, Markdown and CSV work with the existing Node runtime. Upload is limited to 1 MiB per file, 50 files and 10 MiB per account. A submitted question ranks supporting passages locally. An empty question returns an extractive summary. Select a second owned document to compare source passages and column statistics side by side. Results identify pages, slides, paragraphs, sheets or row ranges as supported by the format.

## Optional binary formats and reports

In an isolated product process, set `JARVIS_DOCUMENT_PYTHON` to the absolute path of a trusted Linux Python interpreter with reviewed libraries. The product discovers available formats from that interpreter at startup. Required libraries are `pypdf` for PDF extraction, `python-docx`, `openpyxl`, `python-pptx`, `Pillow` for JPEG/PNG/WebP, and optional `PyMuPDF` for shaped Unicode PDF output. Review PyMuPDF's AGPL or commercial terms before hosting its optional writer. SHADVERSE does not bundle those libraries or install them at runtime. This checkpoint used the already installed local versions.

The child process receives only the selected bytes or report data. It uses no shell, provides no tool execution path, strips inherited environment credentials and limits concurrent workers, execution time, memory and response size. The Office preflight rejects macro-enabled packages, external spreadsheet link parts, embedded objects, oversized archives and XML declarations for DTDs and entities. The PDF extractor rejects encryption and extracts text without executing document actions. Sheet formulas are not calculated. Downloaded XLSX text cells are written as strings.

Reports are downloadable PDF, DOCX, XLSX and PPTX documents. Language selects RTL formatting. Spreadsheet reports include bounded extracted data sheets. Reports summarize the open file. Questions and comparisons stay local to the Workspace view.

## Acceptance and limits

Test with synthetic files, including a Persian CSV or XLSX, a text-bearing PDF, a DOCX, a deck, and an image. Confirm another account cannot preview, analyze or export any of them. Check literal display, totals, working Office and PDF readers, and the generated document's reading direction. Private photos can be explicitly handed off to the existing Vision preview by the Creator. Analysis there still requires the isolated vision route and separate Submit action.

Scanned PDFs have no OCR here. Page, table, slide and text limits can omit content. Document questions surface supporting excerpts and comparisons, without an inference provider. Spreadsheet totals cover parsed rows only. The product does not pass raw files or their extracted content to the privileged Creator agent.
