"""
Seed realistic synthetic evaluation data for the model registry dashboard.

Generates plausible eval runs for each registered model based on their
known characteristics. Run once to populate the dashboard for demos and
to establish baselines before real physical testing begins.

Usage:
    python -m model_registry.seed_eval_data
    python -m model_registry.seed_eval_data --clear   # wipe and re-seed
"""
from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from model_registry.eval_logger import EVAL_LOG_FILE, log_eval

# ---------------------------------------------------------------------------
# Model profiles -- tuned to realistic characteristics
# ---------------------------------------------------------------------------

MODEL_PROFILES = {
    "drfc-ppo": {
        "display_name": "DeepRacer-for-Cloud Clipped PPO",
        "notes_prefix": "Synthetic baseline run",
        "tracks": ["lab-oval", "lab-figure8", "sim-reinvent2018"],
        "operators": ["jesse", "auto-sim"],
        # Discrete 5-action model: stable but slow, moderate off-track
        "lap_range": (1, 5),
        "speed_range": (1.0, 1.8),
        "off_track_range": (0, 4),
        "crash_range": (0, 2),
        "completion_weights": {"full": 0.55, "partial": 0.30, "dnf": 0.15},
    },
    "center-align": {
        "display_name": "CenterAlign Continuous PPO",
        "notes_prefix": "Synthetic baseline run",
        "tracks": ["lab-oval", "lab-figure8", "sim-reinvent2018"],
        "operators": ["jesse", "auto-sim"],
        # Continuous model: faster, smoother, fewer crashes but more off-track at limits
        "lap_range": (2, 8),
        "speed_range": (1.4, 2.6),
        "off_track_range": (1, 6),
        "crash_range": (0, 1),
        "completion_weights": {"full": 0.65, "partial": 0.25, "dnf": 0.10},
    },
}

RUNS_PER_MODEL = 12


def weighted_choice(weights: dict[str, float]) -> str:
    """Pick a key from a {key: weight} dict."""
    keys = list(weights.keys())
    vals = [weights[k] for k in keys]
    return random.choices(keys, weights=vals, k=1)[0]


def generate_runs(model_id: str, profile: dict, count: int) -> list[dict]:
    """Generate count synthetic eval entries for a model."""
    entries = []
    for i in range(count):
        track = random.choice(profile["tracks"])
        operator = random.choice(profile["operators"])
        completion = weighted_choice(profile["completion_weights"])

        laps = random.randint(*profile["lap_range"])
        # DNF runs tend to have fewer laps
        if completion == "dnf":
            laps = max(0, laps // 2)
        elif completion == "partial":
            laps = max(1, laps - 1)

        off_track = random.randint(*profile["off_track_range"])
        crashes = random.randint(*profile["crash_range"])
        speed = round(random.uniform(*profile["speed_range"]), 2)

        # Slower on figure8 (tighter turns)
        if "figure8" in track:
            speed = round(speed * 0.85, 2)
            off_track = min(off_track + 1, 10)

        note_parts = [profile["notes_prefix"]]
        if completion == "dnf":
            note_parts.append("-- went off track and could not recover")
        elif off_track > 3:
            note_parts.append("-- unstable at turns")
        elif speed > 2.0:
            note_parts.append("-- good speed, held line well")

        entry = log_eval(
            model_id=model_id,
            track=track,
            lap_count=laps,
            completion_status=completion,
            off_track_count=off_track,
            crash_count=crashes,
            avg_speed=speed,
            operator=operator,
            notes=" ".join(note_parts),
        )
        entries.append(entry)

    return entries


def main():
    parser = argparse.ArgumentParser(description="Seed synthetic eval data")
    parser.add_argument("--clear", action="store_true", help="Clear existing eval log before seeding")
    parser.add_argument("--count", type=int, default=RUNS_PER_MODEL, help="Runs per model")
    args = parser.parse_args()

    if args.clear and EVAL_LOG_FILE.exists():
        EVAL_LOG_FILE.unlink()
        print(f"Cleared {EVAL_LOG_FILE}")

    total = 0
    for model_id, profile in MODEL_PROFILES.items():
        entries = generate_runs(model_id, profile, args.count)
        total += len(entries)
        print(f"  {model_id}: {len(entries)} runs seeded")

    print(f"\nTotal: {total} evaluation runs written to {EVAL_LOG_FILE}")
    print("Refresh the dashboard to see comparison charts.")


if __name__ == "__main__":
    main()
