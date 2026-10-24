"""Builds the PWA icons, favicon and manifest screenshots in public/ from the current game art.

Run from the repository root:  python tools/generate_icons.py

Sources: the in-game logo (src/assets/branding), the block jewel (src/assets/images)
and the real gameplay captures in marketing/gameplay/.
"""
import os
from PIL import Image, ImageChops, ImageDraw, ImageFilter

PUBLIC = "public"
BG = (12, 13, 20)  # manifest background_color / theme_color #0c0d14
GRID = (24, 26, 44)
SCREENSHOTS = ["neon-arcade-combo16", "cosmic-overdrive-combo8", "neon-arcade-combo10-blast"]

os.makedirs(f"{PUBLIC}/icons", exist_ok=True)
os.makedirs(f"{PUBLIC}/screenshots", exist_ok=True)

logo = Image.open("src/assets/branding/epic-blast-logo-concept.png").convert("RGBA")
# Trim to the visible artwork (keep the soft glow edge).
logo = logo.crop(logo.getchannel("A").point(lambda a: 255 if a > 40 else 0).getbbox())

def background(n):
    """Dark board grid with the purple/blue neon glow of the game backdrop."""
    im = Image.new("RGB", (n, n), BG)
    d = ImageDraw.Draw(im)
    step, width = n / 8, max(1, n // 256)
    for i in range(1, 8):
        p = round(i * step)
        d.line([(p, 0), (p, n)], fill=GRID, width=width)
        d.line([(0, p), (n, p)], fill=GRID, width=width)
    glow = Image.new("RGB", (n, n))
    g = ImageDraw.Draw(glow)
    g.ellipse([n * .05, n * .15, n * .95, n * .85], fill=(120, 30, 150))
    g.ellipse([n * .25, n * .35, n * .75, n * .65], fill=(40, 110, 200))
    return ImageChops.add(im, glow.filter(ImageFilter.GaussianBlur(n * .16)))

def icon(n, scale):
    """scale = logo width relative to the icon; maskable icons keep it inside the 80% safe zone."""
    im = background(n).convert("RGBA")
    w = round(n * scale)
    h = round(logo.height * w / logo.width)
    im.alpha_composite(logo.resize((w, h), Image.LANCZOS), ((n - w) // 2, (n - h) // 2))
    return im.convert("RGB")

icon(512, .92).save(f"{PUBLIC}/icons/icon-512.png", optimize=True)
icon(192, .92).save(f"{PUBLIC}/icons/icon-192.png", optimize=True)
icon(180, .9).save(f"{PUBLIC}/icons/icon-180.png", optimize=True)
icon(512, .76).save(f"{PUBLIC}/icons/icon-maskable-512.png", optimize=True)

# The full logo is unreadable at 16-32 px, so the favicon is a single game block.
jewel = Image.open("src/assets/images/neon-jewel.png").convert("RGBA")
jewel = jewel.crop(jewel.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox())
jewel.thumbnail((256, 256), Image.LANCZOS)
fav = Image.new("RGBA", (256, 256))
fav.alpha_composite(jewel, ((256 - jewel.width) // 2, (256 - jewel.height) // 2))
fav.save(f"{PUBLIC}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

# Install-dialog screenshots (portrait, 430x900 CSS px @2x). WebP keeps the precache small.
for name in SCREENSHOTS:
    Image.open(f"marketing/gameplay/{name}.png").convert("RGB").save(
        f"{PUBLIC}/screenshots/{name}.webp", quality=74, method=6)
