# CoreXY Motion Control — Design

**Date:** 2026-04-19
**Target board:** Seeed XIAO ESP32-S3 (PlatformIO / Arduino)
**Scope:** High-level C++ API to drive a CoreXY rig using two existing `StepperMotor` instances.

## Goals

- Command motion by absolute XY coordinates in raw motor steps (no millimeter calibration).
- Produce straight-line motion at arbitrary angles (not L-shape).
- Support manual homing and soft limits (no physical endstops).
- Keep the API small, blocking, and easy to use from `main.cpp`.

## Non-goals

- No G-code parser, no serial command interface.
- No mm / physical-unit conversion.
- No per-move acceleration profile (fixed cruise speed only).
- No non-blocking / background motion.
- No physical limit switches.

## Architecture

Two components, cleanly separated:

1. **`StepperMotor`** (existing) — one new method added. Everything else unchanged.
   - New: `void stepOnce()` — strobes STEP HIGH for ~2 µs then LOW, increments the step counter. No cruise delay.
   - Existing `step()`, `steps()`, `rampUp()`, `setSpeed()`, `setDirection()`, `enable()`, `disable()`, `begin()` stay intact and usable for single-motor testing.

2. **`CoreXY`** (new) — composes two `StepperMotor` references, applies CoreXY kinematics, runs coordinated blocking moves, tracks position, enforces soft limits.

### Files

- `src/StepperMotor.h` / `src/StepperMotor.cpp` — add `stepOnce()`.
- `src/CoreXY.h` / `src/CoreXY.cpp` — new.
- `src/main.cpp` — rewrite to use `CoreXY`; keeps the existing `motorA(D4,D5,D6)` and `motorB(D9,D8,D7)` instances.

## Public API

```cpp
class CoreXY {
public:
    CoreXY(StepperMotor& motorA, StepperMotor& motorB);

    void begin();                              // enables both motors
    void setSpeed(int stepsPerSec);            // default 1500; applies to the next move

    void setInvertX(bool inv);                 // flip X direction sense in software
    void setInvertY(bool inv);                 // flip Y direction sense in software

    // Homing & bounds (no physical endstops)
    void setHome();                            // current position becomes (0, 0)
    void setMaxBounds(long xMax, long yMax);   // soft limits; 0 on an axis disables that bound
    void clearBounds();                        // remove all soft limits

    // Motion (blocking)
    void moveTo(long x, long y);               // absolute, coordinated straight line
    void moveBy(long dx, long dy);             // relative

    // State
    long getX() const;
    long getY() const;

    void disable();                            // disables both motor drivers
};
```

## Behavior

### Homing

- There are no physical switches. The user jogs (or places) the head at a chosen corner and calls `setHome()`, which zeroes the internal position.
- `setMaxBounds(xMax, yMax)` is called once (hardcoded after one-time manual calibration of the physical travel).

### Bounds enforcement

- `moveTo(x, y)` and `moveBy(dx, dy)` check the target against `[0..xMax, 0..yMax]` **before** moving.
- If the target is out of bounds, the call **refuses**: no steps issued, position unchanged, a short warning printed to `Serial` (e.g. `"[CoreXY] refused: target (1200, 0) out of bounds"`).
- `setMaxBounds(0, 0)` or never calling `setMaxBounds` means no limits — any target is accepted, including negative coordinates. User accepts responsibility for not crashing the head into the frame.

### Direction inversion

- `setInvertX(bool)` and `setInvertY(bool)` flip the sign of `ΔX` / `ΔY` in the kinematics calculation only. Internal position remains in user coordinates (so `moveTo(100, 0)` always means "go to X=100 in user space").
- Used to correct belt / wiring direction in software without changing hardware.

### Motor mapping

- `motorA` = first ctor argument; `motorB` = second.
- In the starter `main.cpp`: `motorA = StepperMotor(D4, D5, D6)`, `motorB = StepperMotor(D9, D8, D7)`.

## Kinematics & Stepping Algorithm

### Inverse kinematics

After applying inversion flags:

```
ΔA = ΔX + ΔY
ΔB = ΔX − ΔY
```

Direction pins are set once per move from the signs of `ΔA` and `ΔB`.

### Straight-line stepping (Bresenham)

CoreXY kinematics is linear, so a straight line in motor-step space `(A, B)` maps to a straight line in `(X, Y)`. Standard Bresenham:

- `aA = |ΔA|`, `aB = |ΔB|`.
- The axis with the larger step count is the "fast" axis; it pulses every iteration.
- The "slow" axis pulses only when an error accumulator overflows.
- Total iterations = `max(aA, aB)`.

### Timing

- `stepOnce()` on each motor does a ~2 µs STEP pulse (well above the minimum for A4988 / DRV8825 / TMC2208 drivers) and returns immediately.
- Between iterations, `CoreXY::moveTo()` calls `delayMicroseconds(period)` where `period = 1,000,000 / stepsPerSec`. At 1500 steps/sec → ~666 µs per iteration.
- Direction pins are set **once** at the start of the move.

### Edge cases

- `ΔA == 0 && ΔB == 0` → return immediately.
- Small moves (1–2 steps) → still go through the Bresenham loop; correct by construction.
- Position updates **only** after the loop completes successfully.

## `main.cpp` shape

```cpp
#include <Arduino.h>
#include "StepperMotor.h"
#include "CoreXY.h"

StepperMotor motorA(D4, D5, D6);
StepperMotor motorB(D9, D8, D7);
CoreXY xy(motorA, motorB);

void setup() {
    Serial.begin(115200);
    xy.begin();
    xy.setSpeed(1500);
    xy.setHome();
    // xy.setMaxBounds(5000, 3000);  // fill in after manual calibration

    xy.moveTo(1000, 0);
    xy.moveTo(1000, 1000);
    xy.moveTo(0, 1000);
    xy.moveTo(0, 0);
}

void loop() {}
```

## Testing plan

No host-side unit tests; validation is on the physical rig:

1. **Single-motor sanity** — confirm both motors spin correctly using the existing `StepperMotor` API in isolation.
2. **Pure-X move** — `moveTo(500, 0)`. Both motors step 500 in the same direction. Head moves along X. If it moves in Y, use `setInvertX` / `setInvertY` or re-pick which motor is A / B.
3. **Pure-Y move** — `moveTo(0, 500)`. Both motors step 500 in opposite directions. Head moves along Y.
4. **Diagonal** — `moveTo(500, 500)`. Motor A steps 1000, motor B steps 0. Head moves diagonally.
5. **Square** — run the demo in `main.cpp`; verify the head returns to the starting point (loop closes).
6. **Bounds** — `setMaxBounds(500, 500)` then `moveTo(1000, 0)` → serial prints a refusal; position unchanged.

## Open items / future work

- Non-blocking motion (`tick()`-driven) if later work needs to run sensors concurrently with motion.
- Trapezoidal acceleration per move if higher step rates cause skipped steps.
- Physical endstops + `home()` that actually drives into them, if the rig gains switches.
