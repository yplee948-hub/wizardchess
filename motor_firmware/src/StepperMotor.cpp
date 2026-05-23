#include "StepperMotor.h"

StepperMotor::StepperMotor(int enPin, int stepPin, int dirPin)
    : _enPin(enPin), _stepPin(stepPin), _dirPin(dirPin),
      _enabled(false), _delayStartUs(4000), _delayUs(500), _stepCount(0) {}

void StepperMotor::begin() {
    pinMode(_enPin,   OUTPUT);
    pinMode(_stepPin, OUTPUT);
    pinMode(_dirPin,  OUTPUT);
    disable();
}

void StepperMotor::enable() {
    digitalWrite(_enPin, LOW);
    _enabled = true;
}

void StepperMotor::disable() {
    digitalWrite(_enPin, HIGH);
    _enabled = false;
}

void StepperMotor::setDirection(bool clockwise) {
    digitalWrite(_dirPin, clockwise ? HIGH : LOW);
}

// stepsPerSec -> converts to half-period delay in microseconds
void StepperMotor::setSpeed(int stepsPerSec) {
    _delayUs = 1000000L / (stepsPerSec * 2);
}

void StepperMotor::rampUp(int accelSteps) {
    for (int i = 0; i < accelSteps; i++) {
        long d = map(i, 0, accelSteps, _delayStartUs, _delayUs);
        _pulse(d);
    }
}

void StepperMotor::step() {
    _pulse(_delayUs);
    _stepCount++;
}

void StepperMotor::steps(int n) {
    for (int i = 0; i < n; i++) {
        step();
    }
}

void StepperMotor::_pulse(long halfPeriodUs) {
    digitalWrite(_stepPin, HIGH);
    delayMicroseconds(halfPeriodUs);
    digitalWrite(_stepPin, LOW);
    delayMicroseconds(halfPeriodUs);
}

void StepperMotor::stepOnce() {
    digitalWrite(_stepPin, HIGH);
    delayMicroseconds(2);
    digitalWrite(_stepPin, LOW);
    _stepCount++;
}
