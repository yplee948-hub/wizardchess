#pragma once
#include <Arduino.h>

class StepperMotor {
public:
    StepperMotor(int enPin, int stepPin, int dirPin);

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

private:
    int _enPin, _stepPin, _dirPin;
    bool _enabled;
    long _delayStartUs;
    long _delayUs;       // cruise delay (us per half-pulse)
    int  _stepCount;

    void _pulse(long halfPeriodUs);
};
