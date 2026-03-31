# Visual Explorer -- Camera-Only Autonomous Navigation

## Overview

A custom exploration model that drives the DeepRacer through unknown
environments without a track, QR codes, or LIDAR. Uses only cameras
to detect obstacles, build a visual memory of the world, create its own
waypoints from visual features, and retrace its path back to the starting
point.

## Status: In Development (Phase 1 scaffolded)

## Hardware Requirements

- DeepRacer unit with built-in front camera
- Extra USB camera (mounted rear-facing or side-by-side for stereo)
- No LIDAR needed
- No GPS needed
- No QR codes or markers needed

## How It Works

### Obstacle Avoidance

Uses MiDaS Small ONNX model (~17MB) to estimate relative depth from a
single RGB camera frame. The depth map is divided into left/center/right
sectors, each classified as clear/caution/blocked.

### Breadcrumb Trail (Return-to-Home)

During exploration, the car drops position breadcrumbs at regular intervals.
To return home, it follows the breadcrumbs in reverse order while still
avoiding obstacles.

### Visual Landmark Memory (Phase 2)

Stores ORB feature descriptors at waypoints it creates. When the car sees
a matching feature pattern, it recognizes it has visited that place before.
Exploration is biased toward unvisited areas.

### Visual Odometry (Phase 3)

Tracks the car's movement by matching visual features between consecutive
frames. Provides position and heading estimates without any external sensors.

## Architecture

```text
Front Camera -> Obstacle Detector (MiDaS) -> Navigation Planner -> Servos
     |                                              ^
     +-> Landmark DB (ORB features)                |
     +-> Visual Odometry (frame matching)          |
     +-> Breadcrumb Trail (position history) ------+
```

## Modes

- **EXPLORING** -- drive forward, avoid obstacles, drop breadcrumbs, save landmarks
- **RETURNING** -- follow breadcrumbs backward to home, still avoid obstacles
- **SAFETY** -- emergency stop if obstacles are very close in all directions
- **HOME** -- arrived back at starting position, full stop

## File Structure

```text
services/vehicle-runtime/vehicle_runtime/explorer/
  __init__.py
  config.py               -- all tunable parameters
  obstacle_detector.py    -- MiDaS depth + sector classification
  breadcrumb_trail.py     -- position recording and return-to-home
  landmark_db.py          -- ORB feature storage and place recognition
  navigation_planner.py   -- explore / return / safety logic
  explorer_runtime.py     -- main loop + standalone entry point
```

## Running Standalone

```bash
cd services/vehicle-runtime
python -m vehicle_runtime.explorer.explorer_runtime
```

Press Ctrl+C to trigger return-to-home.

## Dependencies

- OpenCV 4.x (ORB features, image processing)
- onnxruntime (MiDaS depth inference)
- NumPy
- No GPU required

## MiDaS Model Download

```bash
wget https://github.com/isl-org/MiDaS/releases/download/v3_1/midas_v21_small_256.onnx \
  -O services/vehicle-runtime/models/midas_small.onnx
```

## Design Document

Full architecture, phased implementation plan, and USB camera mounting
options: see `docs/visual-explorer-design.md`
