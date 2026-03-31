# SDC-Lab NaviGator Model

## Overview

The NaviGator model is the most advanced of three physical-racing models
published by the SDC Lab at Western Sydney University. It combines multiple
reward signals and is tuned for stable physical track performance.

## Source

- **Repository:** <https://github.com/SDC-Lab/DeepRacer-Models>
- **Team:** SDC Lab, Western Sydney University
- **License:** MIT
- **Paper/guide:** <https://sdclab.cdms.westernsydney.edu.au/?page_id=362>

## Algorithm and Action Space

- **Algorithm:** PPO (Clipped)
- **Action space:** Discrete
- **Neural network:** Deep Convolutional Network (Shallow)
- **Sensor:** Front-facing camera (single)

## Reward Function Strategy

The NaviGator uses a composite reward that balances:

1. **Center-line tracking** -- higher reward closer to the center
2. **Speed incentive** -- rewards maintaining speed
3. **Heading alignment** -- rewards pointing in the correct direction
4. **Off-track penalty** -- proportional penalty for distance from center

This multi-signal approach produces models that are more robust on physical
tracks than single-objective reward functions.

## Strengths

- Tested on physical tracks with video evidence
- Balances speed and stability (does not just optimize for one)
- Discrete action space converges faster and is more predictable
- Published hyperparameters and training reward graphs included
- Good starting point for comparison against our class models

## Limitations

- Not the absolute fastest (stability-focused trade-off)
- Trained on specific tracks -- may need retraining for different layouts
- Discrete actions limit fine-grained steering control

## How to Use

1. Download model artifacts from the SDC-Lab repo:

   ```bash
   git clone https://github.com/SDC-Lab/DeepRacer-Models.git
   cp -r DeepRacer-Models/models/NaviGator/* model_registry/models/external/sdc-navigator/
   ```

2. Register and set active:

   ```bash
   python -m model_registry.cli set-active sdc-navigator
   ```

## Files Expected

After downloading from the SDC-Lab repo:

- `model.pb` or `model.tar.gz` -- trained model artifact
- `model_metadata.json` -- action space and network configuration
- `reward_function.py` -- the reward function used for training

## Comparison with Other Models

| Property | drfc-ppo | center-align | NaviGator |
| --- | --- | --- | --- |
| Action space | Discrete (5) | Continuous | Discrete |
| Algorithm | Clipped PPO | PPO | Clipped PPO |
| Speed focus | Medium | High | Balanced |
| Stability | Good | Variable | Good |
| Physical tested | No | No | Yes (video) |
| Reward type | Single signal | Single signal | Multi-signal |
