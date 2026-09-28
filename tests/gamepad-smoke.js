'use strict';

const assert = require('node:assert/strict');

const listeners = {};
global.window = {
  addEventListener(type, handler) {
    listeners[type] = handler;
  }
};

global.performance = global.performance || require('node:perf_hooks').performance;

function button(value = 0, pressed = false) {
  return { value, pressed };
}

const buttons = Array.from({ length: 17 }, () => button());

const pad = {
  index: 0,
  id: 'Standard Test Controller',
  connected: true,
  mapping: 'standard',
  axes: [0.55, 0, 0.30, -0.25],
  buttons,
  vibrationActuator: null
};

Object.defineProperty(global, 'navigator', {
  configurable: true,
  value: {
    getGamepads() {
      return [pad];
    }
  }
});

require('../src/input/gamepad.js');

const gamepad = window.GravelRushGamepad;
assert.ok(gamepad, 'gamepad module should initialize');

pad.buttons[7] = button(0.82, true);
pad.buttons[6] = button(0.28, true);
pad.buttons[0] = button(1, true);
pad.buttons[3] = button(1, true);
pad.buttons[1] = button(1, true);

const first = gamepad.read();

assert.equal(first.connected, true);
assert.ok(first.steer > 0.3 && first.steer < 0.7, 'left stick should produce analog steering');
assert.ok(first.throttle > 0.75, 'RT/R2 should produce analog throttle');
assert.ok(first.brake > 0.20 && first.brake < 0.35, 'LT/L2 should produce analog braking');
assert.equal(first.handbrake, true, 'A/Cross should engage handbrake');
assert.equal(first.cameraPressed, true, 'Y/Triangle should edge-trigger camera');
assert.equal(first.resetPressed, true, 'B/Circle should edge-trigger reset');
assert.ok(first.lookX > 0, 'right stick X should produce camera look');
assert.ok(first.lookY < 0, 'right stick Y should produce camera look');

const second = gamepad.read();
assert.equal(second.cameraPressed, false, 'held camera button must not retrigger every frame');
assert.equal(second.resetPressed, false, 'held reset button must not retrigger every frame');

pad.buttons[3] = button();
pad.buttons[1] = button();
pad.buttons[14] = button(1, true);
pad.axes[0] = 0;

const dpad = gamepad.read();
assert.equal(dpad.steer, -1, 'D-pad left should provide full steering fallback');

pad.axes[0] = 0.04;
pad.buttons[14] = button();
const deadzoned = gamepad.read();
assert.equal(deadzoned.steer, 0, 'small stick drift should be removed by deadzone');

console.log('Gamepad smoke tests passed.');
