'use strict';

global.window = globalThis;

require('../src/physics/math.js');
require('../src/physics/vehicle-config.js');
require('../src/physics/tire-model.js');
require('../src/physics/powertrain.js');
require('../src/physics/vehicle-dynamics.js');

const assert = require('node:assert/strict');

const DT = 1 / 120;

function createVehicle() {
  const state = GravelRushPhysics.createVehicle(GravelRushVehicleConfig);
  GravelRushPhysics.setGroundHeights(state, {
    fl: 333,
    fr: 333,
    rl: 333,
    rr: 333
  });
  return state;
}

function stepFor(state, seconds, inputs) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    GravelRushPhysics.step(state, typeof inputs === 'function' ? inputs(i, state) : inputs, DT);
    for (const value of [
      state.vx,
      state.vy,
      state.yawRate,
      state.heading,
      state.ax,
      state.ay,
      state.powertrain.engineRPM
    ]) {
      assert.ok(Number.isFinite(value), 'physics state must remain finite');
    }
  }
}

{
  const car = createVehicle();
  stepFor(car, 5, { throttle: 1, brake: 0, steer: 0, handbrake: false });
  const mph = car.speed * 2.2369362921;
  assert.ok(mph > 35 && mph < 75, '5-second launch should remain in a plausible calibration window');
  assert.ok(car.powertrain.gear >= 2, 'automatic gearbox should upshift during full acceleration');
}

{
  const car = createVehicle();
  stepFor(car, 10, { throttle: 1, brake: 0, steer: 0, handbrake: false });
  const before = car.speed;
  stepFor(car, 2, { throttle: 0, brake: 1, steer: 0, handbrake: false });
  assert.ok(car.speed < before - 8, 'hard braking should meaningfully reduce speed');
  assert.ok(car.telemetry.longitudinalG < -0.35, 'hard braking should generate longitudinal deceleration');
}

{
  const car = createVehicle();
  stepFor(car, 5.5, { throttle: 1, brake: 0, steer: 0, handbrake: false });
  stepFor(car, 2.5, { throttle: 0.55, brake: 0, steer: 0.15, handbrake: false });
  assert.ok(Math.abs(car.telemetry.lateralG) > 0.2, 'cornering should produce measurable lateral acceleration');
  const leftLoad = car.wheels.fl.normalLoad + car.wheels.rl.normalLoad;
  const rightLoad = car.wheels.fr.normalLoad + car.wheels.rr.normalLoad;
  assert.ok(Math.abs(leftLoad - rightLoad) > 500, 'cornering should transfer vertical load laterally');
}

{
  const car = createVehicle();
  GravelRushPhysics.setGroundHeights(car, {
    fl: 333.20,
    fr: 333.20,
    rl: 333.00,
    rr: 333.00
  });
  stepFor(car, 2, { throttle: 0, brake: 0, steer: 0, handbrake: false });
  assert.ok(car.roadPitch > 0.03, 'four wheel heights should resolve an uphill road grade');

  const totalLoad = Object.values(car.wheels).reduce((sum, wheel) => sum + wheel.normalLoad, 0);
  const weight = GravelRushVehicleConfig.mass * GravelRushMath.G;
  assert.ok(Math.abs(totalLoad - weight) / weight < 0.08, 'steady grade must not create fake vehicle weight');
}

{
  const car = createVehicle();
  stepFor(car, 4, { throttle: 0, brake: 1, steer: 0, handbrake: false });
  assert.equal(car.powertrain.reverse, true, 'holding brake/reverse at rest should select reverse');
  assert.ok(car.vx < -1, 'reverse gear should drive the vehicle backward');
}

console.log('Physics smoke tests passed.');
