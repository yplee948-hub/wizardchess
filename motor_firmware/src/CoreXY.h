#pragma once
#include <Arduino.h>
#include "StepperMotor.h"

class CoreXY {
public:
    CoreXY(StepperMotor& motorA, StepperMotor& motorB);

    // Limit switch pin configuration.
    // Pins 34/35/36/39 are input-only (no internal pull resistors) — wire with
    // external pull-downs when using active-HIGH switches (the default).
    struct LimitPins {
        int xMinus  = -1;  // stop when moving in -X
        int xPlus   = -1;  // stop when moving in +X
        int yMinus1 = -1;  // stop when moving in -Y
        int yMinus2 = -1;  // stop when moving in -Y (second switch)
        int yPlus1  = -1;  // stop when moving in +Y
        int yPlus2  = -1;  // stop when moving in +Y (second switch)
    };
    // activeHigh=true → switch closes to VCC; false → closes to GND (needs pull-up on 34–39).
    void setLimitSwitches(const LimitPins& pins, bool activeHigh = true);

    void begin();                              // enables both motors
    void setSpeed(int stepsPerSec);            // default 1500; applies to the next move

    void setInvertX(bool inv);                 // flip X direction sense in software
    void setInvertY(bool inv);                 // flip Y direction sense in software

    void setHome();                            // current position becomes (0, 0)
    void setMaxBounds(long xMax, long yMax);   // soft limits; 0 on an axis disables that bound
    void clearBounds();                        // remove all soft limits

    void moveTo(long x, long y);               // absolute, coordinated straight line (blocking)
    void moveBy(long dx, long dy);             // relative (blocking)

    void moveToCm(float xCm, float yCm);      // absolute move in centimeters
    void moveByCm(float dxCm, float dyCm);    // relative move in centimeters

    long getX() const { return _x; }
    long getY() const { return _y; }

    void disable();                            // disables both motor drivers

    bool limitHit() const;                     // true if any limit switch is currently triggered

    // Drive slowly toward a limit switch until it triggers. Returns steps taken.
    // Used for homing and calibration. Does not respect soft bounds.
    long homeToLimit(bool xAxis, bool positive, int speed = 600);

    void setPosition(long x, long y);          // force-set tracked position without moving
    void setStepsPerCm(float spc);
    float getStepsPerCm() const { return _stepsPerCm; }

private:
    StepperMotor& _motorA;
    StepperMotor& _motorB;

    long _x = 0;
    long _y = 0;

    int  _stepsPerSec = 1500;
    float _stepsPerCm = 400.0f;

    bool _invertX = false;
    bool _invertY = false;

    long _xMax = 0;   // 0 = no limit on this axis
    long _yMax = 0;   // 0 = no limit on this axis

    LimitPins _limits         = {};
    bool      _limitsEnabled  = false;
    bool      _limitActiveHigh = true;

    bool _pinTriggered(int pin) const;

    static constexpr long kAccelSteps              = 250;
    static constexpr long kAccelStartStepsPerSec   = 800;
};
