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
const VEHICLE_BODY_HALF_HEIGHT = 0.69;

const ui = {
  setup: document.getElementById('setup-card'),
  form: document.getElementById('key-form'),
  key: document.getElementById('api-key'),
  setupStatus: document.getElementById('setup-status'),
  hud: document.getElementById('hud'),
  speed: document.getElementById('speed'),
  gear: document.getElementById('gear'),
  rpm: document.getElementById('rpm'),
  coords: document.getElementById('coords'),
  worldStatus: document.getElementById('world-status'),
  gLong: document.getElementById('g-long'),
  gLat: document.getElementById('g-lat'),
  slip: document.getElementById('slip'),
  grip: document.getElementById('grip'),
  drive: document.getElementById('drive'),
  camera: document.getElementById('camera'),
  reset: document.getElementById('reset'),
  mapKey: document.getElementById('map-key'),
  help: document.getElementById('help'),
  touch: document.getElementById('touch-controls'),
  error: document.getElementById('error-banner')
};

const keys = new Set();
const touch = new Set();

let viewer = null;
let tileset = null;
let carEntity = null;
let running = false;
let cameraModeIndex = 0;
let lastFrame = performance.now();
let lastHeightProbe = 0;
let heightProbePending = false;
let apiKey = '';
let statusTimer = 0;

let world = {
  latitude: PHOENIX_SPAWN.latitude,
  longitude: PHOENIX_SPAWN.longitude
};

let vehicle = null;

function createVehicleState() {
  const state = GravelRushPhysics.createVehicle(GravelRushVehicleConfig);
  state.heading = PHOENIX_SPAWN.heading;
  GravelRushPhysics.setGroundHeights(state, {
    fl: PHOENIX_SPAWN.height,
    fr: PHOENIX_SPAWN.height,
    rl: PHOENIX_SPAWN.height,
    rr: PHOENIX_SPAWN.height
  });
  return state;
}

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

function setWorldStatus(message, duration = 0) {
  ui.worldStatus.textContent = message;
  statusTimer = duration;
}

function resetCar() {
  world.latitude = PHOENIX_SPAWN.latitude;
  world.longitude = PHOENIX_SPAWN.longitude;
  vehicle = createVehicleState();
  if (carEntity) updateCarEntity();
  probeWheelGround(true);
  setCamera(true);
}

function destroyWorld() {
  running = false;
  heightProbePending = false;
  if (viewer && !viewer.isDestroyed()) viewer.destroy();
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
    maximumScreenSpaceError: 12,
    dynamicScreenSpaceError: true
  }));

  resetCar();

  const startPosition = vehiclePosition();
  carEntity = viewer.entities.add({
    name: GravelRushVehicleConfig.name,
    position: startPosition,
    orientation: vehicleOrientation(startPosition),
    box: {
      dimensions: new Cesium.Cartesian3(1.88, 4.45, 1.38),
      material: Cesium.Color.fromCssColorString('#f2b84b'),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#191b1f')
    }
  });

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
    setWorldStatus('PHOTOREALISTIC 3D TILES LIVE');
    running = true;
    lastFrame = performance.now();
    requestAnimationFrame(frame);
    probeWheelGround(true);
  }).catch((error) => {
    console.error(error);
    setSetup('Could not load Google 3D Tiles. Check billing, Map Tiles API access, and key restrictions.');
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

function metersToGeo(northMeters, eastMeters, latitude = world.latitude) {
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos(Cesium.Math.toRadians(latitude));
  return {
    latitude: northMeters / METERS_PER_DEGREE_LAT,
    longitude: eastMeters / Math.max(metersPerDegreeLon, 1)
  };
}

function localOffsetToGeo(forwardMeters, rightMeters) {
  const c = Math.cos(vehicle.heading);
  const s = Math.sin(vehicle.heading);
  const north = c * forwardMeters - s * rightMeters;
  const east = s * forwardMeters + c * rightMeters;
  const delta = metersToGeo(north, east);
  return {
    latitude: world.latitude + delta.latitude,
    longitude: world.longitude + delta.longitude
  };
}

function integrateWorldPosition(dt) {
  const c = Math.cos(vehicle.heading);
  const s = Math.sin(vehicle.heading);

  const northVelocity = c * vehicle.vx - s * vehicle.vy;
  const eastVelocity = s * vehicle.vx + c * vehicle.vy;

  const delta = metersToGeo(northVelocity * dt, eastVelocity * dt);
  world.latitude += delta.latitude;
  world.longitude += delta.longitude;
}

function vehicleAltitude() {
  return vehicle.groundHeight + VEHICLE_BODY_HALF_HEIGHT + Math.max(vehicle.bodyHeightOffset, 0.04);
}

function vehiclePosition() {
  return Cesium.Cartesian3.fromDegrees(
    world.longitude,
    world.latitude,
    vehicleAltitude()
  );
}

function vehicleOrientation(position) {
  return Cesium.Transforms.headingPitchRollQuaternion(
    position,
    new Cesium.HeadingPitchRoll(
      vehicle.heading,
      vehicle.pitch,
      vehicle.roll
    )
  );
}

function updateCarEntity() {
  if (!carEntity || !vehicle) return;
  const position = vehiclePosition();
  carEntity.position = position;
  carEntity.orientation = vehicleOrientation(position);
}

function buildWheelProbePoints() {
  return ['fl', 'fr', 'rl', 'rr'].map((key) => {
    const p = GravelRushPhysics.wheelPosition(GravelRushVehicleConfig, key);
    const geo = localOffsetToGeo(p.x, p.y);
    return {
      key,
      cartographic: Cesium.Cartographic.fromDegrees(
        geo.longitude,
        geo.latitude,
        vehicle.groundHeight + 8
      )
    };
  });
}

function handleGroundResults(probes, result, force) {
  const heights = {};
  for (let i = 0; i < probes.length; i++) {
    const height = result && result[i] && result[i].height;
    if (Number.isFinite(height)) heights[probes[i].key] = height;
  }

  const valid = Object.values(heights);
  if (!valid.length) return;

  const front = [heights.fl, heights.fr].filter(Number.isFinite);
  const rear = [heights.rl, heights.rr].filter(Number.isFinite);
  const frontAvg = front.length ? front.reduce((a,b) => a+b,0) / front.length : vehicle.groundHeight;
  const rearAvg = rear.length ? rear.reduce((a,b) => a+b,0) / rear.length : vehicle.groundHeight;

  // Google 3D Tiles are a visual surface, not a game collision mesh.
  // Treat an abrupt near-vertical height change across one wheelbase as a solid obstacle proxy.
  const abruptStep = !force &&
    Math.abs(vehicle.vx) > 2 &&
    frontAvg - rearAvg > 1.45;

  if (abruptStep) {
    vehicle.vx *= -0.07;
    vehicle.vy *= 0.30;
    vehicle.yawRate *= 0.35;
    setWorldStatus('OBSTACLE IMPACT', 1.2);
    return;
  }

  GravelRushPhysics.setGroundHeights(vehicle, heights);
}

function probeWheelGround(force = false) {
  if (!viewer || !vehicle || heightProbePending) return;

  const now = performance.now();
  if (!force && now - lastHeightProbe < 90) return;

  lastHeightProbe = now;
  heightProbePending = true;
  const probes = buildWheelProbePoints();
  const cartographics = probes.map(p => p.cartographic);

  viewer.scene.sampleHeightMostDetailed(cartographics).then((result) => {
    handleGroundResults(probes, result, force);
  }).catch(() => {
    // Tiles can be temporarily unavailable while a neighborhood streams in.
  }).finally(() => {
    heightProbePending = false;
  });
}

function setCamera(immediate = false) {
  if (!viewer || !vehicle) return;

  const mode = CAMERA_MODES[cameraModeIndex];
  ui.camera.textContent = mode;
  const position = vehiclePosition();

  if (mode === 'CHASE') {
    const range = 17 + Math.min(vehicle.speed * 0.34, 17);
    viewer.camera.lookAt(
      position,
      new Cesium.HeadingPitchRange(
        vehicle.heading + Math.PI,
        Cesium.Math.toRadians(-15),
        range
      )
    );
  } else if (mode === 'HOOD') {
    viewer.camera.lookAt(
      position,
      new Cesium.HeadingPitchRange(
        vehicle.heading + Math.PI,
        Cesium.Math.toRadians(-2),
        2.65
      )
    );
  } else if (immediate) {
    viewer.camera.lookAt(
      position,
      new Cesium.HeadingPitchRange(
        vehicle.heading + Math.PI,
        Cesium.Math.toRadians(-34),
        52
      )
    );
  }
}

function updateCamera() {
  if (!viewer || CAMERA_MODES[cameraModeIndex] === 'ORBIT') return;
  setCamera(false);
}

function updateHUD(dt) {
  const t = vehicle.telemetry;
  const p = vehicle.powertrain;
  const displayGear = p.reverse ? 'R' : (Math.abs(vehicle.vx) < 0.15 ? 'N' : String(p.gear));

  ui.speed.textContent = String(Math.round(vehicle.speed * MPH_PER_MPS));
  ui.gear.textContent = displayGear;
  ui.rpm.textContent = Math.round(p.engineRPM / 50) * 50 + ' RPM';
  ui.coords.textContent = world.latitude.toFixed(5) + ', ' + world.longitude.toFixed(5);
  ui.gLong.textContent = (t.longitudinalG >= 0 ? '+' : '') + t.longitudinalG.toFixed(2) + 'g LONG';
  ui.gLat.textContent = (t.lateralG >= 0 ? '+' : '') + t.lateralG.toFixed(2) + 'g LAT';
  ui.slip.textContent = Math.round(t.maxSlipRatio * 100) + '% WHEEL SLIP';
  ui.grip.textContent = Math.round(t.gripUse * 100) + '% GRIP';
  ui.drive.textContent = GravelRushVehicleConfig.powertrain.drivetrain + ' • ABS • TCS';

  if (statusTimer > 0) {
    statusTimer -= dt;
    if (statusTimer <= 0) setWorldStatus('PHOTOREALISTIC 3D TILES LIVE');
  }
}

function changeCamera() {
  cameraModeIndex = (cameraModeIndex + 1) % CAMERA_MODES.length;
  setCamera(true);
}

function frame(now) {
  if (!running || !viewer || viewer.isDestroyed() || !vehicle) return;

  const dt = Math.min((now - lastFrame) / 1000, 0.033);
  lastFrame = now;

  const inputs = readInput();

  // Substep the physics so tire and suspension forces remain stable during frame-time spikes.
  const targetSubstep = 1 / 120;
  const substeps = Math.max(1, Math.ceil(dt / targetSubstep));
  const subDt = dt / substeps;

  for (let i = 0; i < substeps; i++) {
    GravelRushPhysics.step(vehicle, inputs, subDt);
    integrateWorldPosition(subDt);
  }

  probeWheelGround();
  updateCarEntity();
  updateCamera();
  updateHUD(dt);

  requestAnimationFrame(frame);
}

ui.form.addEventListener('submit', (event) => {
  event.preventDefault();
  initializeWorld(ui.key.value);
});

ui.camera.addEventListener('click', changeCamera);
ui.reset.addEventListener('click', resetCar);

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

  if (event.code === 'KeyR' && !event.repeat) resetCar();
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

vehicle = createVehicleState();

try {
  const saved = sessionStorage.getItem('gravelRushGoogleTilesKey');
  if (saved) {
    ui.key.value = saved;
    initializeWorld(saved);
  }
} catch (_) {}
