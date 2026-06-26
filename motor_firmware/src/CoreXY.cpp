#include "CoreXY.h"
#include "NullSerial.h"  // disables Serial — magnet shares UART0 pins (GPIO1/3)

CoreXY::CoreXY(StepperMotor& motorA, StepperMotor& motorB)
    : _motorA(motorA), _motorB(motorB) {}

void CoreXY::setLimitSwitches(const LimitPins& pins, bool activeHigh) {
    _limits         = pins;
    _limitActiveHigh = activeHigh;
    _limitsEnabled  = true;
    // Init pins immediately so this can be called before or after begin().
    auto initPin = [](int pin) { if (pin >= 0) pinMode(pin, INPUT_PULLUP); };
    initPin(pins.xMinus);
    initPin(pins.xPlus);
    initPin(pins.yMinus1);
    initPin(pins.yMinus2);
    initPin(pins.yPlus1);
    initPin(pins.yPlus2);
}

bool CoreXY::_pinTriggered(int pin) const {
    if (pin < 0) return false;
    bool val = (digitalRead(pin) == HIGH);
    return _limitActiveHigh ? val : !val;
}

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

    long cruiseUs = 1000000L / _stepsPerSec;
    long startUs  = 1000000L / kAccelStartStepsPerSec;
    if (startUs < cruiseUs) startUs = cruiseUs;  // never start faster than cruise

    long total  = (aA >= aB) ? aA : aB;
    long accelN = kAccelSteps;
    if (accelN > total / 2) accelN = total / 2;   // short moves: split ramp evenly

    auto periodAt = [&](long i) -> long {
        if (accelN <= 0) return cruiseUs;
        if (i < accelN) {
            return startUs - (startUs - cruiseUs) * i / accelN;
        }
        long tail = total - 1 - i;
        if (tail < accelN) {
            return startUs - (startUs - cruiseUs) * tail / accelN;
        }
        return cruiseUs;
    };

    // Stop if a limit switch in the direction of travel triggers.
    // Directional so back-off moves after homing are not blocked.
    auto limitHitNow = [&]() -> bool {
        if (!_limitsEnabled) return false;
        if (dx < 0 && _pinTriggered(_limits.xMinus)) return true;
        if (dx > 0 && _pinTriggered(_limits.xPlus))  return true;
        if (dy < 0 && (_pinTriggered(_limits.yMinus1) || _pinTriggered(_limits.yMinus2))) return true;
        if (dy > 0 && (_pinTriggered(_limits.yPlus1)  || _pinTriggered(_limits.yPlus2)))  return true;
        return false;
    };

    long origX = _x, origY = _y;
    bool limitHit = false;

    // Bresenham line in motor-step space. The "fast" axis (more steps) pulses every
    // iteration; the "slow" axis pulses only when the error accumulator overflows.
    if (aA >= aB) {
        long err = aA / 2;
        for (long i = 0; i < aA; i++) {
            if (limitHitNow()) {
                Serial.printf("[CoreXY] limit hit at step %ld / %ld\n", i, aA);
                _x = origX + (aA > 0 ? (x - origX) * i / aA : 0);
                _y = origY + (aA > 0 ? (y - origY) * i / aA : 0);
                limitHit = true;
                break;
            }
            _motorA.stepOnce();
            err -= aB;
            if (err < 0) {
                err += aA;
                _motorB.stepOnce();
            }
            delayMicroseconds(periodAt(i));
        }
    } else {
        long err = aB / 2;
        for (long i = 0; i < aB; i++) {
            if (limitHitNow()) {
                Serial.printf("[CoreXY] limit hit at step %ld / %ld\n", i, aB);
                _x = origX + (aB > 0 ? (x - origX) * i / aB : 0);
                _y = origY + (aB > 0 ? (y - origY) * i / aB : 0);
                limitHit = true;
                break;
            }
            _motorB.stepOnce();
            err -= aA;
            if (err < 0) {
                err += aB;
                _motorA.stepOnce();
            }
            delayMicroseconds(periodAt(i));
        }
    }

    if (!limitHit) {
        _x = x;
        _y = y;
    }
}

void CoreXY::moveBy(long dx, long dy) {
    moveTo(_x + dx, _y + dy);
}

void CoreXY::moveToCm(float xCm, float yCm) {
    moveTo((long)(xCm * _stepsPerCm), (long)(yCm * _stepsPerCm));
}

void CoreXY::moveByCm(float dxCm, float dyCm) {
    moveToCm((_x / _stepsPerCm) + dxCm, (_y / _stepsPerCm) + dyCm);
}

void CoreXY::setPosition(long x, long y) {
    _x = x;
    _y = y;
}

void CoreXY::setStepsPerCm(float spc) {
    if (spc > 0) _stepsPerCm = spc;
}

long CoreXY::homeToLimit(bool xAxis, bool positive, int speed) {
    if (!_limitsEnabled) return 0;

    int pin1 = -1, pin2 = -1;
    if (xAxis) {
        pin1 = positive ? _limits.xPlus  : _limits.xMinus;
    } else {
        pin1 = positive ? _limits.yPlus1  : _limits.yMinus1;
        pin2 = positive ? _limits.yPlus2  : _limits.yMinus2;
    }

    // CoreXY motor directions for each axis (with inversion applied)
    int effDir = positive ? 1 : -1;
    if ( xAxis && _invertX) effDir = -effDir;
    if (!xAxis && _invertY) effDir = -effDir;

    // X: both motors same dir; Y: motors opposite
    _motorA.setDirection(effDir > 0);
    _motorB.setDirection(xAxis ? (effDir > 0) : (effDir < 0));

    long us = 1000000L / speed;
    long stepCount = 0;
    static constexpr long kMaxSteps = 250000L;

    while (stepCount < kMaxSteps) {
        if (_pinTriggered(pin1) || _pinTriggered(pin2)) break;
        _motorA.stepOnce();
        _motorB.stepOnce();
        stepCount++;
        delayMicroseconds(us);
    }

    long displacement = positive ? stepCount : -stepCount;
    if (xAxis) _x += displacement;
    else       _y += displacement;

    return stepCount;
}

void CoreXY::disable() {
    _motorA.disable();
    _motorB.disable();
}

bool CoreXY::limitHit() const {
    if (!_limitsEnabled) return false;
    if (_pinTriggered(_limits.xMinus)) return true;
    if (_pinTriggered(_limits.xPlus))  return true;
    if (_pinTriggered(_limits.yMinus1) || _pinTriggered(_limits.yMinus2)) return true;
    if (_pinTriggered(_limits.yPlus1)  || _pinTriggered(_limits.yPlus2))  return true;
    return false;
}
