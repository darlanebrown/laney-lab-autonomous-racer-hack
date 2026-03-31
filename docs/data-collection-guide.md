# Data Collection Guide for BC Model Training

This guide explains how to collect high-quality driving data in the simulator
to train the behavioral cloning (imitation learning) model.

## Why Data Quality Matters

The BC model learns exactly what you show it. Good data = good model.
Bad data = a model that reproduces your mistakes.

- **More data is better** -- but only if it is clean
- **Diverse data is better** -- vary tracks, speeds, and operators
- **Recovery data is essential** -- the model must learn what to do when
  it drifts off-center, not just how to drive perfectly

## Recommended Training Plan

### Phase 1: Baseline (minimum viable model)

| Track | Laps | Speed | Priority |
| --- | --- | --- | --- |
| Oval | 10 | Medium | High |
| Stadium | 10 | Medium | High |
| Training Gauntlet | 15 | Medium | High |

**Goal:** 35 laps of clean, centered driving. This gives the model a solid
foundation of basic steering behavior.

### Phase 2: Diversity

| Track | Laps | Speed | Priority |
| --- | --- | --- | --- |
| S-Curves | 10 | Medium-Fast | Medium |
| Training Gauntlet | 10 | Varied | High |
| City Circuit | 5 | Slow-Medium | Medium |

**Goal:** Add turn variety and speed variation. The Training Gauntlet is
most important because it has the widest range of steering situations.

### Phase 3: Recovery and Edge Cases

| Track | Laps | Speed | Priority |
| --- | --- | --- | --- |
| Training Gauntlet | 10 | Medium | High |
| Classroom Lab A/B/C | 5 each | Slow | Medium |

**Goal:** Intentionally messy driving. Drift to the edge and recover.
This is the most valuable data for real-world robustness.

## Driving Tips for Data Collection

### Do

- **Stay smooth** -- avoid jerky steering inputs, especially on baseline laps
- **Look ahead** -- steer based on where the track is going, not where you are
- **Vary your speed** -- some laps fast, some slow, some mixed
- **Drive both directions** -- if the track allows it, do half CW and half CCW
- **Include recovery** -- on dedicated recovery laps, intentionally drift
  to one side and steer back. This teaches the model what correction looks like.
- **Use multiple operators** -- different people drive differently, and that
  diversity helps the model generalize

### Do Not

- **Do not drive off-track** -- if you go off, discard that run or trim it
- **Do not stop mid-lap** -- a stopped car with non-zero steering confuses
  the model (steering should correlate with motion)
- **Do not use keyboard steering if possible** -- keyboard input is binary
  (full left / full right / none), which is poor training signal for a
  continuous steering model. Use a controller or mouse if available.
- **Do not collect data on only one track** -- single-track models overfit

## How to Record Runs

In the simulator, driving in manual mode automatically records frames and
steering inputs. After each session:

1. Complete your laps in the simulator
2. The run is uploaded to the shared API automatically
3. Verify the run appears in the API: `GET /api/runs?mode=manual`

To trigger a training job with the new data:

```bash
# Create and run a training job
curl -X POST "$API_URL/api/train/jobs" \
  -H "Content-Type: application/json" \
  -d '{"dataset":{"modes":["manual"]},"hyperparams":{"epochs":10},"export":{"onnx":true}}'

python -m trainer.train_job_runner --api-url "$API_URL" --job-id "<job_id>" --set-active
```

## Data Augmentation (automatic)

The trainer now applies augmentation automatically during training:

- **Horizontal flip** (50% chance) -- mirrors image and negates steering,
  effectively doubling left/right turn coverage
- **Brightness jitter** (40%) -- simulates different lighting conditions
- **Contrast jitter** (30%) -- helps with varying camera exposure
- **Random shadow** (30%) -- simulates partial lighting/shadow
- **Gaussian noise** (20%) -- adds sensor noise robustness
- **Horizontal translation** (40%) -- shifts image left/right and adjusts
  steering, simulating off-center positions. This is the most important
  augmentation for BC because it generates synthetic recovery data.

No action needed -- augmentation is on by default. To disable:

```python
train_from_dataset_snapshot(dataset_root, artifacts_dir, augment=False)
```

## How Much Data is Enough?

| Data Amount | Expected Quality |
| --- | --- |
| < 500 frames | Too little -- model will overfit |
| 500 - 2,000 frames | Minimum viable -- works on training tracks only |
| 2,000 - 10,000 frames | Good -- starts generalizing to new tracks |
| 10,000 - 50,000 frames | Strong -- robust to lighting and position variation |
| 50,000+ frames | Diminishing returns without architecture changes |

With augmentation enabled, your effective dataset is roughly 3-4x larger
than raw frame count.

## Track Recommendation

**Use the Training Gauntlet track for the majority of data collection.**
It was designed specifically to maximize steering diversity per lap:

- Long straight (zero steering)
- Gentle sweeper (mild constant steering)
- Chicane (rapid corrections)
- Tightening turn (progressive steering increase)
- Hairpin (maximum steering input)
- S-curve (smooth transitions)

One lap on the Training Gauntlet generates more diverse training signal
than 3-4 laps on the Oval.

See `docs/training-track-design.md` for the full design rationale.
