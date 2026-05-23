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

    void moveToCm(float xCm, float yCm);      // absolute move in centimeters
    void moveByCm(float dxCm, float dyCm);    // relative move in centimeters

    static constexpr float STEPS_PER_CM = 400.0f;

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
