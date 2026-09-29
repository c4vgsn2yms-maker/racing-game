'use strict';

const assert = require('node:assert/strict');

global.window = globalThis;

require('../src/physics/math.js');
require('../src/physics/vehicle-config.js');
require('../src/physics/tire-model.js');
require('../src/physics/powertrain.js');
require('../src/physics/vehicle-dynamics.js');
require('../src/world/course-data.js');

const course = GravelRushCourse;

assert.ok(course.totalLength > 35000 && course.totalLength < 45000,
  'course should remain roughly 35-45 km long');

assert.ok(course.samples.length >= 200,
  'course should have enough spline samples for smooth rendering');

const seen = new Set(course.samples.map(p => p.surfaceKey));
for (const key of ['ASPHALT','GRAVEL','DIRT','MUD','SAND','ROCK','SNOW','ICE','MOUNTAIN','ROUGH']) {
  assert.ok(seen.has(key), 'course should include surface: ' + key);
}

for (let i = 0; i < course.samples.length; i += 17) {
  const p = course.samples[i];
  const h = course.heightAt(p.x, p.y);
  assert.ok(Number.isFinite(h), 'course height must remain finite');
  const s = course.surfaceAt(p.x, p.y);
  assert.ok(s.grip > 0 && s.grip <= 1.1, 'surface grip must remain within calibration range');
  assert.ok(s.rolling > 0, 'surface rolling resistance scale must be positive');
}

const spawn = course.spawn();
assert.ok(Number.isFinite(spawn.heading), 'spawn heading must be finite');
assert.ok(Number.isFinite(spawn.z), 'spawn height must be finite');

function makeVehicle(grip, rolling) {
  const v = GravelRushPhysics.createVehicle(GravelRushVehicleConfig);
  const h = 420;
  GravelRushPhysics.setGroundHeights(v, { fl:h, fr:h, rl:h, rr:h });
  v.surfaceGrip = grip;
  v.surfaceRolling = rolling;
  return v;
}

function step(v, seconds, input) {
  const dt = 1 / 120;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    GravelRushPhysics.step(v, input, dt);
  }
}

const asphalt = makeVehicle(1.0, 1.0);
const ice = makeVehicle(0.23, 0.75);

step(asphalt, 5.5, { throttle:1, brake:0, steer:0, handbrake:false });
step(ice, 5.5, { throttle:1, brake:0, steer:0, handbrake:false });

step(asphalt, 1.2, { throttle:0.4, brake:0, steer:0.22, handbrake:false });
step(ice, 1.2, { throttle:0.4, brake:0, steer:0.22, handbrake:false });

assert.ok(
  Math.abs(asphalt.telemetry.lateralG) > Math.abs(ice.telemetry.lateralG),
  'asphalt should support more lateral acceleration than ice'
);

const onRoad = course.surfaceAt(spawn.x, spawn.y);
const farOff = course.surfaceAt(spawn.x + 150, spawn.y + 150);
assert.ok(farOff.offTrack, 'far terrain should register as off-track');
assert.ok(farOff.grip < onRoad.grip, 'off-track terrain should reduce grip');

console.log('Course smoke tests passed.');
