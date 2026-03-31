# Optimal Training Track Design

## Why a Purpose-Built Training Track Matters

Behavioral cloning models learn exactly what they see in training data. If
the training data only contains gentle curves, the model will not know how to
handle a hairpin. If data only contains left turns, the model will struggle
with right turns.

The ideal training track packs the maximum diversity of steering situations
into a single lap, so every minute of human driving generates the richest
possible training signal.

## Design Principles

1. **Both turn directions in every lap** -- eliminates left/right bias
2. **Varying turn radii** -- tight hairpins, medium curves, gentle sweepers
3. **Chicanes** -- rapid left-right-left sequences that teach quick corrections
4. **Straights before curves** -- teaches the transition from zero to non-zero steering
5. **Width changes** -- narrow sections force precision, wide sections test centering
6. **A long straight** -- ensures the model learns to hold zero steering confidently
7. **Tightening turns** -- radius decreases mid-turn, teaching proportional response
8. **Recovery-friendly layout** -- wide enough that off-center driving is common,
   generating natural recovery data

## Track Layout: "Training Gauntlet"

The track is a closed loop with these segments (counterclockwise):

```text
         Chicane
        /  |  \
       /   |   \
  Hairpin  |  Gentle sweeper
  (tight)  |  (wide radius)
       \   |   /
        \  |  /
    Long straight
        |     |
    Tightening   S-curve
    turn         (medium)
        |     |
     Narrow   Wide
     section  section
        \     /
         Start
```

### Segment Breakdown

| Segment | Purpose | Turn Radius | Width |
| --- | --- | --- | --- |
| Long straight | Zero-steering hold, speed buildup | Infinite | Normal |
| Gentle sweeper (right) | Mild constant steering | Large (25-30 units) | Wide (6) |
| Chicane (left-right-left) | Rapid corrections | Medium (8-12 units) | Normal (5) |
| Medium S-curve | Smooth transitions | Medium (15-18 units) | Normal (5) |
| Narrow section | Precision driving | Straight | Narrow (3.5) |
| Tightening turn (left) | Proportional steering increase | 20 down to 8 | Normal (5) |
| Hairpin (right) | Maximum steering input | Tight (6 units) | Normal (5) |
| Wide recovery zone | Centering practice | Gentle | Wide (7) |

### Key Properties

- **Lap distance:** Moderate (similar to stadium track) -- not so long that
  laps take forever, not so short that segments are cramped
- **Both CW and CCW turns:** The layout includes roughly equal left and right
  turns so the model sees balanced steering distribution
- **Steering histogram goal:** Roughly uniform distribution across
  [-1, -0.5, 0, 0.5, 1] rather than peaked at 0 (which is the problem with
  simple ovals)

## Data Collection Tips

- **Drive 15-20 laps minimum** per training session
- **Vary your speed** -- don't always go the same pace
- **Intentionally recover** -- occasionally drift to the edge and steer back.
  This is the most valuable training data for a BC model.
- **Drive both directions** -- if the track supports it, do half your laps
  clockwise and half counterclockwise
- **Multiple operators** -- different people drive differently, and that
  diversity helps generalization
- **Clean laps first, messy laps second** -- start with smooth driving to
  establish the baseline, then add intentional recovery scenarios

## Comparison: Training Gauntlet vs Existing Tracks

| Property | Oval | S-Curves | City | Training Gauntlet |
| --- | --- | --- | --- | --- |
| Turn directions | 1 | 2 | 2 | 2 (balanced) |
| Radius variety | None | 1 type | 2 types | 5 types |
| Chicanes | No | Sort of | No | Yes |
| Hairpins | No | No | Some | Yes |
| Width changes | No | No | No | Yes |
| Straights | No | No | Some | Yes (long) |
| Recovery data | Rare | Rare | Some | Designed in |
| Steering distribution | Peaked at one value | Better | Good | Near-uniform |

## Implementation

The track is defined in `simulator/src/lib/tracks/track-data.ts` as the
`training-gauntlet` track. It uses the existing `curveTrack` and
`straightawayTrack` helpers to compose segments.
