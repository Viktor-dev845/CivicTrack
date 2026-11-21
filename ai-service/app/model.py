"""The CivicTrack image model: MobileNetV2 (transfer learning) with two output heads.

One shared MobileNetV2 backbone looks at the photo. Two small output layers sit on top:
  - category head: pothole / damaged_streetlight / waste_dump / drainage
  - severity head: low / medium / high
"""
import torch
import torch.nn as nn
from torchvision import transforms
from torchvision.models import mobilenet_v2, MobileNet_V2_Weights

CATEGORIES = ["pothole", "damaged_streetlight", "waste_dump", "drainage"]
SEVERITIES = ["low", "medium", "high"]
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


class CivicNet(nn.Module):
    def __init__(self, pretrained=True, n_categories=len(CATEGORIES), n_severities=len(SEVERITIES)):
        super().__init__()
        weights = MobileNet_V2_Weights.IMAGENET1K_V1 if pretrained else None
        backbone = mobilenet_v2(weights=weights)
        self.features = backbone.features            # the pre-trained part
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.dropout = nn.Dropout(0.2)
        self.category_head = nn.Linear(1280, n_categories)   # new layers, trained on our photos
        self.severity_head = nn.Linear(1280, n_severities)

    def forward(self, x):
        x = self.pool(self.features(x)).flatten(1)
        x = self.dropout(x)
        return self.category_head(x), self.severity_head(x)


def eval_transform(image_size=224):
    return transforms.Compose([
        transforms.Resize((image_size, image_size)),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])


def train_transform(image_size=224):
    return transforms.Compose([
        transforms.RandomResizedCrop(image_size, scale=(0.7, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(10),
        transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])


def save_checkpoint(model, path, image_size, version, extra=None):
    torch.save({
        "state_dict": model.state_dict(),
        "categories": CATEGORIES,
        "severities": SEVERITIES,
        "image_size": image_size,
        "version": version,
        "extra": extra or {},
    }, path)


def load_checkpoint(path):
    ckpt = torch.load(path, map_location="cpu", weights_only=False)
    model = CivicNet(pretrained=False, n_categories=len(ckpt["categories"]), n_severities=len(ckpt["severities"]))
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    return model, ckpt
