#pragma once
#include <Arduino.h>
#include "ChessTypes.h"

// H-bridge driver: IN1/IN2 select polarity, ENA gates the coil.
// BLACK pieces are attracted on polarity A (IN1 high), WHITE on polarity B (IN2 high).
class Electromagnet {
public:
    Electromagnet(int in1, int in2, int ena) : _in1(in1), _in2(in2), _ena(ena) {}

    void begin() {
        pinMode(_in1, OUTPUT);
        pinMode(_in2, OUTPUT);
        pinMode(_ena, OUTPUT);
        off();
    }

    void on(PieceColor color) {
        if (color == WHITE) {
            digitalWrite(_in1, HIGH);
            digitalWrite(_in2, LOW);
        } else {
            digitalWrite(_in1, LOW);
            digitalWrite(_in2, HIGH);
        }
        digitalWrite(_ena, HIGH);
        _state = true;
    }

    void off() {
        digitalWrite(_ena, LOW);
        digitalWrite(_in1, LOW);
        digitalWrite(_in2, LOW);
        _state = false;
    }

    bool isOn() const { return _state; }

private:
    int  _in1;
    int  _in2;
    int  _ena;
    bool _state = false;
};
