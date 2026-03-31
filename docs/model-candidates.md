# Model Candidates for DeepRacer

Two categories: (1) a top-tier track racing model, and (2) an exploration
model that navigates without a track using visual waypoints and obstacle
avoidance.

---

## 1. Top-Tier Track Racing: Lars Ludvigsen's Physical Racing Approach

**Source:** Lars Lorentz Ludvigsen -- re:Invent 2024 Championship finalist,
author of deepracer-for-cloud, and widely regarded as the leading expert
on physical DeepRacer racing.

**Blog post:** <https://aws.amazon.com/blogs/machine-learning/aws-deepracer-closing-time-at-aws-reinvent-2024-how-did-that-physical-racing-go/>

### Why This Model

Lars placed 14th at re:Invent 2024 physical racing with a 9.335s best lap
on the Forever Raceway -- a narrow (76cm) track that eliminates all but
the most robust models. His approach specifically solves the problems that
plague physical DeepRacer racing:

- **Oscillation on straights** -- most models wobble left-right on straights.
  Lars fixes this with stabilizing steering angles (2.5 and 5.0 degrees) and
  Ackermann steering geometry.
- **Sim-to-real gap** -- training environment randomization (lights, walls,
  buildings change every 5 minutes during training) teaches the model to
  ignore visual noise.
- **Cornering precision** -- models trained only in one direction fail on
  diverse tracks. Lars trains CW and CCW on complex tracks.
- **Speed vs stability** -- inverted chevron action space gives higher speeds
  for straight actions, nudging the model to prefer going straight over
  oscillating.

### Key Design Choices

| Parameter | Value | Rationale |
| --- | --- | --- |
| Algorithm | PPO (Clipped) | Stable convergence |
| Action space | Discrete, 7-10 actions | Faster convergence than continuous |
| Max steering | 20 degrees | Matches Ackermann-patched real car |
| Stabilizing angles | 2.5, 5.0 degrees | Dampens straight-line oscillation |
| Speed range | 0.8 - 1.3 m/s | Avoids sim slipping; ~2x in real world |
| Reward function | Progress/velocity based | Higher velocity = higher reward |
| Training tracks | re:Invent 2022 Championship (complex) | Diverse turns, both directions |
| Final optimization | Forever Raceway, both CW and CCW | Target track tuning |
| Environment | Randomized every 5 min (walls, lights, buildings) | Sim-to-real robustness |
| Entropy floor | 0.5 (snapshot before going below) | Prevents forgetting recovery behavior |

### Reward Function Concept

```python
def reward_function(params):
    # Progress-based: reward velocity (progress per step)
    progress = params["progress"]
    steps = params["steps"]
    all_wheels_on_track = params["all_wheels_on_track"]

    if not all_wheels_on_track:
        return 1e-3

    # Velocity = progress / steps (higher is better)
    if steps > 0:
        velocity = progress / steps
    else:
        velocity = 0

    # Scale reward based on velocity
    reward = velocity * 100

    # Bonus for being close to center
    track_width = params["track_width"]
    distance_from_center = params["distance_from_center"]
    marker = track_width * 0.25
    if distance_from_center <= marker:
        reward *= 1.2

    return max(reward, 1e-3)
```

### How to Train This Model

1. Use deepracer-for-cloud (<https://github.com/aws-deepracer-community/deepracer-for-aws>)
2. Apply the Ackermann steering patch
3. Create a discrete action space with stabilizing angles
4. Train on complex tracks (re:Invent 2022 or custom) for 8-12 hours
5. Train both CW and CCW
6. Randomize environment during training
7. Take snapshots every 1-2 hours; keep entropy above 0.5
8. Final optimize on target track for 2-4 hours
9. Test on tracks the model has never seen

### Alternative: SDC-Lab NaviGator Model

The SDC-Lab team (<https://github.com/SDC-Lab/DeepRacer-Models>) provides three
tested physical racing models with downloadable artifacts:

- **StayOnTrack** -- discrete, stability focused, good baseline
- **CenterAlignModel** -- continuous, similar to our existing center-align
- **NaviGator** -- discrete, most advanced, combines multiple reward signals

The NaviGator model is the most sophisticated of the three and includes
reward functions, hyperparameters, training graphs, and physical test videos.
Good for quick testing since artifacts are directly downloadable.

---

## 2. Exploration / Return-to-Home: AWS DeepRacer Offroad

**Source:** Official AWS DeepRacer sample project
**Repo:** <https://github.com/aws-deepracer/aws-deepracer-offroad-sample-project>
**License:** Apache 2.0

### What It Does

The Offroad project turns the DeepRacer into a waypoint-navigating robot
that follows a custom path defined by QR codes -- no track needed.

- **QR codes as visual waypoints** -- print QR codes, place them on the floor
  or walls, and the car navigates between them in sequence
- **Custom path definition** -- arrange QR codes in any pattern to define
  the route (hallway, room exploration, outdoor path)
- **Encoded instructions** -- QR codes can contain speed, direction, or
  custom commands
- **Camera-based detection** -- uses the existing DeepRacer camera + pyzbar
  for QR recognition
- **Return-to-home** -- place a "home" QR code at the starting point; the
  car navigates back to it when the sequence is complete

### How It Works

```text
Camera frame -> QR Detection (pyzbar) -> Navigation Node -> Steering/Throttle
                                           |
                              Reads QR code content:
                              - Waypoint ID and sequence
                              - Speed instructions
                              - Turn direction hints
```

The navigation node computes steering based on where the QR code appears
in the camera frame:

- QR code on the left side of frame -> steer left
- QR code centered -> go straight
- QR code on the right -> steer right
- QR code large (close) -> slow down and look for next code
- No QR code visible -> slow scan/rotate to find next one

### What Makes This Great for Our Project

1. **No track needed** -- the car can explore any environment
2. **Easy to set up** -- just print QR codes and place them
3. **Visual waypoints** -- the car uses its camera, not GPS or LIDAR
4. **Extensible** -- we can add obstacle avoidance on top (see below)
5. **Runs on the DeepRacer hardware** -- ROS2 nodes, same Ubuntu device
6. **Return-to-home is built in** -- complete the QR sequence and return

### Adding Obstacle Avoidance

The base Offroad project navigates between waypoints but does not avoid
obstacles. To add obstacle avoidance, we can layer in one of these approaches:

#### Option A: Camera-based depth estimation (no extra hardware)

Use a monocular depth estimation model (MiDaS or similar) to detect
obstacles from the single camera:

```text
Camera frame -> Depth Model (ONNX) -> Obstacle map
                    +
Camera frame -> QR Detection -> Waypoint target
                    |
                    v
           Navigation Node:
           - Steer toward waypoint
           - Avoid obstacle zones
           - Emergency stop if obstacle is very close
```

#### Option B: LIDAR-based (requires DeepRacer Evo with LIDAR)

If the unit has a LIDAR sensor, use the existing DeepRacer object
avoidance packages:

```text
LIDAR scan -> Obstacle sectors (left/center/right)
                    +
Camera frame -> QR Detection -> Waypoint target
                    |
                    v
           Navigation Node:
           - Prefer obstacle-free sector
           - Steer toward waypoint within free sectors
```

#### Option C: Simple reactive avoidance (minimal, camera-only)

Use the bottom portion of the camera frame to detect floor obstacles
by color/edge change:

```text
Camera frame -> Bottom-strip edge detection -> Obstacle left/right/center
                    +
Camera frame -> QR Detection -> Waypoint target
                    |
                    v
           Navigation Node:
           - If obstacle on left, bias right
           - If obstacle on right, bias left
           - If obstacle ahead, stop and rotate
```

### Exploration Mode Concept

For true "world explore" behavior beyond fixed QR sequences, we could
implement a frontier-based exploration loop:

1. **Drive forward** at slow speed
2. **Avoid obstacles** using camera depth or LIDAR
3. **Drop virtual breadcrumbs** (odometry-based position tracking)
4. **Recognize landmarks** (specific QR codes or ArUco markers as reference points)
5. **Build a simple occupancy map** from LIDAR or depth data
6. **Return to home** by following the breadcrumb trail in reverse

This is significantly more complex than the QR waypoint approach but
would be a compelling demo. The QR Offroad project is the practical
starting point.

### Installation on the DeepRacer Unit

```bash
# SSH into the DeepRacer
sudo su
systemctl stop deepracer-core
source /opt/ros/foxy/setup.bash

# Clone and build
mkdir -p ~/deepracer_ws && cd ~/deepracer_ws
git clone https://github.com/aws-deepracer/aws-deepracer-offroad-sample-project.git
cd aws-deepracer-offroad-sample-project/deepracer_offroad_ws/
./install_dependencies.sh
rosdep install -i --from-path . --rosdistro foxy -y
colcon build

# Launch
source install/setup.bash
ros2 launch deepracer_offroad_launcher deepracer_offroad_launcher.py

# Enable offroad mode
ros2 service call /ctrl_pkg/vehicle_state \
  deepracer_interfaces_pkg/srv/ActiveStateSrv "{state: 3}"
ros2 service call /ctrl_pkg/enable_state \
  deepracer_interfaces_pkg/srv/EnableStateSrv "{is_active: True}"
```

### Creating the QR Code Waypoints

Use the provided script to generate QR codes:

```bash
# Each QR code encodes a waypoint ID (1, 2, 3, ...)
# Print them on paper and place on the floor or walls
# The car follows them in sequence
```

See the repo's `create-qrcodes-to-setup-offroad-path.md` for full details.

---

## Recommendation Summary

| Goal | Model | Complexity | Hardware Needed |
| --- | --- | --- | --- |
| Fastest track laps | Lars Ludvigsen approach (train with deepracer-for-cloud) | High (8-12h training) | Standard DeepRacer |
| Quick track test | SDC-Lab NaviGator (downloadable) | Low (download and deploy) | Standard DeepRacer |
| Explore with waypoints | AWS Offroad (QR navigation) | Medium (build ROS2 nodes) | Standard DeepRacer + printed QR codes |
| Explore + obstacle avoid | Offroad + depth model | High (custom integration) | Standard DeepRacer (camera-only) or Evo (LIDAR) |

### Suggested Next Steps

1. **Immediate:** Download the SDC-Lab NaviGator model and register it --
   gives us a strong physical track baseline to compare against our models
2. **This week:** Set up the Offroad QR waypoint project on the DeepRacer
   unit -- print 10 QR codes and do a hallway navigation demo
3. **Next sprint:** Train a Lars-style model using deepracer-for-cloud with
   the Ackermann patch and environment randomization
4. **Stretch goal:** Add monocular depth-based obstacle avoidance to the
   Offroad navigation
