# Lars Ludvigsen Physical Racing PPO

## Overview

This model slot is reserved for a model trained using the Lars Ludvigsen
physical racing methodology -- the gold standard for DeepRacer physical
track performance. Lars placed 14th at re:Invent 2024 Championship with
a 9.335s best lap on the narrow Forever Raceway.

## Source

- **Author:** Lars Lorentz Ludvigsen (larsll)
- **Training tool:** deepracer-for-aws (<https://github.com/aws-deepracer-community/deepracer-for-aws>)
- **Blog post:** <https://aws.amazon.com/blogs/machine-learning/aws-deepracer-closing-time-at-aws-reinvent-2024-how-did-that-physical-racing-go/>
- **Physical racing guide:** <https://aws.amazon.com/blogs/machine-learning/aws-deepracer-how-to-master-physical-racing/>

## Status

**Not yet trained.** This entry documents the target configuration. The model
must be trained using deepracer-for-cloud with the settings below.

## Algorithm and Action Space

- **Algorithm:** PPO (Clipped)
- **Action space:** Discrete, 7-10 actions
- **Max steering angle:** 20 degrees (with Ackermann patch)
- **Stabilizing angles:** 2.5 and 5.0 degrees (dampens straight-line oscillation)
- **Speed range:** 0.8 - 1.3 m/s (sim speed; roughly 2x in real world due to 15fps vs 30fps)
- **Action space shape:** Inverted chevron (higher speeds for straight actions)

### Recommended Action Space

| Action | Steering (deg) | Speed (m/s) |
| --- | --- | --- |
| 0 | 0.0 | 1.3 |
| 1 | 2.5 | 1.2 |
| 2 | -2.5 | 1.2 |
| 3 | 5.0 | 1.1 |
| 4 | -5.0 | 1.1 |
| 5 | 10.0 | 1.0 |
| 6 | -10.0 | 1.0 |
| 7 | 15.0 | 0.9 |
| 8 | -15.0 | 0.9 |
| 9 | 20.0 | 0.8 |
| 10 | -20.0 | 0.8 |

## Training Configuration

- **Training tracks:** re:Invent 2022 Championship track (complex, diverse turns)
- **Direction:** Both CW and CCW
- **Environment:** Randomized every 5 minutes (walls, lights, buildings change)
- **Entropy floor:** 0.5 (take snapshots before entropy drops below this)
- **Final optimization:** Target track (Forever Raceway or lab track), both directions
- **Steering geometry:** Ackermann patch enabled
- **Training duration:** 8-12 hours for base model, 2-4 hours for final optimization

## Reward Function

Progress/velocity based -- rewards going fast while staying on track:

```python
def reward_function(params):
    progress = params["progress"]
    steps = params["steps"]
    all_wheels_on_track = params["all_wheels_on_track"]
    track_width = params["track_width"]
    distance_from_center = params["distance_from_center"]

    if not all_wheels_on_track:
        return 1e-3

    velocity = progress / max(steps, 1)
    reward = velocity * 100

    marker = track_width * 0.25
    if distance_from_center <= marker:
        reward *= 1.2

    return max(reward, 1e-3)
```

## Key Innovations

1. **Ackermann steering** -- sim physics match real car turning radius
2. **Stabilizing angles** -- 2.5/5.0 degree actions stop straight-line oscillation
3. **Environment randomization** -- model learns to ignore visual noise
4. **Bidirectional training** -- handles any track orientation
5. **Inverted chevron speeds** -- nudges model to prefer going straight

## Strengths

- Specifically designed for physical racing (not just sim performance)
- Solves the straight-line oscillation problem that plagues most models
- Robust to visual noise (different lighting, backgrounds, wall colors)
- Proven at re:Invent Championship level

## Limitations

- Requires deepracer-for-cloud setup for training (not AWS console)
- Ackermann patch is custom (not in stock deepracer-for-cloud)
- Training takes 8-12 hours with GPU
- Tuned for specific speed range -- may need adjustment for different hardware

## How to Train

1. Set up deepracer-for-cloud:

   ```bash
   git clone https://github.com/aws-deepracer-community/deepracer-for-aws.git
   ```

2. Apply Ackermann steering patch (see Lars's blog for details)

3. Configure action space per the table above

4. Set up environment randomization (cron job to change track objects every 5 min)

5. Train on complex tracks, both directions, for 8-12 hours

6. Take snapshots every 1-2 hours

7. Final optimize on target track for 2-4 hours

8. Copy best model artifacts here:

   ```bash
   cp model.pb model_metadata.json reward_function.py \
     model_registry/models/external/lars-physical-ppo/
   ```

9. Register:

   ```bash
   python -m model_registry.cli set-active lars-physical-ppo
   ```
