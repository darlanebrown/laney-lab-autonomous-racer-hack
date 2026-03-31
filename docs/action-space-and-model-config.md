# Continuous vs Discrete Action Spaces and Model Configuration

This document explains how AWS DeepRacer action spaces work, what configuration is needed when training models outside the AWS console, and how our three model paths handle this differently.

## What Is an Action Space?

An action space defines the set of driving choices available to the car at each moment. Think of it as the "menu" the AI picks from when deciding how to steer and how fast to go.

AWS DeepRacer supports two types:

## Discrete Action Space

The agent picks from a fixed table of predefined actions.

**Example default table:**

| Action | Steering | Speed |
|--------|----------|-------|
| 0 | -30 degrees | 0.4 m/s |
| 1 | -30 degrees | 0.8 m/s |
| 2 | -15 degrees | 0.4 m/s |
| 3 | -15 degrees | 0.8 m/s |
| 4 | 0 degrees | 0.4 m/s |
| 5 | 0 degrees | 0.8 m/s |
| 6 | 15 degrees | 0.4 m/s |
| 7 | 15 degrees | 0.8 m/s |
| 8 | 30 degrees | 0.4 m/s |
| 9 | 30 degrees | 0.8 m/s |

**Key characteristics:**

- The car can only choose from these exact combinations
- Steering jumps between fixed angles (no in-between values)
- Faster to train because there are fewer choices to evaluate
- Algorithm: PPO only
- Our registered model `drfc-ppo` uses this type

## Continuous Action Space

The agent picks any value within a defined range.

**Example:**

- Steering: any angle from -20 to +20 degrees
- Speed: any value from 0.75 to 4.0 m/s

**Key characteristics:**

- The car can choose smooth, precise values (e.g., 7.3 degrees at 1.2 m/s)
- Produces smoother, more natural driving behavior
- Takes longer to train because the search space is much larger
- Algorithm: PPO or SAC (Soft Actor-Critic)
- Our registered model `center-align` uses this type

## Why Continuous Is the Natural Fit for Our Class Models

Our behavioral cloning (PilotNet) models learn by watching students drive. The model outputs a single continuous steering float in the range [-1, 1]. This is inherently a continuous output -- the model does not pick from a menu of fixed actions.

If we tried to force this into a discrete action space, we would lose granularity. A student's smooth 12.7-degree turn would get snapped to the nearest option (e.g., 15 degrees), degrading driving quality.

Continuous action spaces preserve the full range of steering precision that behavioral cloning naturally produces.

## Configuration: Console vs Outside Console

### Training in the AWS Console

The console auto-generates all configuration:

- `model_metadata.json` with action space type, bounds, sensor, and network info
- Reward function (written in the console UI)
- Hyperparameters (set via sliders/fields)
- Action space definition (configured via the console)

You download the trained model and everything is bundled together.

### Training Outside the Console (DeepRacer-for-Cloud, Custom Pipelines)

When training outside the AWS console, you must manually create:

| Config File | What It Defines | Notes |
|-------------|----------------|-------|
| `model_metadata.json` | Action space type (discrete/continuous), steering and speed bounds, sensor type (camera/lidar/both), neural network backbone | Must match the model architecture exactly |
| Reward function | Python function scoring agent behavior during training | Defines what "good driving" means |
| Hyperparameters | Learning rate, batch size, epochs, discount factor, entropy, etc. | Tuning these significantly affects training quality |
| Action space definition | Discrete action table OR continuous min/max bounds | Lives inside `model_metadata.json` |

This is the "config which we have to figure out" -- the AWS console handled it automatically, but training independently requires understanding and setting each piece.

## Our Three Model Paths

### Path 1: External RL Models

**Examples:** `drfc-ppo` (discrete), `center-align` (continuous)

- Trained via AWS console or DeepRacer-for-Cloud
- Come with `model_metadata.json` already defined
- We register them as-is in `models/external/`
- The vehicle runtime reads `model_metadata.json` to understand the action space

### Path 2: Class Behavioral Cloning Models

**Source:** Student simulator driving data, trained with PilotNet CNN

- Output: single continuous steering float in [-1, 1]
- Do NOT need `model_metadata.json` at all
- They bypass the standard DeepRacer action space entirely
- Talk directly to `OnnxSteeringPredictor` in our custom vehicle runtime
- Registered under `models/class/`
- This is the simplest path to get student data onto the physical car

### Path 3: Future TensorFlow/RL Adapter (Not Yet Implemented)

- Would need a compatibility shim to translate between RL action space outputs and our vehicle runtime's expected single steering float
- Relevant if we want to run standard AWS-trained RL models through our custom runtime
- Lower priority until Paths 1 and 2 are proven

## Quick Reference: Which Config Do I Need?

| Model Type | model_metadata.json | Reward Function | Hyperparams | Action Space Config |
|------------|-------------------|-----------------|-------------|-------------------|
| AWS Console RL | Auto-generated | Written in console | Set in console | Set in console |
| DeepRacer-for-Cloud RL | Manual | Manual | Manual | Manual |
| Class BC (PilotNet) | Not needed | Not applicable | Training script | Not applicable |

## References

- [AWS DeepRacer Action Space Documentation](https://docs.aws.amazon.com/deepracer/latest/developerguide/deepracer-how-it-works-action-space.html)
- [SAC with Continuous Action Spaces (AWS Blog)](https://aws.amazon.com/blogs/machine-learning/using-the-aws-deepracer-new-soft-actor-critic-algorithm-with-continuous-action-spaces/)
- [AWS DeepRacer Models For Beginners - Bahman Javadi](https://www.linkedin.com/pulse/aws-deepracer-models-beginners-bahman-javadi) (shared by teammate)
- [Class Model Adaptation Plan](class-model-adaptation-plan.md) (our internal pipeline doc)

---

Last updated: March 22, 2026
