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

void CoreXY::moveBy(long dx, long dy) {
    moveTo(_x + dx, _y + dy);
}

void CoreXY::moveToCm(float xCm, float yCm) {
    moveTo((long)(xCm * STEPS_PER_CM), (long)(yCm * STEPS_PER_CM));
}

void CoreXY::moveByCm(float dxCm, float dyCm) {
    moveToCm((_x / STEPS_PER_CM) + dxCm, (_y / STEPS_PER_CM) + dyCm);
}

void CoreXY::disable() {
    _motorA.disable();
    _motorB.disable();
}
