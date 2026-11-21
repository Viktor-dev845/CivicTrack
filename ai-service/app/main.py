"""AI Inference microservice. Run:  uvicorn app.main:app --port 8000

POST /predict  (multipart form, field "file" = the photo)
  -> {"category", "severity", "confidence", "category_confidence", "severity_confidence", "model_version"}
GET  /health   -> whether a trained model is loaded
"""
import io
import os
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from .model import eval_transform, load_checkpoint

MODEL_PATH = os.environ.get("MODEL_PATH", os.path.join(os.path.dirname(__file__), "..", "models", "civictrack_model.pt"))
MAX_BYTES = 10 * 1024 * 1024

state = {"model": None, "ckpt": None, "transform": None}


def load_model(path=None):
    path = path or MODEL_PATH
    if not os.path.exists(path):
        state.update(model=None, ckpt=None, transform=None)
        return False
    model, ckpt = load_checkpoint(path)
    state.update(model=model, ckpt=ckpt, transform=eval_transform(ckpt["image_size"]))
    return True


@asynccontextmanager
async def lifespan(app):
    if not load_model():
        print(f"[ai] No trained model found at {MODEL_PATH}. /predict will answer 503 until you train one.")
    yield


app = FastAPI(title="CivicTrack AI Inference Service", lifespan=lifespan)


@app.get("/health")
def health():
    ckpt = state["ckpt"]
    return {"status": "ok", "model_loaded": state["model"] is not None,
            "model_version": ckpt["version"] if ckpt else None}


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if state["model"] is None:
        load_model()
    if state["model"] is None:
        raise HTTPException(status_code=503, detail="No trained model is loaded.")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image is too large.")
    try:
        image = Image.open(io.BytesIO(data)).convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="That file is not a valid image.")

    x = state["transform"](image).unsqueeze(0)
    with torch.no_grad():
        cat_logits, sev_logits = state["model"](x)
    cat_p = torch.softmax(cat_logits, dim=1)[0]
    sev_p = torch.softmax(sev_logits, dim=1)[0]
    cat_i, sev_i = int(cat_p.argmax()), int(sev_p.argmax())
    cat_conf, sev_conf = float(cat_p[cat_i]), float(sev_p[sev_i])
    ckpt = state["ckpt"]
    return {
        "category": ckpt["categories"][cat_i],
        "severity": ckpt["severities"][sev_i],
        # One overall confidence: the weaker of the two answers, so the report is
        # flagged for review if the model is unsure about either one.
        "confidence": round(min(cat_conf, sev_conf), 4),
        "category_confidence": round(cat_conf, 4),
        "severity_confidence": round(sev_conf, 4),
        "model_version": ckpt["version"],
    }
