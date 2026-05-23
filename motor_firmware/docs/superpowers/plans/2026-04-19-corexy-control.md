# CoreXY Motion Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a blocking high-level C++ API (`CoreXY`) that drives two stepper motors to produce straight-line coordinated motion in motor-step coordinates on a Seeed XIAO ESP32-S3.

**Architecture:** Add a `stepOnce()` primitive to the existing `StepperMotor` class (no cruise delay, just a short STEP strobe). Introduce a new `CoreXY` class that composes two `StepperMotor` references, applies CoreXY inverse kinematics (ΔA = ΔX + ΔY, ΔB = ΔX − ΔY), and interleaves motor pulses with Bresenham's line algorithm so the head moves in a straight line for any (X, Y) target. Soft bounds and software direction inversion are tracked in state. All motion is blocking.

**Tech Stack:** PlatformIO, Arduino framework, ESP32 (Seeed XIAO ESP32-S3), C++. No host-side test framework — validation is on the physical rig via Serial logging and visual observation.

**Notes for implementer:**
- This project is **not a git repo**. Skip all `git add` / `git commit` steps unless the user initializes one. Treat each task's end as "build + upload + verify," not "commit."
- Build: `pio run` (from project root). Upload: `pio run -t upload`. Monitor serial: `pio device monitor -b 115200`.
- The `lib/light.cpp` file is unrelated (VEML7700 light sensor demo). Don't touch it, and don't worry if it isn't picked up by the build — PlatformIO's lib dependency finder skips bare files directly under `lib/`.
- CoreXY kinematics, brief refresher: the two belts are routed so that **both** motors contribute to every axis. The inverse map is `ΔA = ΔX + ΔY`, `ΔB = ΔX − ΔY`. So +X moves both motors the same direction, +Y moves them opposite directions, and a diagonal is "only one motor moves." This is why we need to interleave steps in the *right ratio* — step motor A to completion and then motor B would produce an L-shape on the rig, not a straight line.

---

## File Structure

- `src/StepperMotor.h` — **modify**: add `stepOnce()` declaration.
- `src/StepperMotor.cpp` — **modify**: add `stepOnce()` definition.
- `src/CoreXY.h` — **create**: new class.
- `src/CoreXY.cpp` — **create**: implementation.
- `src/main.cpp` — **rewrite**: demo sketch that exercises the new API.

---

## Task 1: Add `stepOnce()` primitive to `StepperMotor`

Gives CoreXY a short-pulse step primitive without the built-in cruise delay that the existing `step()` method has. ~2 µs HIGH strobe is safely above the minimum pulse width for A4988 / DRV8825 / TMC2208 drivers.

**Files:**
- Modify: `src/StepperMotor.h` (add one declaration around line 16)
- Modify: `src/StepperMotor.cpp` (add one definition at the end of the file)

- [ ] **Step 1: Add `stepOnce()` declaration to `StepperMotor.h`**

Open `src/StepperMotor.h`. In the `public:` section, directly after the existing `void steps(int n);` line, add:

```cpp
    void stepOnce();                 // single short STEP strobe, no delay; updates step counter
```

Final `public:` block should look like:

```cpp
    void begin();
    void enable();
    void disable();

    void setDirection(bool clockwise);
    void setSpeed(int stepsPerSec);  // sets cruise speed

    void rampUp(int accelSteps = 200);
    void step();                     // single step at cruise speed, call in loop()
    void steps(int n);               // blocking: run n steps at cruise speed
    void stepOnce();                 // single short STEP strobe, no delay; updates step counter

    int  getStepCount() const { return _stepCount; }
    void resetStepCount()    { _stepCount = 0; }
```

- [ ] **Step 2: Add `stepOnce()` definition to `StepperMotor.cpp`**

Append to the end of `src/StepperMotor.cpp`:

```cpp
void StepperMotor::stepOnce() {
    digitalWrite(_stepPin, HIGH);
    delayMicroseconds(2);
    digitalWrite(_stepPin, LOW);
    _stepCount++;
}
```

- [ ] **Step 3: Build to verify it compiles**

Run: `pio run`
Expected: `SUCCESS`. No errors. (The existing `main.cpp` doesn't call `stepOnce()` yet, so linking should still work.)

---

## Task 2: Create `CoreXY` class (header + empty implementation)

Get the class and all public method stubs in place and compiling. No real logic yet. This isolates the "does the project still build with the new class" concern from the logic.

**Files:**
- Create: `src/CoreXY.h`
- Create: `src/CoreXY.cpp`

- [ ] **Step 1: Create `src/CoreXY.h`**

Full contents:

```cpp
#pragma once
#include <Arduino.h>
#include "StepperMotor.h"

class CoreXY {
public:
    CoreXY(StepperMotor& motorA, StepperMotor& motorB);

    void begin();                              // enables both motors
    void setSpeed(int stepsPerSec);            // default 1500; applies to the next move

    void setInvertX(bool inv);                 // flip X direction sense in software
    void setInvertY(bool inv);                 // flip Y direction sense in software

    void setHome();                            // current position becomes (0, 0)
    void setMaxBounds(long xMax, long yMax);   // soft limits; 0 on an axis disables that bound
    void clearBounds();                        // remove all soft limits

    void moveTo(long x, long y);               // absolute, coordinated straight line (blocking)
    void moveBy(long dx, long dy);             // relative (blocking)

    long getX() const { return _x; }
    long getY() const { return _y; }

    void disable();                            // disables both motor drivers

private:
    StepperMotor& _motorA;
    StepperMotor& _motorB;

    long _x = 0;
    long _y = 0;

    int  _stepsPerSec = 1500;

    bool _invertX = false;
    bool _invertY = false;

    long _xMax = 0;   // 0 = no limit on this axis
    long _yMax = 0;   // 0 = no limit on this axis
};
```

- [ ] **Step 2: Create `src/CoreXY.cpp` with empty stubs**

Full contents:

```cpp
#include "CoreXY.h"

CoreXY::CoreXY(StepperMotor& motorA, StepperMotor& motorB)
    : _motorA(motorA), _motorB(motorB) {}

void CoreXY::begin() {}
void CoreXY::setSpeed(int stepsPerSec) { (void)stepsPerSec; }
void CoreXY::setInvertX(bool inv) { (void)inv; }
void CoreXY::setInvertY(bool inv) { (void)inv; }
void CoreXY::setHome() {}
void CoreXY::setMaxBounds(long xMax, long yMax) { (void)xMax; (void)yMax; }
void CoreXY::clearBounds() {}
void CoreXY::moveTo(long x, long y) { (void)x; (void)y; }
void CoreXY::moveBy(long dx, long dy) { (void)dx; (void)dy; }
void CoreXY::disable() {}
```

- [ ] **Step 3: Build to verify it compiles**

Run: `pio run`
Expected: `SUCCESS`. (Main still references `StepperMotor` only, so `CoreXY.cpp` compiles but isn't linked in yet — that's fine.)

---

## Task 3: Implement state management and configuration methods

Everything except the two motion methods. These are pure state setters / accessors with no timing or kinematics, so they're easy to verify by inspection.

**Files:**
- Modify: `src/CoreXY.cpp`

- [ ] **Step 1: Replace each stub with its real implementation**

Open `src/CoreXY.cpp`. Replace the file's contents (keeping the constructor as it is) with:

```cpp
#include "CoreXY.h"

CoreXY::CoreXY(StepperMotor& motorA, StepperMotor& motorB)
    : _motorA(motorA), _motorB(motorB) {}

void CoreXY::begin() {
    _motorA.begin();
    _motorB.begin();
    _motorA.enable();
    _motorB.enable();
}

void CoreXY::setSpeed(int stepsPerSec) {
    if (stepsPerSec > 0) {
        _stepsPerSec = stepsPerSec;
    }
}

void CoreXY::setInvertX(bool inv) { _invertX = inv; }
void CoreXY::setInvertY(bool inv) { _invertY = inv; }

void CoreXY::setHome() {
    _x = 0;
    _y = 0;
}

void CoreXY::setMaxBounds(long xMax, long yMax) {
    _xMax = xMax < 0 ? 0 : xMax;
    _yMax = yMax < 0 ? 0 : yMax;
}

void CoreXY::clearBounds() {
    _xMax = 0;
    _yMax = 0;
}

void CoreXY::moveTo(long x, long y) { (void)x; (void)y; }
void CoreXY::moveBy(long dx, long dy) { (void)dx; (void)dy; }

void CoreXY::disable() {
    _motorA.disable();
    _motorB.disable();
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `pio run`
Expected: `SUCCESS`.

---

## Task 4: Implement `moveTo()` — kinematics, bounds refusal, Bresenham stepping

The core of the library. Does four things in order:

1. Check soft bounds; refuse with Serial warning if out.
2. Compute motor-space deltas from XY deltas (apply inversion).
3. Set direction pins once based on delta signs.
4. Bresenham-interleave step pulses; `delayMicroseconds` between iterations to hit the configured step rate.

**Files:**
- Modify: `src/CoreXY.cpp` (replace the empty `moveTo` stub)

- [ ] **Step 1: Replace `moveTo()` stub with the real implementation**

In `src/CoreXY.cpp`, replace:

```cpp
void CoreXY::moveTo(long x, long y) { (void)x; (void)y; }
```

with:

```cpp
void CoreXY::moveTo(long x, long y) {
    // Soft-bounds refusal, per-axis. An axis with max == 0 is unbounded.
    bool outOfBounds = false;
    if (_xMax > 0 && (x < 0 || x > _xMax)) outOfBounds = true;
    if (_yMax > 0 && (y < 0 || y > _yMax)) outOfBounds = true;
    if (outOfBounds) {
        Serial.printf("[CoreXY] refused: target (%ld, %ld) out of bounds\n", x, y);
        return;
    }

    // Deltas in user space, then apply inversion for the motor-space math
    long dx = x - _x;
    long dy = y - _y;
    long dxEff = _invertX ? -dx : dx;
    long dyEff = _invertY ? -dy : dy;

    // CoreXY inverse kinematics
    long dA = dxEff + dyEff;
    long dB = dxEff - dyEff;

    if (dA == 0 && dB == 0) {
        return;
    }

    // Directions set once for the whole move
    _motorA.setDirection(dA >= 0);
    _motorB.setDirection(dB >= 0);

    long aA = dA >= 0 ? dA : -dA;
    long aB = dB >= 0 ? dB : -dB;

    long periodUs = 1000000L / _stepsPerSec;

    // Bresenham line in motor-step space. The "fast" axis (more steps) pulses every
    // iteration; the "slow" axis pulses only when the error accumulator overflows.
    if (aA >= aB) {
        long err = aA / 2;
        for (long i = 0; i < aA; i++) {
            _motorA.stepOnce();
            err -= aB;
            if (err < 0) {
                err += aA;
                _motorB.stepOnce();
            }
            delayMicroseconds(periodUs);
        }
    } else {
        long err = aB / 2;
        for (long i = 0; i < aB; i++) {
            _motorB.stepOnce();
            err -= aA;
            if (err < 0) {
                err += aB;
                _motorA.stepOnce();
            }
            delayMicroseconds(periodUs);
        }
    }

    _x = x;
    _y = y;
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `pio run`
Expected: `SUCCESS`.

---

## Task 5: Implement `moveBy()`

Thin wrapper — compute the absolute target and delegate to `moveTo()`. Inherits bounds refusal for free.

**Files:**
- Modify: `src/CoreXY.cpp`

- [ ] **Step 1: Replace `moveBy()` stub with the real implementation**

In `src/CoreXY.cpp`, replace:

```cpp
void CoreXY::moveBy(long dx, long dy) { (void)dx; (void)dy; }
```

with:

```cpp
void CoreXY::moveBy(long dx, long dy) {
    moveTo(_x + dx, _y + dy);
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `pio run`
Expected: `SUCCESS`.

---

## Task 6: Rewrite `main.cpp` as a CoreXY demo sketch

Swap the current "ramp up and spin" sketch for one that exercises the new API. This is the first end-to-end test — uploading this will actually drive the rig.

**Files:**
- Modify: `src/main.cpp` (full rewrite)

- [ ] **Step 1: Replace `src/main.cpp` with the demo sketch**

Full new contents of `src/main.cpp`:

```cpp
#include <Arduino.h>
#include "StepperMotor.h"
#include "CoreXY.h"

StepperMotor motorA(D4, D5, D6);
StepperMotor motorB(D9, D8, D7);
CoreXY xy(motorA, motorB);

void setup() {
    Serial.begin(115200);
    delay(1000);                 // give the serial monitor time to attach
    Serial.println("[CoreXY] boot");

    xy.begin();
    xy.setSpeed(1500);
    xy.setHome();

    // Uncomment and fill in after manually calibrating the physical travel:
    // xy.setMaxBounds(5000, 3000);

    Serial.println("[CoreXY] running square demo");
    xy.moveTo(1000, 0);
    Serial.printf("  at (%ld, %ld)\n", xy.getX(), xy.getY());
    xy.moveTo(1000, 1000);
    Serial.printf("  at (%ld, %ld)\n", xy.getX(), xy.getY());
    xy.moveTo(0, 1000);
    Serial.printf("  at (%ld, %ld)\n", xy.getX(), xy.getY());
    xy.moveTo(0, 0);
    Serial.printf("  at (%ld, %ld)\n", xy.getX(), xy.getY());

    Serial.println("[CoreXY] demo complete");
    xy.disable();
}

void loop() {}
```

- [ ] **Step 2: Build to verify the full project compiles and links**

Run: `pio run`
Expected: `SUCCESS`. A successful link proves `CoreXY.cpp` is now pulled into the build via `main.cpp`'s include.

- [ ] **Step 3: Upload and open serial monitor**

Run (in two separate terminals or sequentially):

```bash
pio run -t upload
pio device monitor -b 115200
```

Expected serial output:

```
[CoreXY] boot
[CoreXY] running square demo
  at (1000, 0)
  at (1000, 1000)
  at (0, 1000)
  at (0, 0)
[CoreXY] demo complete
```

**Physical expectation:** head traces a square and returns to start. If the square is rotated 45°, sheared, or traces an L-shape — stop, note which pattern, and proceed to Task 7 to debug with simpler moves.

---

## Task 7: Physical validation walkthrough

The previous task already runs a full demo. This task walks through the individual motion primitives one at a time so that if Task 6 looks wrong, you can localize the problem. These are substitutions into `setup()` — do them by temporarily editing `main.cpp`, uploading, observing, then restoring the square demo.

**Files:**
- Temporarily modify `src/main.cpp` for each sub-step; restore to the Task 6 demo at the end.

- [ ] **Step 1: Pure-X move test**

Replace the four `moveTo` calls in `setup()` with just:

```cpp
    xy.moveTo(500, 0);
```

Upload, observe.

**Expected:** both motors step 500 times in the same direction; head moves along one physical axis (call it the "X axis" of the rig).

**Failure modes and fixes:**
- Head moves along the Y axis instead → the library's X and Y are swapped relative to your rig. Swap which pins you pass to `motorA` vs `motorB` in `main.cpp`, OR call `xy.setInvertX(true)` and `xy.setInvertY(true)` — experiment.
- Head moves backwards along X → `xy.setInvertX(true)`.
- Only one motor moves → wiring issue; test each motor in isolation with the existing `StepperMotor` API first.

- [ ] **Step 2: Pure-Y move test**

Replace with:

```cpp
    xy.moveTo(0, 500);
```

Upload, observe.

**Expected:** both motors step 500 times in **opposite** directions; head moves perpendicular to Step 1.

**Failure modes:**
- Head moves backwards along Y → `xy.setInvertY(true)`.
- Motors step in the same direction instead of opposite → one of the belts is routed incorrectly, OR one motor is mounted backwards. This is a mechanical issue, not something software can fix; swap one motor's wiring polarity at the driver.

- [ ] **Step 3: Diagonal move test**

Replace with:

```cpp
    xy.moveTo(500, 500);
```

Upload, observe.

**Expected:** motor A steps 1000 times, motor B steps 0 times. Head moves diagonally (45°).

- [ ] **Step 4: Square demo (restore Task 6 `main.cpp`)**

Restore `main.cpp` to the full square demo from Task 6. Upload.

**Expected:** head traces a square and returns to its starting point. Add a piece of tape or a marker to verify the loop closes to within a step or two.

- [ ] **Step 5: Bounds refusal test**

Temporarily add right after `xy.setHome();` in `setup()`:

```cpp
    xy.setMaxBounds(500, 500);
    xy.moveTo(1000, 0);   // should be refused
    Serial.printf("  after refused move, at (%ld, %ld)\n", xy.getX(), xy.getY());
```

(And comment out the square demo for this test.)

Upload, observe serial monitor.

**Expected serial output includes:**

```
[CoreXY] refused: target (1000, 0) out of bounds
  after refused move, at (0, 0)
```

**Physical expectation:** head does NOT move. Position stays at (0, 0).

- [ ] **Step 6: Restore the square demo**

Undo the changes from Step 5 so `main.cpp` matches the final Task 6 version. Upload once more to confirm everything still works.

---

## Done

At this point you should have:

- A working `StepperMotor::stepOnce()` primitive.
- A complete `CoreXY` class with manual homing, soft bounds, software direction inversion, and straight-line blocking motion.
- A demo `main.cpp` that draws a square and prints progress over serial.
- Validated each primitive motion (X-only, Y-only, diagonal, square, bounds refusal) on the rig.

If any direction flags (`setInvertX` / `setInvertY`) ended up true during validation, bake those calls into `setup()` so the rig comes up correctly every power-cycle.
