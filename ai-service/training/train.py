"""Train and evaluate the CivicTrack model (Section 3.4.4 of the report).

Your data folder must contain:
    images/        the photos
    labels.csv     columns: filename,category,severity

    python training/train.py --data-dir data/real

Steps: split (train/validation/test) -> stage 1 (train new layers only) -> stage 2 (fine-tune the top
of MobileNetV2) -> test ONCE on unseen photos -> save the model and the results.
"""
import argparse
import csv
import json
import os
import random
import sys
import time

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torch.utils.data import DataLoader, Dataset

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.model import CATEGORIES, SEVERITIES, CivicNet, eval_transform, save_checkpoint, train_transform  # noqa: E402


class PhotoSet(Dataset):
    def __init__(self, rows, image_dir, transform):
        self.rows, self.image_dir, self.transform = rows, image_dir, transform

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        r = self.rows[i]
        img = Image.open(os.path.join(self.image_dir, r["filename"])).convert("RGB")
        return self.transform(img), CATEGORIES.index(r["category"]), SEVERITIES.index(r["severity"])


def read_labels(data_dir):
    rows, problems = [], []
    with open(os.path.join(data_dir, "labels.csv"), newline="") as f:
        for r in csv.DictReader(f):
            r = {k: (v or "").strip() for k, v in r.items()}
            if r.get("category") not in CATEGORIES:
                problems.append(f"{r.get('filename')}: unknown category '{r.get('category')}'")
            elif r.get("severity") not in SEVERITIES:
                problems.append(f"{r.get('filename')}: unknown severity '{r.get('severity')}'")
            elif not os.path.exists(os.path.join(data_dir, "images", r["filename"])):
                problems.append(f"{r['filename']}: file not found in images/")
            else:
                rows.append(r)
    if problems:
        print("Problems in labels.csv (these rows are skipped):")
        for p in problems[:20]:
            print("  -", p)
    return rows


def split(rows, val_frac, test_frac, seed):
    """Stratified split so each part has a similar mix of categories."""
    from sklearn.model_selection import train_test_split
    keys = [r["category"] for r in rows]
    idx = list(range(len(rows)))
    trainval, test = train_test_split(idx, test_size=test_frac, stratify=keys, random_state=seed)
    keys_tv = [keys[i] for i in trainval]
    train, val = train_test_split(trainval, test_size=val_frac / (1 - test_frac), stratify=keys_tv, random_state=seed)
    return [rows[i] for i in train], [rows[i] for i in val], [rows[i] for i in test]


def run_epoch(model, loader, device, optimiser=None):
    training = optimiser is not None
    model.train(training)
    ce = nn.CrossEntropyLoss()
    total, loss_sum, cat_ok, sev_ok = 0, 0.0, 0, 0
    with torch.set_grad_enabled(training):
        for x, yc, ys in loader:
            x, yc, ys = x.to(device), yc.to(device), ys.to(device)
            oc, os_ = model(x)
            loss = ce(oc, yc) + ce(os_, ys)
            if training:
                optimiser.zero_grad(); loss.backward(); optimiser.step()
            n = len(x); total += n; loss_sum += loss.item() * n
            cat_ok += (oc.argmax(1) == yc).sum().item(); sev_ok += (os_.argmax(1) == ys).sum().item()
    return loss_sum / total, cat_ok / total, sev_ok / total


def predict_all(model, loader, device):
    model.eval(); yc_all, pc_all, ys_all, ps_all = [], [], [], []
    with torch.no_grad():
        for x, yc, ys in loader:
            oc, os_ = model(x.to(device))
            yc_all += yc.tolist(); ys_all += ys.tolist()
            pc_all += oc.argmax(1).cpu().tolist(); ps_all += os_.argmax(1).cpu().tolist()
    return yc_all, pc_all, ys_all, ps_all


def evaluate(model, loader, device, out_dir):
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, precision_recall_fscore_support
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    yc, pc, ys, ps = predict_all(model, loader, device)
    results = {}
    for name, y, p, labels in [("category", yc, pc, CATEGORIES), ("severity", ys, ps, SEVERITIES)]:
        idx = list(range(len(labels)))
        prec, rec, f1, sup = precision_recall_fscore_support(y, p, labels=idx, zero_division=0)
        mp, mr, mf, _ = precision_recall_fscore_support(y, p, labels=idx, average="macro", zero_division=0)
        cm = confusion_matrix(y, p, labels=idx)
        results[name] = {
            "accuracy": accuracy_score(y, p),
            "macro_precision": mp, "macro_recall": mr, "macro_f1": mf,
            "per_class": {labels[i]: {"precision": prec[i], "recall": rec[i], "f1": f1[i], "support": int(sup[i])} for i in idx},
            "confusion_matrix": cm.tolist(),
        }
        with open(os.path.join(out_dir, f"report_{name}.txt"), "w") as f:
            f.write(classification_report(y, p, labels=idx, target_names=labels, zero_division=0))
        fig, ax = plt.subplots(figsize=(5.5, 4.8), dpi=160)
        ax.imshow(cm, cmap="Blues")
        ax.set_xticks(idx); ax.set_xticklabels(labels, rotation=30, ha="right"); ax.set_yticks(idx); ax.set_yticklabels(labels)
        ax.set_xlabel("Predicted"); ax.set_ylabel("Actual"); ax.set_title(f"Confusion matrix: {name}")
        for i in idx:
            for j in idx:
                ax.text(j, i, cm[i, j], ha="center", va="center", color="white" if cm[i, j] > cm.max() / 2 else "black")
        fig.tight_layout(); fig.savefig(os.path.join(out_dir, f"confusion_{name}.png")); plt.close(fig)
    return results


def plot_history(history, out_dir):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    ep = [h["epoch"] for h in history]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10, 4), dpi=160)
    a1.plot(ep, [h["train_loss"] for h in history], label="Training"); a1.plot(ep, [h["val_loss"] for h in history], label="Validation")
    a1.set_title("Loss"); a1.set_xlabel("Epoch"); a1.legend()
    a2.plot(ep, [h["val_cat_acc"] for h in history], label="Category"); a2.plot(ep, [h["val_sev_acc"] for h in history], label="Severity")
    a2.set_title("Validation accuracy"); a2.set_xlabel("Epoch"); a2.legend()
    fig.tight_layout(); fig.savefig(os.path.join(out_dir, "training_curves.png")); plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--out-dir", default="models")
    ap.add_argument("--image-size", type=int, default=224)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--epochs-head", type=int, default=5, help="stage 1 epochs (new layers only)")
    ap.add_argument("--epochs-finetune", type=int, default=10, help="stage 2 epochs (top of MobileNetV2 too)")
    ap.add_argument("--lr-head", type=float, default=1e-3)
    ap.add_argument("--lr-finetune", type=float, default=1e-4)
    ap.add_argument("--unfreeze-from", type=int, default=14, help="MobileNetV2 block index to unfreeze from in stage 2")
    ap.add_argument("--patience", type=int, default=4)
    ap.add_argument("--val-frac", type=float, default=0.15)
    ap.add_argument("--test-frac", type=float, default=0.15)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--no-pretrained", action="store_true", help="do not download ImageNet weights (only for offline tests)")
    a = ap.parse_args()

    random.seed(a.seed); np.random.seed(a.seed); torch.manual_seed(a.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    os.makedirs(a.out_dir, exist_ok=True)
    print(f"Training on: {device}")

    rows = read_labels(a.data_dir)
    if len(rows) < 40:
        sys.exit(f"Only {len(rows)} usable labelled images found. Collect more photos first (see LABELLING.md).")
    for c in CATEGORIES:
        n = sum(r["category"] == c for r in rows)
        print(f"  {c}: {n} images")
        if n < 10:
            sys.exit(f"Category '{c}' has only {n} images. Each category needs many more photos.")
    train_rows, val_rows, test_rows = split(rows, a.val_frac, a.test_frac, a.seed)
    print(f"Split: {len(train_rows)} train, {len(val_rows)} validation, {len(test_rows)} test")
    with open(os.path.join(a.out_dir, "splits.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(["filename", "category", "severity", "split"])
        for name, part in [("train", train_rows), ("validation", val_rows), ("test", test_rows)]:
            for r in part:
                w.writerow([r["filename"], r["category"], r["severity"], name])

    image_dir = os.path.join(a.data_dir, "images")
    mk = lambda rs, tf, sh: DataLoader(PhotoSet(rs, image_dir, tf), batch_size=a.batch_size, shuffle=sh, num_workers=0)
    train_dl = mk(train_rows, train_transform(a.image_size), True)
    val_dl = mk(val_rows, eval_transform(a.image_size), False)
    test_dl = mk(test_rows, eval_transform(a.image_size), False)

    model = CivicNet(pretrained=not a.no_pretrained).to(device)
    best_path = os.path.join(a.out_dir, "civictrack_model.pt")
    history, best_score, epoch = [], -1.0, 0

    def stage(name, epochs, params, lr):
        nonlocal best_score, epoch
        opt = torch.optim.Adam(params, lr=lr)
        stale = 0
        for _ in range(epochs):
            epoch += 1; t0 = time.time()
            tl, tc, ts = run_epoch(model, train_dl, device, opt)
            vl, vc, vs = run_epoch(model, val_dl, device)
            history.append({"epoch": epoch, "stage": name, "train_loss": tl, "val_loss": vl, "val_cat_acc": vc, "val_sev_acc": vs})
            score = (vc + vs) / 2
            flag = ""
            if score > best_score:
                best_score, stale = score, 0
                save_checkpoint(model, best_path, a.image_size, time.strftime("v%Y%m%d-%H%M"))
                flag = "  <- best so far, saved"
            else:
                stale += 1
            print(f"[{name}] epoch {epoch}: train loss {tl:.3f} | val loss {vl:.3f} | val category acc {vc:.2f} | val severity acc {vs:.2f} ({time.time()-t0:.0f}s){flag}")
            if stale >= a.patience:
                print("Validation stopped improving, stopping early."); break

    if a.no_pretrained:
        # Offline test mode: a randomly started backbone has nothing worth freezing, so train everything.
        print("No pretrained weights: training all layers (test mode only).")
        stage("stage 1", a.epochs_head, list(model.parameters()), a.lr_head)
    else:
        # Stage 1: only the new output layers learn
        for p in model.features.parameters():
            p.requires_grad = False
        stage("stage 1", a.epochs_head, list(model.category_head.parameters()) + list(model.severity_head.parameters()), a.lr_head)
    # Stage 2: unfreeze the top blocks and fine-tune gently
    for i, block in enumerate(model.features):
        for p in block.parameters():
            p.requires_grad = i >= a.unfreeze_from
    stage("stage 2", a.epochs_finetune, [p for p in model.parameters() if p.requires_grad], a.lr_finetune)

    # Final test: ONE time, on photos the model never saw, using the best saved model
    from app.model import load_checkpoint
    best_model, _ = load_checkpoint(best_path)
    results = evaluate(best_model.to(device), test_dl, device, a.out_dir)
    plot_history(history, a.out_dir)
    summary = {"test_images": len(test_rows), "best_validation_score": best_score, "results": results, "history": history}
    with open(os.path.join(a.out_dir, "metrics.json"), "w") as f:
        json.dump(summary, f, indent=2)
    print("\n=== Test results (unseen photos) ===")
    for name in ("category", "severity"):
        r = results[name]
        print(f"{name:9s} accuracy {r['accuracy']:.3f} | macro precision {r['macro_precision']:.3f} | recall {r['macro_recall']:.3f} | F1 {r['macro_f1']:.3f}")
    print(f"Saved model and results in {a.out_dir}/")


if __name__ == "__main__":
    main()
