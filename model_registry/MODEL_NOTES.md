# Model Notes

Running record of model information, teammate observations, and configuration details. Add new entries at the top.

---

## drfc-ppo -- DeepRacer-for-Cloud Clipped PPO

**Registry ID:** `drfc-ppo`
**Source:** External (DeepRacer-for-Cloud)
**Format:** TensorFlow protobuf (`model_49.pb`)
**Action Space:** Discrete, 5 actions
**Algorithm:** Clipped PPO
**Network:** DEEP_CONVOLUTIONAL_NETWORK_SHALLOW
**Preprocessing:** Standard (color)
**Status:** Ready (binary not committed, place `.gz` contents in `models/external/drfc-clipped-ppo/`)

### Action Table

| Action | Steering | Speed |
| ------ | -------- | ----- |
| 0 | -30 deg | 0.6 m/s |
| 1 | -15 deg | 0.6 m/s |
| 2 | 0 deg | 0.6 m/s |
| 3 | 15 deg | 0.6 m/s |
| 4 | 30 deg | 0.6 m/s |

### Notes

- Single speed (0.6 m/s), steering only varies
- Good baseline for testing discrete action space compatibility
- Needs `model_metadata.json` for standard DeepRacer runtime

---

## center-align -- CenterAlign Continuous PPO

**Registry ID:** `center-align`
**Source:** External (AWS Console / DRfC)
**Format:** TensorFlow protobuf
**Action Space:** Continuous
**Algorithm:** Clipped PPO
**Network:** DEEP_CONVOLUTIONAL_NETWORK_SHALLOW
**Preprocessing:** Greyscale
**Status:** Ready (archive: `CenterAlignModel-model.tar.gz`)

### Action Bounds

| Parameter | Min | Max |
| --------- | --- | --- |
| Steering | -30 deg | 30 deg |
| Speed | 1.25 m/s | 2.8 m/s |

### Configuration Notes

- Continuous action space -- agent picks any value within the bounds
- Greyscale preprocessing (different from drfc-ppo which uses color)
- Higher speed range than drfc-ppo (1.25-2.8 vs 0.6)
- Needs `model_metadata.json` for standard DeepRacer runtime

### Teammate Observations (2026-03-22)

- "Interesting, it is continuous not discrete. May be that fits to the web trained models."
- "AWS console had all these config, now it is some config which we have to figure out."
- Shared reference: [AWS DeepRacer Models For Beginners - Bahman Javadi](https://www.linkedin.com/pulse/aws-deepracer-models-beginners-bahman-javadi)
- Takeaway: Continuous is the natural fit for our behavioral cloning models because BC outputs continuous steering floats, not discrete action indices. Training outside the console means we handle config manually, but our BC path bypasses the standard action space entirely.

---

## Class BC Models (Planned)

**Registry ID:** TBD (first will be registered under `models/class/`)
**Source:** Student simulator driving data
**Format:** ONNX
**Action Space:** N/A -- bypasses DeepRacer action space
**Algorithm:** Supervised learning (behavioral cloning, PilotNet CNN)
**Network:** PilotNet (5 conv layers + 3 FC layers)
**Preprocessing:** 160x120 RGB, normalized to [0, 1]
**Status:** Not yet trained

### How It Differs From RL Models

- No `model_metadata.json` needed
- No reward function, no action space definition
- Single output: steering float in [-1, 1]
- Talks directly to `OnnxSteeringPredictor` in the vehicle runtime
- Trained on student driving demonstrations, not reinforcement learning

### Pipeline

1. Students drive in simulator, collecting camera frames + steering commands
2. Data aggregated and cleaned (remove crashes, normalize)
3. PilotNet CNN trained with MSE loss on steering prediction
4. Exported to ONNX format
5. Validated for input/output shape compatibility with vehicle runtime
6. Registered in model registry and deployed to car

See [Class Model Adaptation Plan](../docs/class-model-adaptation-plan.md) for full details.

---

## Reference: Config Needed Per Model Type

| Model Type | model_metadata.json | Reward Function | Action Space Config |
| ---------- | ------------------- | --------------- | ------------------- |
| AWS Console RL | Auto-generated | Written in console | Set in console |
| DRfC / External RL | Manual | Manual | Manual |
| Class BC (PilotNet) | Not needed | Not applicable | Not applicable |

See [Action Space and Model Config](../docs/action-space-and-model-config.md) for detailed explanation.
