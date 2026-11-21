"""Measures how long the AI service takes per photo (for NFR-01: 2.5 seconds or less).

Start the service first:   uvicorn app.main:app --port 8000
Then run:                  python scripts/measure_latency.py path/to/photo.jpg --n 100
It sends the same photo N times to /predict and prints average, median, 95th percentile and slowest time.
Run it on YOUR laptop and put those numbers in Chapter 5. Also say what laptop you used.
"""
import argparse, statistics, time, json
import requests

ap = argparse.ArgumentParser()
ap.add_argument("photo")
ap.add_argument("--n", type=int, default=100)
ap.add_argument("--url", default="http://localhost:8000/predict")
a = ap.parse_args()

data = open(a.photo, "rb").read()
times = []
for i in range(a.n):
    t = time.perf_counter()
    r = requests.post(a.url, files={"file": ("photo.jpg", data, "image/jpeg")}, timeout=30)
    r.raise_for_status()
    times.append(time.perf_counter() - t)
    if i == 0:
        print("Sample answer:", json.dumps(r.json()))
times_sorted = sorted(times)
print(f"\nRequests: {a.n}")
print(f"Average : {statistics.mean(times)*1000:.0f} ms")
print(f"Median  : {statistics.median(times)*1000:.0f} ms")
print(f"95th pct: {times_sorted[int(0.95*(len(times)-1))]*1000:.0f} ms")
print(f"Slowest : {max(times)*1000:.0f} ms")
print("Target (NFR-01): 2500 ms or less ->", "PASS" if max(times) <= 2.5 else "CHECK: some requests were slower")
