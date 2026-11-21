import io
import os
import subprocess
import sys

import pytest
import torch
from fastapi.testclient import TestClient
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, ROOT)
from app import main  # noqa: E402
from app.model import CivicNet, save_checkpoint  # noqa: E402


def jpeg_bytes(color=(120, 90, 60), size=(80, 60)):
    buf = io.BytesIO(); Image.new("RGB", size, color).save(buf, "JPEG"); return buf.getvalue()


@pytest.fixture()
def client_with_model(tmp_path):
    path = tmp_path / "m.pt"
    save_checkpoint(CivicNet(pretrained=False), str(path), 96, "v-test")
    assert main.load_model(str(path))
    yield TestClient(main.app)
    main.state.update(model=None, ckpt=None, transform=None)


def test_predict_returns_expected_shape(client_with_model):
    r = client_with_model.post("/predict", files={"file": ("a.jpg", jpeg_bytes(), "image/jpeg")})
    assert r.status_code == 200
    d = r.json()
    assert d["category"] in ["pothole", "damaged_streetlight", "waste_dump", "drainage"]
    assert d["severity"] in ["low", "medium", "high"]
    assert 0 <= d["confidence"] <= 1
    assert d["confidence"] == min(d["category_confidence"], d["severity_confidence"])
    assert d["model_version"] == "v-test"


def test_rejects_non_image(client_with_model):
    r = client_with_model.post("/predict", files={"file": ("a.jpg", b"not an image", "image/jpeg")})
    assert r.status_code == 400


def test_png_is_accepted(client_with_model):
    buf = io.BytesIO(); Image.new("RGB", (50, 50), (1, 2, 3)).save(buf, "PNG")
    assert client_with_model.post("/predict", files={"file": ("a.png", buf.getvalue(), "image/png")}).status_code == 200


def test_503_when_no_model_and_health_says_so():
    main.state.update(model=None, ckpt=None, transform=None)
    c = TestClient(main.app)
    assert c.get("/health").json()["model_loaded"] is False
    assert c.post("/predict", files={"file": ("a.jpg", jpeg_bytes(), "image/jpeg")}).status_code == 503


def test_training_pipeline_runs_end_to_end(tmp_path):
    """Makes a fake dataset, trains for a few epochs, checks the outputs, and checks the service can load the model."""
    data, out = tmp_path / "data", tmp_path / "out"
    py = sys.executable
    subprocess.run([py, os.path.join(ROOT, "training", "make_demo_dataset.py"), "--out", str(data), "--per-combo", "10"], check=True)
    subprocess.run([py, os.path.join(ROOT, "training", "train.py"), "--data-dir", str(data), "--out-dir", str(out),
                    "--image-size", "96", "--epochs-head", "20", "--epochs-finetune", "5", "--patience", "8", "--no-pretrained", "--batch-size", "16"],
                   check=True)
    for f in ["civictrack_model.pt", "metrics.json", "splits.csv", "confusion_category.png", "confusion_severity.png",
              "training_curves.png", "report_category.txt", "report_severity.txt"]:
        assert (out / f).exists(), f
    import json
    m = json.load(open(out / "metrics.json"))
    assert m["results"]["category"]["accuracy"] > 0.7, "the model should learn the easy fake categories"
    # test photos never appear in the training split
    import csv
    rows = list(csv.DictReader(open(out / "splits.csv")))
    train = {r["filename"] for r in rows if r["split"] == "train"}
    test = {r["filename"] for r in rows if r["split"] == "test"}
    assert train.isdisjoint(test)
    assert main.load_model(str(out / "civictrack_model.pt"))
    main.state.update(model=None, ckpt=None, transform=None)
