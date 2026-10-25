"""Builds the promo images from real gameplay captures + the in-game logo.

Run from the repository root:  python tools/generate_promo.py
Optional: python tools/generate_promo.py <hero_frame> <second_frame> <closeup_frame>

Frames are portrait screenshots of the running game at 430x900 CSS px, 2x device scale
(860x1800 px). The defaults in marketing/gameplay/ were captured from real play sessions.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance

ROOT, OUT = ".", "marketing/promo_images"
G = "marketing/gameplay"
HERO, SECOND, BOARD = (sys.argv[1:4] if len(sys.argv) >= 4 else
    (f"{G}/neon-arcade-combo16.png", f"{G}/cosmic-overdrive-combo8.png", f"{G}/neon-arcade-combo10-blast.png"))
os.makedirs(OUT, exist_ok=True)
FONT = f"{ROOT}/src/assets/fonts/PressStart2P.ttf"
S = 2  # capture device scale

logo = Image.open(f"{ROOT}/src/assets/branding/epic-blast-logo-concept.png").convert("RGBA")
# Trim to the visible artwork (keep the soft glow edge).
alpha = logo.getchannel("A").point(lambda a: 255 if a > 40 else 0)
logo = logo.crop(alpha.getbbox())

def frame(path):
    return Image.open(path).convert("RGB")

def css(box):
    return tuple(int(v * S) for v in box)

# Regions of the portrait capture, in CSS px.
GAME_NO_HEADER = css((0, 110, 430, 900))   # score, board, tray, level bar
BOARD_AREA = css((70, 286, 360, 700))       # board + tray
BOARD_ONLY = css((66, 282, 364, 592))       # just the 8x8 board

def cover(img, w, h, focus=(0.5, 0.5)):
    """Scale to cover w x h and crop around a focus point."""
    s = max(w / img.width, h / img.height)
    im = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    x = int((im.width - w) * focus[0]); y = int((im.height - h) * focus[1])
    return im.crop((x, y, x + w, y + h))

def backdrop(src, w, h, blur=18, dark=0.55, focus=(0.5, 0.35)):
    bg = cover(src, w, h, focus).filter(ImageFilter.GaussianBlur(blur))
    bg = ImageEnhance.Brightness(bg).enhance(dark)
    # Vignette toward the game's deep navy.
    vig = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(vig)
    for i in range(40):
        t = i / 40
        d.rectangle([int(w * t * 0.25), int(h * t * 0.25), int(w - w * t * 0.25), int(h - h * t * 0.25)], fill=int(255 * t))
    vig = vig.filter(ImageFilter.GaussianBlur(max(w, h) // 10))
    navy = Image.new("RGB", (w, h), (9, 5, 27))
    return Image.composite(bg, navy, vig)

def rounded(img, r):
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.width - 1, img.height - 1], r, fill=255)
    out = img.convert("RGBA"); out.putalpha(m); return out

def glow(canvas, card, xy, color=(0, 200, 255), spread=26, strength=0.9):
    halo = Image.new("RGBA", (card.width + spread * 4, card.height + spread * 4), (0, 0, 0, 0))
    a = card.getchannel("A").resize(card.size)
    solid = Image.new("RGBA", card.size, color + (int(255 * strength),))
    halo.paste(solid, (spread * 2, spread * 2), a)
    halo = halo.filter(ImageFilter.GaussianBlur(spread))
    canvas.alpha_composite(halo, (xy[0] - spread * 2, xy[1] - spread * 2))

def phone_card(src, height, crop=GAME_NO_HEADER, radius=None, border=(120, 230, 255)):
    im = src.crop(crop)
    w = round(im.width * height / im.height)
    im = im.resize((w, height), Image.LANCZOS)
    r = radius if radius is not None else max(6, height // 22)
    card = rounded(im, r)
    edge = Image.new("RGBA", card.size, (0, 0, 0, 0))
    ImageDraw.Draw(edge).rounded_rectangle([0, 0, w - 1, height - 1], r, outline=border + (200,), width=max(2, height // 220))
    card.alpha_composite(edge)
    return card

def place_logo(canvas, width, center):
    lg = logo.resize((width, round(logo.height * width / logo.width)), Image.LANCZOS)
    canvas.alpha_composite(lg, (int(center[0] - lg.width / 2), int(center[1] - lg.height / 2)))
    return lg.size

def text(canvas, xy, s, size, fill, anchor="mm"):
    d = ImageDraw.Draw(canvas)
    f = ImageFont.truetype(FONT, size)
    off = max(2, size // 7)
    d.text((xy[0] + off, xy[1] + off), s, font=f, fill=(0, 0, 0, 220), anchor=anchor)
    d.text(xy, s, font=f, fill=fill, anchor=anchor)

def save(canvas, name):
    canvas.convert("RGB").save(f"{OUT}/{name}", "JPEG", quality=92, optimize=True, progressive=True)
    print("saved", name)

hero, second, board = frame(HERO), frame(SECOND), frame(BOARD)
CYAN, GOLD, PINK = (0, 240, 255), (255, 206, 53), (255, 60, 170)

# 1280x720 – hero banner: logo + tagline left, two real gameplay screens right.
def make_1280x720():
    w, h = 1280, 720
    c = backdrop(hero, w, h).convert("RGBA")
    back = phone_card(second, 560).rotate(-7, expand=True, resample=Image.BICUBIC)
    glow(c, back, (1000, 95), PINK, 24, 0.55); c.alpha_composite(back, (1000, 95))
    front = phone_card(hero, 640)
    glow(c, front, (735, 40), CYAN, 28, 0.8); c.alpha_composite(front, (735, 40))
    place_logo(c, 560, (360, 300))
    text(c, (360, 520), "BLOCK PUZZLE", 26, GOLD)
    text(c, (360, 572), "CLEAR LINES * CHAIN COMBOS", 14, CYAN)
    save(c, "1280x720.jpg")

# 1280x550 – wide banner.
def make_1280x550():
    w, h = 1280, 550
    c = backdrop(hero, w, h, focus=(0.5, 0.3)).convert("RGBA")
    back = phone_card(second, 440).rotate(-7, expand=True, resample=Image.BICUBIC)
    glow(c, back, (1010, 70), PINK, 22, 0.55); c.alpha_composite(back, (1010, 70))
    front = phone_card(hero, 500)
    glow(c, front, (760, 25), CYAN, 26, 0.8); c.alpha_composite(front, (760, 25))
    place_logo(c, 520, (370, 240))
    text(c, (370, 430), "BLOCK PUZZLE", 24, GOLD)
    save(c, "1280x550.jpg")

# 512x512 – square: logo over a real board mid-combo.
def make_512x512():
    w, h = 512, 512
    c = backdrop(hero, w, h, blur=14, dark=0.5).convert("RGBA")
    card = phone_card(hero, 296, crop=BOARD_ONLY, radius=12)
    x = (w - card.width) // 2
    glow(c, card, (x, 200), CYAN, 18, 0.7); c.alpha_composite(card, (x, 200))
    place_logo(c, 350, (256, 108))
    save(c, "512x512.jpg")

# 512x384 – 4:3 thumbnail.
def make_512x384():
    w, h = 512, 384
    c = backdrop(hero, w, h, blur=10, dark=0.5).convert("RGBA")
    card = phone_card(hero, 360, crop=BOARD_AREA, radius=14)
    glow(c, card, (w - card.width - 22, 12), CYAN, 16, 0.7); c.alpha_composite(card, (w - card.width - 22, 12))
    place_logo(c, 250, (148, 165))
    text(c, (148, 268), "BLOCK PUZZLE", 12, GOLD)
    save(c, "512x384.jpg")

# 200x120 – tiny: logo has to carry it; real board behind.
def make_200x120():
    w, h = 200, 120
    c = ImageEnhance.Brightness(cover(board.crop(BOARD_ONLY), w, h, (0.5, 0.45))).enhance(0.5).convert("RGBA")
    place_logo(c, 184, (100, 60))
    save(c, "200x120.jpg")

for f in (make_1280x720, make_1280x550, make_512x512, make_512x384, make_200x120):
    f()
