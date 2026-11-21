"""Makes a FAKE practice dataset so you can test the whole pipeline before you have real photos.

These images are simple drawings. They are NOT real infrastructure photos, and a model trained on
them means nothing for your report. Use it only to check that training and the API work.

    python training/make_demo_dataset.py --out data/demo --per-combo 12
"""
import argparse
import csv
import os
import random

from PIL import Image, ImageDraw, ImageFilter

CATEGORIES = ["pothole", "damaged_streetlight", "waste_dump", "drainage"]
SEVERITIES = ["low", "medium", "high"]
SIZE = 128


def draw(category, severity, rng):
    s = {"low": 0.18, "medium": 0.32, "high": 0.5}[severity] * rng.uniform(0.9, 1.1)
    if category == "pothole":
        img = Image.new("RGB", (SIZE, SIZE), (130 + rng.randint(-15, 15),) * 3)
        d = ImageDraw.Draw(img); r = SIZE * s
        cx, cy = SIZE / 2 + rng.randint(-10, 10), SIZE / 2 + rng.randint(-10, 10)
        d.ellipse([cx - r, cy - r * 0.7, cx + r, cy + r * 0.7], fill=(35, 30, 28))
    elif category == "damaged_streetlight":
        img = Image.new("RGB", (SIZE, SIZE), (25, 30, 60))
        d = ImageDraw.Draw(img); x = SIZE / 2 + rng.randint(-15, 15)
        tilt = {"low": 0, "medium": 18, "high": 40}[severity] * rng.choice([-1, 1])
        d.line([x, SIZE, x + tilt, SIZE * 0.25], fill=(160, 160, 160), width=6)
        d.ellipse([x + tilt - 12, SIZE * 0.25 - 12, x + tilt + 12, SIZE * 0.25 + 12],
                  fill=(255, 240, 150) if severity == "low" else (90, 90, 70))
    elif category == "waste_dump":
        img = Image.new("RGB", (SIZE, SIZE), (110, 85, 55))
        d = ImageDraw.Draw(img)
        for _ in range(int(10 + 60 * s)):
            x, y, w = rng.randint(0, SIZE), rng.randint(0, SIZE), rng.randint(5, 16)
            d.rectangle([x, y, x + w, y + w], fill=(rng.randint(60, 255), rng.randint(60, 255), rng.randint(60, 255)))
    else:  # drainage
        img = Image.new("RGB", (SIZE, SIZE), (95, 110, 120))
        d = ImageDraw.Draw(img)
        for i in range(0, SIZE, 16):
            d.line([i, 0, i, SIZE], fill=(40, 45, 50), width=3)
        d.rectangle([0, SIZE * (1 - s * 1.4), SIZE, SIZE], fill=(50, 90, 140))
    img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0, 0.8)))
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/demo")
    ap.add_argument("--per-combo", type=int, default=12, help="images per category x severity")
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    rng = random.Random(a.seed)
    os.makedirs(os.path.join(a.out, "images"), exist_ok=True)
    rows = []
    for c in CATEGORIES:
        for sv in SEVERITIES:
            for i in range(a.per_combo):
                name = f"{c}_{sv}_{i:03d}.jpg"
                draw(c, sv, rng).save(os.path.join(a.out, "images", name), quality=90)
                rows.append((name, c, sv))
    with open(os.path.join(a.out, "labels.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(["filename", "category", "severity"]); w.writerows(rows)
    print(f"Wrote {len(rows)} demo images to {a.out}")


if __name__ == "__main__":
    main()
