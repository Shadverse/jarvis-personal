"""Assemble the visual approval package after running the browser captures."""
from pathlib import Path
from io import BytesIO
from subprocess import check_output
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

# Assemble both contact sheets at identical scale from the committed baseline
# and freshly rendered captures, without relying on an untracked local file.
baseline = "6f0fb96b288983bdb1e7ab0ef9f7bf52257ae9e2"
source = f"{baseline}:deploy/shadverse/product/review/contact-sheet.jpg"
before = Image.open(BytesIO(check_output(["git", "show", source], cwd=root)))
comparison = Image.new("RGB", (2424, 1594), "#0d0c16")
labels = ImageDraw.Draw(comparison)
for x, label, image in [(0, "03.3  /  MECHANICAL", before), (1224, "03.3  /  PARTICLE FACE", sheet)]:
    labels.text((x + 22, 18), label, font=font, fill="#e7dcff")
    comparison.paste(image, (x, 64))
comparison.save(review / "before-after.jpg", quality=92)

# Keep reference pixels local to the reviewer. Both original pictures are
# visible in the brief but are not files in this checkout.
from base64 import b64encode

def comparison_image(device_scene, previous=False):
    filename = device_scene + ".png"
    if previous:
        data = check_output(["git", "show", f"{baseline}:deploy/shadverse/product/review/{filename}"], cwd=root)
    else:
        data = (review / filename).read_bytes()
    return "data:image/png;base64," + b64encode(data).decode("ascii")

def comparison_row(scene, source, detail):
    images = []
    for previous, caption in [(True, "نسخهٔ مکانیکی"), (False, "نسخهٔ اصلاح‌شده")]:
        url = comparison_image("iphone-" + scene, previous)
        images.append(f'<figure><figcaption>{caption}</figcaption><img alt="{caption}" src="{url}"></figure>')
    return f'''<section><h2>{source}</h2><p>{detail}</p><div class="row">
    <figure><figcaption>مرجع ارسالی شما</figcaption><label>انتخاب تصویر اصلی از دستگاه
    <input type="file" accept="image/jpeg,image/png,image/webp"></label><img hidden alt="{source}"></figure>
    {"".join(images)}</div></section>'''

document = '''<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>مقایسهٔ بصری جارویس شادوِرس</title><style>
*{box-sizing:border-box}body{margin:0 auto;padding:1rem;max-width:1280px;background:#100d1b;color:#faf6ff;font:16px/1.75 system-ui,sans-serif}
h1,h2,p,figcaption{text-align:center}label,input{display:block;margin:.6rem auto;max-width:100%}
.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:0;padding:10px;border:1px solid #635a7b;border-radius:14px}
figcaption{font-weight:650;margin-bottom:.5rem}img{width:100%;height:auto;display:block}img[hidden]{display:none}
@media(max-width:600px){.row{display:flex;overflow-x:auto;scroll-snap-type:x mandatory}.row figure{flex:0 0 78vw;scroll-snap-align:center}}
</style><main><h1>مقایسهٔ بصری جارویس شادوِرس</h1>
<p>دو ستون برنامه از مرورگر و با اندازهٔ یکسان ۳۹۳ × ۸۵۲ ثبت شده‌اند. تصویر مرجع در گفت‌وگوی سازنده است. برای نمایش در ستون مرجع، فایل اصلی را انتخاب کنید. فایل فقط در همین صفحه باز می‌شود.</p>'''
document += comparison_row("voice","چهرهٔ ذره‌ای · Dogstudio / DEPT",
    "در مرجع، فاصله و تراکم نقاط فرم صورت را می‌سازد. در نسخهٔ قبلی، ویزور و فک فلزی دیده می‌شد. در نسخهٔ اصلاح‌شده، برجستگی بینی، گونه و لب‌ها با ذرات روشن روی زمینهٔ بنفش شکل می‌گیرند.")
document += comparison_row("monitor","پایش و ابزارها · Neuradigi",
    "مرجع دوم از خطوط نورانی روی صفحه‌های تیره استفاده می‌کند. در نسخهٔ اصلاح‌شده، رد فیروزه‌ای، خط میانه و آمار بازهٔ ثبت از اندازه‌گیری واقعی همین زبانه تهیه می‌شوند.")
document += '''</main><script>
document.querySelectorAll("input").forEach(input => {
  let previous;
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const image = input.closest("figure").querySelector("img");
    if (previous) URL.revokeObjectURL(previous);
    image.src = previous = URL.createObjectURL(file);
    image.hidden = false;
  };
});
</script></html>'''
(review / "visual-comparison.html").write_text(document, encoding="utf-8")
