'use strict';

const PHOENIX_SPAWN = {
  latitude: 33.448376,
  longitude: -112.074036,
  height: 333,
  heading: Cesium.Math.toRadians(0)
};

const METERS_PER_DEGREE_LAT = 111320;
const MPH_PER_MPS = 2.2369362921;
const CAMERA_MODES = ['CHASE', 'HOOD', 'ORBIT'];

const ui = {
  setup: document.getElementById('setup-card'),
  form: document.getElementById('key-form'),
  key: document.getElementById('api-key'),
  setupStatus: document.getElementById('setup-status'),
  hud: document.getElementById('hud'),
  speed: document.getElementById('speed'),
  gear: document.getElementById('gear'),
  coords: document.getElementById('coords'),
  worldStatus: document.getElementById('world-status'),
  camera: document.getElementById('camera'),
  reset: document.getElementById('reset'),
  mapKey: document.getElementById('map-key'),
  help: document.getElementById('help'),
  touch: document.getElementById('touch-controls'),
  error: document.getElementById('error-banner')
};

const keys = new Set();
const touch = new Set();

const car = {
  latitude: PHOENIX_SPAWN.latitude,
  longitude: PHOENIX_SPAWN.longitude,
  height: PHOENIX_SPAWN.height + 1.1,
  targetGroundHeight: PHOENIX_SPAWN.height,
  heading: PHOENIX_SPAWN.heading,
  speed: 0,
  steering: 0,
  wheelbase: 2.62,
  maxForward: 62,
  maxReverse: 13,
  acceleration: 9.2,
  reverseAcceleration: 5.2,
  brakePower: 16.5,
  handbrakePower: 8.5
};

let viewer = null;
let tileset = null;
let carEntity = null;
let running = false;
let cameraModeIndex = 0;
let lastFrame = performance.now();
let lastHeightProbe = 0;
let heightProbePending = false;
let apiKey = '';

function showError(message) {
  ui.error.textContent = message;
  ui.error.classList.remove('hidden');
}

function clearError() {
  ui.error.textContent = '';
  ui.error.classList.add('hidden');
}

function setSetup(message) {
  ui.setupStatus.textContent = message || '';
}

function resetCar() {
  car.latitude = PHOENIX_SPAWN.latitude;
  car.longitude = PHOENIX_SPAWN.longitude;
  car.height = PHOENIX_SPAWN.height + 1.1;
  car.targetGroundHeight = PHOENIX_SPAWN.height;
  car.heading = PHOENIX_SPAWN.heading;
  car.speed = 0;
  car.steering = 0;
}

function destroyWorld() {
  running = false;
  if (viewer && !viewer.isDestroyed()) {
    viewer.destroy();
  }
  viewer = null;
  tileset = null;
  carEntity = null;
}

function initializeWorld(key) {
  destroyWorld();
  clearError();
  apiKey = key.trim();

  if (!apiKey) {
    setSetup('Enter a Maps Tiles API key.');
    return;
  }

  setSetup('Connecting to Google Photorealistic 3D Tiles…');

  Cesium.Ion.defaultAccessToken = '';
  Cesium.RequestScheduler.requestsByServer['tile.googleapis.com:443'] = 18;

  viewer = new Cesium.Viewer('cesiumContainer', {
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    imageryProvider: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    requestRenderMode: false
  });

  viewer.scene.globe.show = false;
  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0b0d10');

  tileset = viewer.scene.primitives.add(new Cesium.Cesium3DTileset({
    url: 'https://tile.googleapis.com/v1/3dtiles/root.json?key=' + encodeURIComponent(apiKey),
    showCreditsOnScreen: true,
    maximumScreenSpaceError: 14,
    dynamicScreenSpaceError: true
  }));

  carEntity = viewer.entities.add({
    name: 'Player Vehicle',
    position: Cesium.Cartesian3.fromDegrees(car.longitude, car.latitude, car.height),
    orientation: Cesium.Transforms.headingPitchRollQuaternion(
      Cesium.Cartesian3.fromDegrees(car.longitude, car.latitude, car.height),
      new Cesium.HeadingPitchRoll(car.heading, 0, 0)
    ),
    box: {
      dimensions: new Cesium.Cartesian3(1.88, 4.45, 1.38),
      material: Cesium.Color.fromCssColorString('#f2b84b'),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#191b1f')
    }
  });

  resetCar();
  updateCarEntity();
  setCamera(true);

  Promise.resolve(tileset.readyPromise).then(() => {
    try {
      sessionStorage.setItem('gravelRushGoogleTilesKey', apiKey);
    } catch (_) {}
    ui.setup.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    ui.help.classList.remove('hidden');
    ui.touch.classList.remove('hidden');
    ui.worldStatus.textContent = 'PHOTOREALISTIC 3D TILES LIVE';
    running = true;
    lastFrame = performance.now();
    requestAnimationFrame(frame);
    probeGroundHeight(true);
  }).catch((error) => {
    console.error(error);
    setSetup('Could not load Google 3D Tiles. Check that billing is active, the Maps Tiles API is enabled, and the key restrictions allow this site.');
    try { sessionStorage.removeItem('gravelRushGoogleTilesKey'); } catch (_) {}
    destroyWorld();
  });
}

function readInput() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = Array.from(pads).find(Boolean);

  let throttle = (keys.has('KeyW') || keys.has('ArrowUp') || touch.has('throttle')) ? 1 : 0;
  let brake = (keys.has('KeyS') || keys.has('ArrowDown') || touch.has('brake')) ? 1 : 0;
  let steer = ((keys.has('KeyD') || keys.has('ArrowRight') || touch.has('right')) ? 1 : 0)
    - ((keys.has('KeyA') || keys.has('ArrowLeft') || touch.has('left')) ? 1 : 0);
  let handbrake = keys.has('Space') || touch.has('handbrake');

  if (pad) {
    const stick = Math.abs(pad.axes[0] || 0) > 0.12 ? pad.axes[0] : 0;
    steer = Math.max(-1, Math.min(1, steer + stick));
    if (pad.buttons[7]) throttle = Math.max(throttle, pad.buttons[7].value);
    if (pad.buttons[6]) brake = Math.max(brake, pad.buttons[6].value);
    handbrake = handbrake || Boolean(pad.buttons[0] && pad.buttons[0].pressed);
  }

  return { throttle, brake, steer, handbrake };
}

function updatePhysics(dt) {
  const input = readInput();
  const absSpeed = Math.abs(car.speed);

  if (input.throttle > 0) {
    if (car.speed < -0.5) {
      car.speed += car.brakePower * input.throttle * dt;
    } else {
      const powerFade = 1 - Math.min(Math.max(car.speed, 0) / car.maxForward, 1) * 0.7;
      car.speed += car.acceleration * powerFade * input.throttle * dt;
    }
  }

  if (input.brake > 0) {
    if (car.speed > 0.7) {
      car.speed -= car.brakePower * input.brake * dt;
    } else {
      car.speed -= car.reverseAcceleration * input.brake * dt;
    }
  }

  const rollingResistance = 0.55 + absSpeed * 0.018;
  if (Math.abs(car.speed) > 0.02) {
    const resistance = Math.min(Math.abs(car.speed), rollingResistance * dt);
    car.speed -= Math.sign(car.speed) * resistance;
  } else if (!input.throttle && !input.brake) {
    car.speed = 0;
  }

  if (input.handbrake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), car.handbrakePower * dt);
  }

  car.speed = Math.max(-car.maxReverse, Math.min(car.maxForward, car.speed));

  const speedRatio = Math.min(absSpeed / 36, 1);
  const maxSteer = Cesium.Math.toRadians(34 - speedRatio * 20);
  car.steering += (input.steer * maxSteer - car.steering) * Math.min(1, dt * 9);

  if (Math.abs(car.speed) > 0.08) {
    const yawRate = (car.speed / car.wheelbase) * Math.tan(car.steering);
    const handbrakeYaw = input.handbrake ? input.steer * Math.min(absSpeed / 12, 1) * 0.55 : 0;
    car.heading += (yawRate + handbrakeYaw) * dt;
  }

  car.heading = Cesium.Math.zeroToTwoPi(car.heading);

  const northMeters = Math.cos(car.heading) * car.speed * dt;
  const eastMeters = Math.sin(car.heading) * car.speed * dt;
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos(Cesium.Math.toRadians(car.latitude));

  car.latitude += northMeters / METERS_PER_DEGREE_LAT;
  car.longitude += eastMeters / Math.max(metersPerDegreeLon, 1);

  const targetCarHeight = car.targetGroundHeight + 1.05;
  car.height += (targetCarHeight - car.height) * Math.min(1, dt * 7);
}

function updateCarEntity() {
  if (!carEntity) return;

  const position = Cesium.Cartesian3.fromDegrees(car.longitude, car.latitude, car.height);
  carEntity.position = position;
  carEntity.orientation = Cesium.Transforms.headingPitchRollQuaternion(
    position,
    new Cesium.HeadingPitchRoll(car.heading, 0, 0)
  );
}

function probeGroundHeight(force = false) {
  if (!viewer || heightProbePending) return;
  const now = performance.now();
  if (!force && now - lastHeightProbe < 260) return;
  lastHeightProbe = now;
  heightProbePending = true;

  const sample = Cesium.Cartographic.fromDegrees(car.longitude, car.latitude, car.height + 120);

  viewer.scene.sampleHeightMostDetailed([sample]).then((result) => {
    const sampled = result && result[0] && result[0].height;
    if (Number.isFinite(sampled)) {
      const delta = sampled - car.targetGroundHeight;
      if (Math.abs(delta) < 12 || Math.abs(car.speed) < 2 || force) {
        car.targetGroundHeight = sampled;
      } else if (delta > 12) {
        // A sudden large rise is treated as an obstacle rather than teleporting the car onto a roof.
        car.speed *= -0.08;
      }
    }
  }).catch(() => {
    // Keep the most recent valid ground height if the local tile is not ready yet.
  }).finally(() => {
    heightProbePending = false;
  });
}

function setCamera(immediate = false) {
  if (!viewer || !carEntity) return;

  const mode = CAMERA_MODES[cameraModeIndex];
  ui.camera.textContent = mode;
  const position = Cesium.Cartesian3.fromDegrees(car.longitude, car.latitude, car.height + 0.7);

  if (mode === 'CHASE') {
    const range = 20 + Math.min(Math.abs(car.speed) * 0.35, 15);
    viewer.camera.lookAt(
      position,
      new Cesium.HeadingPitchRange(car.heading + Math.PI, Cesium.Math.toRadians(-18), range)
    );
  } else if (mode === 'HOOD') {
    viewer.camera.lookAt(
      position,
      new Cesium.HeadingPitchRange(car.heading + Math.PI, Cesium.Math.toRadians(-4), 2.7)
    );
  } else if (immediate) {
    viewer.camera.lookAt(
      position,
      new Cesium.HeadingPitchRange(car.heading + Math.PI, Cesium.Math.toRadians(-35), 55)
    );
  }
}

function updateCamera() {
  if (!viewer) return;
  const mode = CAMERA_MODES[cameraModeIndex];
  if (mode === 'ORBIT') return;
  setCamera(false);
}

function updateHUD() {
  ui.speed.textContent = String(Math.round(Math.abs(car.speed) * MPH_PER_MPS));
  ui.gear.textContent = car.speed < -0.5 ? 'R' : (Math.abs(car.speed) < 0.25 ? 'N' : 'D');
  ui.coords.textContent = car.latitude.toFixed(5) + ', ' + car.longitude.toFixed(5);
}

function changeCamera() {
  cameraModeIndex = (cameraModeIndex + 1) % CAMERA_MODES.length;
  setCamera(true);
}

function frame(now) {
  if (!running || !viewer || viewer.isDestroyed()) return;

  const dt = Math.min((now - lastFrame) / 1000, 0.04);
  lastFrame = now;

  updatePhysics(dt);
  updateCarEntity();
  probeGroundHeight();
  updateCamera();
  updateHUD();

  requestAnimationFrame(frame);
}

ui.form.addEventListener('submit', (event) => {
  event.preventDefault();
  initializeWorld(ui.key.value);
});

ui.camera.addEventListener('click', changeCamera);
ui.reset.addEventListener('click', () => {
  resetCar();
  updateCarEntity();
  probeGroundHeight(true);
  setCamera(true);
});
ui.mapKey.addEventListener('click', () => {
  destroyWorld();
  ui.hud.classList.add('hidden');
  ui.help.classList.add('hidden');
  ui.touch.classList.add('hidden');
  ui.setup.classList.remove('hidden');
  ui.key.value = apiKey;
  setSetup('Enter a different key, or reload the same one.');
});

window.addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code)) {
    event.preventDefault();
  }
  if (event.code === 'KeyR') {
    resetCar();
    updateCarEntity();
    probeGroundHeight(true);
    setCamera(true);
  }
  if (event.code === 'KeyC' && !event.repeat) changeCamera();
});

window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());

document.querySelectorAll('[data-control]').forEach((button) => {
  const control = button.dataset.control;

  const press = (event) => {
    event.preventDefault();
    touch.add(control);
    button.classList.add('active');
    if (button.setPointerCapture && event.pointerId !== undefined) {
      button.setPointerCapture(event.pointerId);
    }
  };

  const release = (event) => {
    event.preventDefault();
    touch.delete(control);
    button.classList.remove('active');
  };

  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('pointerleave', release);
});

try {
  const saved = sessionStorage.getItem('gravelRushGoogleTilesKey');
  if (saved) {
    ui.key.value = saved;
    initializeWorld(saved);
  }
} catch (_) {}
