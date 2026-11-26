"""Assemble the visual approval package after running the browser captures."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
review = root / "review"
sheet = Image.new("RGB", (1200, 1530), "#0d0c16")
draw = ImageDraw.Draw(sheet)
font = ImageFont.truetype("DejaVuSans.ttf", 23)
caption = ImageFont.truetype("DejaVuSans.ttf", 15)
columns = [
    ("desktop", 23, 686, (1440, 900)),
    ("android", 740, 197, (390, 844)),
    ("iphone", 967, 198, (393, 852)),
]
for row, scene in enumerate(["login", "main", "voice"]):
    top = row * 510 + 18
    draw.text((23, top), f"SHADVERSE  /  {scene.upper()}", font=font, fill="#dfc7ff")
    for device, left, width, size in columns:
        with Image.open(review / f"{device}-{scene}.png") as image:
            if image.size != size:
                raise ValueError(f"Unexpected viewport for {device}: {image.size}")
            height = round(image.height * width / image.width)
            sheet.paste(image.resize((width, height), Image.Resampling.LANCZOS), (left, top + 41))
            draw.text((left, top + 474), f"{size[0]} × {size[1]}", font=caption, fill="#c2bccf")
sheet.save(review / "contact-sheet.jpg", quality=92)
with ZipFile(review / "SHADVERSE-JARVIS-preview.zip", "w") as archive:
    entry = ZipInfo("SHADVERSE-JARVIS.html")
    archive.writestr(entry, (root / "dist/review.html").read_bytes(), compress_type=ZIP_DEFLATED)
