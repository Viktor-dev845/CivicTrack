# Photo collection and labelling guide

Your photos are what the AI learns from. Good photos and honest labels matter more than any code.

## What to collect

Four categories. Use these exact words in `labels.csv`:

| category | what the photo shows |
|---|---|
| `pothole` | holes, cracks or broken road surface |
| `damaged_streetlight` | broken, leaning, dark or vandalised streetlights |
| `waste_dump` | piles of refuse, overflowing bins, illegal dumping |
| `drainage` | blocked, broken or overflowing drains and gutters |

**How many?** Aim for **100 to 200 photos per category** (400 to 800 in total). 60 per category is the
bare minimum. Fewer photos means weaker results, and you must say so in Chapter 5.

Photograph in many conditions: day and early evening, sunny and wet, close and far, different roads and areas,
different phones if possible. If every photo is taken from one spot at one time, the model only learns that spot.
Take several photos of the same problem only if they are clearly different angles, and keep them together (see "Splitting" below).

Add public photos too (the report says the dataset combines your own and public images). Keep a note of where
each public set came from so you can cite it in the References.

**Privacy:** avoid faces and car number plates where you can.

## Severity: the written guideline (copy this into Chapter 3 or an appendix)

| severity | meaning | examples |
|---|---|---|
| `low` | small or cosmetic, no immediate risk, can wait for routine repair | hairline cracks, a few pieces of litter, a light that flickers |
| `medium` | affects normal use, needs scheduled repair | a pothole a wheel would drop into, a streetlight that is out, a drain that is partly blocked |
| `high` | immediate danger to people or blocks the way, handle first | a deep pothole in the traffic lane, a fallen or leaning pole, a drain overflowing onto the road, a large dump blocking the road |

Decide the severity from the photo alone, using this table, before you look at what the AI says.
If you cannot decide, do not include the photo.

## The folder layout

```
data/real/
  images/
    IMG_001.jpg
    IMG_002.jpg
    ...
  labels.csv
```

`labels.csv` (one line per photo, first line is the header):
```
filename,category,severity
IMG_001.jpg,pothole,high
IMG_002.jpg,drainage,medium
```

## Splitting

You do not need to split by hand. `train.py` splits the photos itself into 70% training, 15% validation
and 15% test, and writes `splits.csv` so you can show exactly which photo went where.

One warning: if you took 5 photos of the same pothole, do not let them be spread across the splits, or the
test result will look better than it really is. The easiest fix is to keep only one or two photos per problem.

## Who labels?

Right now the plan in the report is that you label severity yourself. If a colleague or a civil engineer can
check even 50 to 100 of your severity labels, say so in Chapter 3. It makes your results much more believable.
