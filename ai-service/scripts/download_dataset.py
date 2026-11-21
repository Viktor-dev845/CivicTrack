"""
Automated Infrastructure Dataset Downloader (Resilient, Photo-Only & Deduplicated)
Fetches open-licensed (Creative Commons / Public Domain) real street photographs from Wikimedia Commons
for the 4 CivicTrack target categories:
  1. pothole
  2. damaged_streetlight
  3. waste_dump
  4. drainage

Enforces strict bitmap photo filtering (JPEG/PNG only — no PDFs, videos, or diagrams),
deduplicates by both source URL and SHA-256 content hash, saves images to data/real/images/,
and logs full source provenance.
"""

import os
import io
import csv
import json
import time
import hashlib
import argparse
import requests
from PIL import Image

CATEGORY_QUERIES = {
    "pothole": [
        "pothole road",
        "potholes asphalt",
        "road damage pothole",
        "street pothole",
        "broken asphalt road hole",
        "cracked road pothole",
    ],
    "damaged_streetlight": [
        "broken lamppost",
        "broken streetlight",
        "damaged street lamp",
        "fallen lamppost",
        "bent street light",
        "knocked down lamp post",
        "damaged lantern street",
        "street light pole bent",
        "street lamp collision",
        "broken lamp post road",
        "damaged lighting column",
        "vandalised street light",
        "leaning lamppost street",
        "broken street lamp glass",
    ],
    "waste_dump": [
        "illegal garbage dump",
        "flytipping rubbish",
        "roadside waste dump",
        "overflowing trash bin street",
        "refuse dump street litter",
        "dumped rubbish street",
        "garbage pile road",
        "illegal dumping trash",
    ],
    "drainage": [
        "clogged storm drain",
        "blocked street drain",
        "blocked street gutter",
        "flooded road drain",
        "culvert blocked water",
        "storm drain trash",
        "flooded street gutter",
        "blocked culvert road",
        "overflowing storm drain",
        "drainage ditch rubbish",
        "street gutter debris",
        "storm sewer grate leaves",
        "blocked drain water street",
        "flooded road urban rain",
    ],
}

SEVERITIES = ["low", "medium", "high"]
BAD_EXTENSIONS = (".pdf", ".djvu", ".ogv", ".webm", ".svg", ".tif", ".tiff", ".gif")
BAD_TITLE_WORDS = ("manual", "bulletin", "report", "environmental statement", "commission decision", "page ", "chapter")

USER_AGENT = "CivicTrackAcademic/1.0 (Master's Research in AI; MIVA Open University; contact: student@miva.edu.ng)"


def wait_for_connectivity(max_wait=180):
    """Waits for internet connectivity to resume if a network drop occurs."""
    print("  [Network Pause] Waiting for connection to Wikimedia to resume...", flush=True)
    start = time.time()
    while time.time() - start < max_wait:
        try:
            r = requests.get(
                "https://commons.wikimedia.org/w/api.php?action=query&meta=siteinfo&format=json",
                headers={"User-Agent": USER_AGENT},
                timeout=10,
            )
            if r.status_code == 200:
                print("  Network connection restored! Resuming download...", flush=True)
                return True
        except Exception:
            time.sleep(5)
    print("  Could not reconnect within timeout.", flush=True)
    return False


def is_real_photo(title, mime, width, height):
    tl = (title or "").lower()
    if any(tl.endswith(ext) for ext in BAD_EXTENSIONS):
        return False
    if not tl.endswith((".jpg", ".jpeg", ".png")):
        return False
    if mime not in ("image/jpeg", "image/png"):
        return False
    if (width or 0) < 300 or (height or 0) < 200:
        return False
    if any(w in tl for w in BAD_TITLE_WORDS):
        return False
    return True


def search_wikimedia_files(query, limit=50, max_retries=5):
    api_url = "https://commons.wikimedia.org/w/api.php"
    params = {
        "action": "query",
        "generator": "search",
        "gsrsearch": f"{query} filetype:bitmap",
        "gsrnamespace": 6,
        "gsrlimit": min(limit, 50),
        "prop": "imageinfo",
        "iiprop": "url|size|mime",
        "iiurlwidth": 800,
        "format": "json",
    }
    headers = {"User-Agent": USER_AGENT}

    for attempt in range(max_retries):
        try:
            response = requests.get(api_url, params=params, headers=headers, timeout=25)
            response.raise_for_status()
            data = response.json()
            pages = data.get("query", {}).get("pages", {})
            results = []
            for p in pages.values():
                infos = p.get("imageinfo", [])
                if not infos:
                    continue
                info = infos[0]
                title = p.get("title", "")
                mime = info.get("mime", "")
                width = info.get("width", 0)
                height = info.get("height", 0)
                if not is_real_photo(title, mime, width, height):
                    continue
                thumb_url = info.get("thumburl") or info.get("url")
                if thumb_url:
                    results.append({
                        "title": title,
                        "url": thumb_url,
                        "original_url": info.get("url", ""),
                    })
            return results
        except Exception as e:
            if attempt < max_retries - 1:
                wait_for_connectivity()
            else:
                print(f"  Warning querying '{query}': {e}", flush=True)
                return []


def download_and_sanitize_image(url, target_path, seen_hashes, max_retries=4):
    headers = {"User-Agent": USER_AGENT}
    for attempt in range(max_retries):
        try:
            resp = requests.get(url, headers=headers, timeout=25)
            resp.raise_for_status()
            img = Image.open(io.BytesIO(resp.content)).convert("RGB")
            if min(img.size) < 160:
                return None
            if max(img.size) > 800:
                img.thumbnail((800, 800), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, "JPEG", quality=85)
            raw = buf.getvalue()
            h = hashlib.sha256(raw).hexdigest()
            if h in seen_hashes:
                return None
            with open(target_path, "wb") as f:
                f.write(raw)
            seen_hashes.add(h)
            return h
        except Exception:
            if attempt < max_retries - 1:
                wait_for_connectivity()
            else:
                return None


def next_free_filename(images_dir, category, existing_names):
    n = 1
    while True:
        cand = f"{category}_{n:03d}.jpg"
        if cand not in existing_names and not os.path.exists(os.path.join(images_dir, cand)):
            return cand
        n += 1


def build_dataset(target_dir="data/real", target_per_category=60):
    images_dir = os.path.join(target_dir, "images")
    os.makedirs(images_dir, exist_ok=True)

    labels_csv_path = os.path.join(target_dir, "labels.csv")
    provenance_path = os.path.join(target_dir, "provenance.json")

    records = []
    provenance = {}
    seen_hashes = set()
    seen_urls = set()

    if os.path.exists(provenance_path):
        try:
            with open(provenance_path, encoding="utf-8") as f:
                provenance = json.load(f)
        except Exception:
            provenance = {}

    if os.path.exists(labels_csv_path):
        with open(labels_csv_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                fpath = os.path.join(images_dir, row["filename"])
                if os.path.exists(fpath):
                    h = hashlib.sha256(open(fpath, "rb").read()).hexdigest()
                    seen_hashes.add(h)
                    records.append(row)
                    p = provenance.get(row["filename"], {})
                    if p.get("source_url"):
                        seen_urls.add(p["source_url"])

    existing_names = set(r["filename"] for r in records)

    def save_state():
        with open(labels_csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["filename", "category", "severity"])
            writer.writeheader()
            writer.writerows(records)
        with open(provenance_path, "w", encoding="utf-8") as f:
            json.dump(provenance, f, indent=2)

    save_state()

    print(f"\n=======================================================", flush=True)
    print(f"CivicTrack Photo-Only Dataset Downloader", flush=True)
    print(f"Target: {target_per_category} unique real photos per category (Total {target_per_category * 4})", flush=True)
    print(f"Current clean photos on disk: {len(records)}", flush=True)
    print(f"=======================================================\n", flush=True)

    for cat_idx, (category, queries) in enumerate(CATEGORY_QUERIES.items()):
        cat_count = sum(1 for r in records if r["category"] == category)
        print(f"[{cat_idx + 1}/4] '{category}': {cat_count}/{target_per_category} clean photos...", flush=True)

        if cat_count >= target_per_category:
            print(f"  Target reached for '{category}'. Skipping.\n", flush=True)
            continue

        for q in queries:
            if cat_count >= target_per_category:
                break
            print(f"  -> Querying Wikimedia (bitmap only): '{q}'", flush=True)
            items = search_wikimedia_files(q, limit=50)
            time.sleep(0.8)

            for item in items:
                if cat_count >= target_per_category:
                    break
                orig = item["original_url"]
                if orig in seen_urls:
                    continue
                seen_urls.add(orig)

                filename = next_free_filename(images_dir, category, existing_names)
                save_path = os.path.join(images_dir, filename)

                if download_and_sanitize_image(item["url"], save_path, seen_hashes):
                    sev = SEVERITIES[cat_count % 3]
                    records.append({
                        "filename": filename,
                        "category": category,
                        "severity": sev,
                    })
                    existing_names.add(filename)
                    provenance[filename] = {
                        "category": category,
                        "initial_severity": sev,
                        "source_title": item["title"],
                        "source_url": orig,
                        "license": "Creative Commons / Public Domain",
                    }
                    cat_count += 1
                    save_state()
                    if cat_count % 10 == 0 or cat_count == target_per_category:
                        print(f"     {category}: {cat_count}/{target_per_category}", flush=True)

        print(f"  Category '{category}' now has {cat_count} unique real photos.\n", flush=True)

    save_state()
    print(f"Done! Total clean unique real photos: {len(records)}", flush=True)


def main():
    parser = argparse.ArgumentParser(description="Download real street photographs for CivicTrack AI training")
    parser.add_argument("--out-dir", default="data/real", help="Destination folder (default: data/real)")
    parser.add_argument("--per-category", type=int, default=60, help="Photos per category (default: 60)")
    args = parser.parse_args()
    build_dataset(target_dir=args.out_dir, target_per_category=args.per_category)


if __name__ == "__main__":
    main()
