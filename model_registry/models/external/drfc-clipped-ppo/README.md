# drfc-ppo -- DeepRacer-for-Cloud Clipped PPO

## Overview

A discrete action space model trained via DeepRacer-for-Cloud using the Clipped PPO algorithm. This model uses a fixed table of 5 steering/speed combinations, all at a single low speed. It serves as a conservative baseline for testing the standard DeepRacer inference pipeline.

## Source

- **Origin:** DeepRacer-for-Cloud training environment
- **Algorithm:** Clipped PPO (Proximal Policy Optimization)
- **Network:** DEEP_CONVOLUTIONAL_NETWORK_SHALLOW
- **Sensor:** Front-facing camera (color)
- **Format:** TensorFlow protobuf (`model_49.pb`)
- **Action Space:** Discrete (5 actions)

## Action Table

| Action | Steering | Speed |
| ------ | -------- | ----- |
| 0 | -30 deg (hard right) | 0.6 m/s |
| 1 | -15 deg (soft right) | 0.6 m/s |
| 2 | 0 deg (straight) | 0.6 m/s |
| 3 | +15 deg (soft left) | 0.6 m/s |
| 4 | +30 deg (hard left) | 0.6 m/s |

## How It Works

The model takes a camera frame as input and outputs a single integer (0-4) selecting one row from the action table above. The DeepRacer runtime maps that integer to the corresponding steering angle and speed. The car can only choose from these exact combinations -- there is no in-between.

## Strengths

- **Simple and predictable:** Only 5 possible actions, easy to debug and understand
- **Fast training convergence:** Smaller action space means fewer choices to evaluate
- **Low speed:** 0.6 m/s is safe for initial physical testing -- less risk of crashes
- **Standard format:** Compatible with the default DeepRacer runtime out of the box
- **Good baseline:** Useful for verifying the inference pipeline works before trying more complex models

## Limitations

- **No speed variation:** All actions use the same 0.6 m/s, so the car cannot speed up on straights or slow down for turns
- **Coarse steering:** Only 5 angles (-30, -15, 0, 15, 30), so turns are jerky rather than smooth
- **Discrete jumps:** Cannot choose intermediate values like 7 degrees or 1.2 m/s
- **Not suitable for competitive racing:** Too slow and imprecise for optimized lap times
- **Requires model_metadata.json:** Standard DeepRacer runtime reads this file to understand the action space

## Compatibility

| Runtime | Compatible | Notes |
| ------- | ---------- | ----- |
| Standard DeepRacer | Yes | Uses model_metadata.json for action mapping |
| Our custom vehicle runtime | Needs adapter | OnnxSteeringPredictor expects a single float, not a discrete action index |
| Simulator | Yes | Can replay through standard DRfC pipeline |

## Files in This Directory

- `model_metadata.json` -- Action space definition, sensor config, network type
- `model_49.pb` -- Model binary (not committed to git; place the extracted `.gz` contents here)

## When to Use This Model

- Testing that the inference pipeline works end to end
- Verifying camera input preprocessing is correct
- Comparing discrete vs continuous action space behavior
- As a safe, slow baseline for first physical car tests
