# CivicTrack AI Inference Service

Python + FastAPI + PyTorch. It looks at a photo and returns the problem category, severity and a confidence score.
The Core API (in `../backend`) calls it. If this service is off, reports still work and are flagged for manual review.

## 1. Set up (Python 3.10+)

```
cd ai-service
python -m venv .venv
.venv\Scripts\activate          (Windows)      source .venv/bin/activate   (Mac/Linux)
pip install -r requirements.txt
```
`torch` is a big download (hundreds of MB). To save space on a computer without an NVIDIA graphics card, install
the CPU build first:  `pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu`
and then `pip install -r requirements.txt`.

## 2. Try the pipeline with the FAKE practice data (about 5 minutes on CPU)

```
python training/make_demo_dataset.py --out data/demo --per-combo 12
python training/train.py --data-dir data/demo --image-size 96 --epochs-head 3 --epochs-finetune 5
```
This confirms everything works. Results from fake data mean nothing for your report.

## 3. Train on your real photos

Collect and label photos using `LABELLING.md`, then:
```
python training/train.py --data-dir data/real
```
- First run downloads the ImageNet starting weights (about 14 MB). You need internet for that once.
- It trains in two stages (new layers first, then a gentle fine-tune), stops early if validation stops improving,
  and tests **once** on photos the model never saw.
- On a normal laptop CPU with a few hundred photos, expect roughly 20 to 60 minutes.
- Everything is saved in `models/`: `civictrack_model.pt` (the model), `metrics.json`, `report_category.txt`,
  `report_severity.txt`, `confusion_category.png`, `confusion_severity.png`, `training_curves.png`, `splits.csv`.
  These are the numbers and figures for Chapter 5.

## 4. Run the service

```
uvicorn app.main:app --port 8000
```
Check http://localhost:8000/health. It should say `"model_loaded": true`.
Then start the backend (`npm start` in `../backend`). New reports will now get AI results.

## 5. Measure speed (for Chapter 5, NFR-01)

With the service running:
```
python scripts/measure_latency.py some_photo.jpg --n 100
```
It prints the average, median, 95th percentile and slowest time over 100 requests. Run it on your own laptop and write down which laptop it was.

## 6. How many photos do I need?

Minimum 60 per category (240 in total), stretch 100 per category. Put them in `data/real/<category>/<severity>/` as described in `LABELLING.md`. With fewer than this, the test set is too small to mean anything.

## Tests

`python -m pytest tests -q`
