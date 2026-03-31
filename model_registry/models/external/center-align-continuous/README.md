# center-align -- CenterAlign Continuous PPO

## Overview

A continuous action space model trained to follow the center line of the track. Unlike the discrete drfc-ppo model, this model picks any steering angle and speed within a defined range, producing smoother and faster driving. It uses greyscale preprocessing, which reduces input complexity.

## Source

- **Origin:** AWS DeepRacer Console or DeepRacer-for-Cloud
- **Algorithm:** Clipped PPO (Proximal Policy Optimization)
- **Network:** DEEP_CONVOLUTIONAL_NETWORK_SHALLOW
- **Sensor:** Front-facing camera (greyscale)
- **Format:** TensorFlow protobuf
- **Action Space:** Continuous
- **Preprocessing:** GREY_SCALE (single channel, not RGB)

## Action Bounds

| Parameter | Min | Max |
| --------- | --- | --- |
| Steering | -30 deg | +30 deg |
| Speed | 1.25 m/s | 2.8 m/s |

The model outputs two continuous values within these ranges. It can choose any steering angle between -30 and +30 degrees and any speed between 1.25 and 2.8 m/s. This allows smooth, gradual adjustments rather than jumping between fixed options.

## How It Works

The model takes a greyscale camera frame as input and outputs two floating-point values: a steering angle and a speed. The DeepRacer runtime applies these directly as motor commands. Because the values are continuous, the car can make fine-grained adjustments -- for example, a gentle 7.3-degree turn at 2.1 m/s.

## Strengths

- **Smooth driving:** Continuous values produce gradual steering and speed changes, closer to how humans drive
- **Higher speed range:** 1.25-2.8 m/s allows the model to speed up on straights and slow for turns (vs drfc-ppo's fixed 0.6 m/s)
- **Full steering precision:** Any angle from -30 to +30, not just 5 fixed options
- **Natural fit for behavioral cloning:** Our class BC models also output continuous values, so this model validates the continuous inference path
- **Greyscale preprocessing:** Simpler input (1 channel vs 3) can reduce noise and focus on track features

## Limitations

- **Longer training time:** Continuous action spaces take longer to converge because the search space is much larger
- **Greyscale only:** Uses single-channel input, which means it cannot distinguish colors (e.g., red vs blue track markings). Our class BC models use RGB, so the preprocessing path differs
- **Sensitive to reward function:** Continuous models are more affected by reward function design choices
- **Higher speeds = higher risk:** 2.8 m/s is significantly faster than drfc-ppo; more likely to crash during physical testing
- **Requires model_metadata.json:** Standard DeepRacer runtime reads this file for action bounds and preprocessing type

## Comparison with drfc-ppo

| Feature | drfc-ppo | center-align |
| ------- | -------- | ------------ |
| Action space | Discrete (5 actions) | Continuous (ranges) |
| Steering | -30, -15, 0, 15, 30 | -30 to +30 (any value) |
| Speed | 0.6 m/s (fixed) | 1.25 to 2.8 m/s (range) |
| Preprocessing | Color (RGB) | Greyscale |
| Driving style | Jerky, safe | Smooth, faster |
| Training speed | Faster | Slower |
| Physical test risk | Low | Medium |

## Compatibility

| Runtime | Compatible | Notes |
| ------- | ---------- | ----- |
| Standard DeepRacer | Yes | Uses model_metadata.json for bounds and preprocessing |
| Our custom vehicle runtime | Needs adapter | OnnxSteeringPredictor expects single steering float; this outputs steering + speed pair |
| Simulator | Yes | Can replay through standard DRfC pipeline |

## Teammate Observations

**2026-03-22:** "Interesting, it is continuous not discrete. May be that fits to the web trained models. AWS console had all these config, now it is some config which we have to figure out."

- Shared reference: [AWS DeepRacer Models For Beginners - Bahman Javadi](https://www.linkedin.com/pulse/aws-deepracer-models-beginners-bahman-javadi)
- Key insight: Continuous is the natural fit for our behavioral cloning models since they output continuous steering floats directly

## Files in This Directory

- `model_metadata.json` -- Action bounds, sensor config, preprocessing type, network type
- `CenterAlignModel-model.tar.gz` -- Model archive containing the TF protobuf and related files

## When to Use This Model

- Validating the continuous action space inference pipeline
- Testing smooth driving behavior vs discrete jerky driving
- Benchmarking against class BC models (both use continuous output)
- Physical car testing when you want faster speeds than drfc-ppo
- Evaluating greyscale vs color preprocessing impact
