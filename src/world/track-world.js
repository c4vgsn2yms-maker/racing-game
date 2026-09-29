'use strict';

const MPH_PER_MPS = 2.2369362921;
const VEHICLE_BODY_HALF_HEIGHT = 0.69;
const CAMERA_MODES = ['THIRD PERSON', 'FIRST PERSON'];
const METERS_PER_DEGREE_LAT = 111320;

const course = GravelRushCourse;
const spawn = course.spawn();

const ui = {
  startCard: document.getElementById('setup-card'),
  startButton: document.getElementById('start-game'),
  hud: document.getElementById('hud'),
  speed: document.getElementById('speed'),
  gear: document.getElementById('gear'),
  rpm: document.getElementById('rpm'),
  section: document.getElementById('section-name'),
  progress: document.getElementById('course-progress'),
  worldStatus: document.getElementById('world-status'),
  gLong: document.getElementById('g-long'),
  gLat: document.getElementById('g-lat'),
  slip: document.getElementById('slip'),
  grip: document.getElementById('grip'),
  drive: document.getElementById('drive'),
  controllerStatus: document.getElementById('controller-status'),
  camera: document.getElementById('camera'),
  reset: document.getElementById('reset'),
  help: document.getElementById('help'),
  touch: document.getElementById('touch-controls'),
  error: document.getElementById('error-banner')
};

const keys = new Set();
const touch = new Set();

let viewer = null;
let carEntity = null;
let running = false;
let cameraModeIndex = 0;
let cameraLookX = 0;
let cameraLookY = 0;
let lastFrame = performance.now();
let statusTimer = 0;
let lastControllerInput = null;

let worldPosition = {
  x: spawn.x,
  y: spawn.y
};

let vehicle = null;

function createVehicleState() {
  const state = GravelRushPhysics.createVehicle(GravelRushVehicleConfig);
  state.heading = spawn.heading;

  const h = course.heightAt(spawn.x, spawn.y);
  GravelRushPhysics.setGroundHeights(state, {
    fl: h,
    fr: h,
    rl: h,
    rr: h
  });

  const surface = course.surfaceAt(spawn.x, spawn.y);
  state.surfaceGrip = surface.grip;
  state.surfaceRolling = surface.rolling;
  state.surfaceName = surface.name;
  return state;
}

function setWorldStatus(message, duration = 0) {
  ui.worldStatus.textContent = message;
  statusTimer = duration;
}

function localToGeo(x, y) {
  const lat = course.ORIGIN.latitude + y / METERS_PER_DEGREE_LAT;
  const lonScale = METERS_PER_DEGREE_LAT * Math.cos(Cesium.Math.toRadians(course.ORIGIN.latitude));
  const lon = course.ORIGIN.longitude + x / lonScale;
  return { latitude: lat, longitude: lon };
}

function localToCartesian(x, y, z) {
  const geo = localToGeo(x, y);
  return Cesium.Cartesian3.fromDegrees(geo.longitude, geo.latitude, z);
}

function color(hex, alpha = 1) {
  return Cesium.Color.fromCssColorString(hex).withAlpha(alpha);
}

function segmentQuad(a, b, width, raise = 0) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const half = width * 0.5;

  const points = [
    { x: a.x + nx * half, y: a.y + ny * half },
    { x: b.x + nx * half, y: b.y + ny * half },
    { x: b.x - nx * half, y: b.y - ny * half },
    { x: a.x - nx * half, y: a.y - ny * half }
  ];

  return points.map(p => localToCartesian(
    p.x,
    p.y,
    course.heightAt(p.x, p.y) + raise
  ));
}

function buildCourseVisuals() {
  const samples = course.samples;

  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % samples.length];
    const surface = course.SURFACES[a.surfaceKey];

    if (i % 2 === 0) {
      viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(segmentQuad(a, b, 170, -0.18)),
          perPositionHeight: true,
          material: color(surface.terrainColor, 1),
          outline: false
        }
      });
    }

    viewer.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(segmentQuad(a, b, surface.width, 0.05)),
        perPositionHeight: true,
        material: color(surface.color, 1),
        outline: false
      }
    });

    if ((a.surfaceKey === 'ASPHALT' || a.surfaceKey === 'MOUNTAIN') && i % 2 === 0) {
      const positions = [
        localToCartesian(a.x, a.y, course.heightAt(a.x, a.y) + 0.11),
        localToCartesian(b.x, b.y, course.heightAt(b.x, b.y) + 0.11)
      ];

      viewer.entities.add({
        polyline: {
          positions,
          width: 1.5,
          material: color('#e8e2be', 0.82)
        }
      });
    }
  }

  addSectionMarkers();
  addTracksideProps();
  addStartGate();
}

function addSectionMarkers() {
  for (const [start, , key, label] of course.SECTION_BANDS) {
    const index = Math.min(
      course.samples.length - 1,
      Math.floor(start * course.samples.length)
    );
    const p = course.samples[index];
    const surface = course.SURFACES[key];

    viewer.entities.add({
      position: localToCartesian(p.x, p.y, course.heightAt(p.x, p.y) + 5.5),
      point: {
        pixelSize: 9,
        color: color(surface.color),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2
      },
      label: {
        text: label.toUpperCase(),
        font: '700 15px system-ui',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -24),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2200)
      }
    });
  }
}

function deterministicNoise(i, salt = 0) {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function addTracksideProps() {
  const samples = course.samples;

  for (let i = 0; i < samples.length; i += 7) {
    const p = samples[i];
    const surface = course.SURFACES[p.surfaceKey];
    const side = deterministicNoise(i, 2) > 0.5 ? 1 : -1;
    const distance = 28 + deterministicNoise(i, 3) * 55;
    const nx = -p.ty;
    const ny = p.tx;
    const x = p.x + nx * distance * side;
    const y = p.y + ny * distance * side;
    const z = course.heightAt(x, y);

    let dimensions = new Cesium.Cartesian3(4, 4, 4);
    let material = color('#5f5a50');

    if (p.surfaceKey === 'SAND' || p.surfaceKey === 'DIRT' || p.surfaceKey === 'GRAVEL') {
      dimensions = new Cesium.Cartesian3(2.4, 2.4, 7 + deterministicNoise(i, 4) * 8);
      material = color('#6c7650');
    } else if (p.surfaceKey === 'SNOW' || p.surfaceKey === 'ICE') {
      dimensions = new Cesium.Cartesian3(3.5, 3.5, 6);
      material = color('#e0e6e9');
    } else if (p.surfaceKey === 'ROCK' || p.surfaceKey === 'MOUNTAIN') {
      dimensions = new Cesium.Cartesian3(
        5 + deterministicNoise(i, 5) * 8,
        5 + deterministicNoise(i, 6) * 8,
        4 + deterministicNoise(i, 7) * 10
      );
      material = color('#5a5854');
    } else {
      dimensions = new Cesium.Cartesian3(2.2, 2.2, 10 + deterministicNoise(i, 8) * 12);
      material = color('#3e613d');
    }

    viewer.entities.add({
      position: localToCartesian(x, y, z + dimensions.z * 0.5),
      box: {
        dimensions,
        material,
        outline: false
      }
    });
  }
}

function addStartGate() {
  const p = course.samples[0];
  const nx = -p.ty;
  const ny = p.tx;

  for (const side of [-1, 1]) {
    const x = p.x + nx * 8.2 * side;
    const y = p.y + ny * 8.2 * side;
    viewer.entities.add({
      position: localToCartesian(x, y, course.heightAt(x, y) + 3.2),
      box: {
        dimensions: new Cesium.Cartesian3(0.7, 0.7, 6.4),
        material: Cesium.Color.WHITE
      }
    });
  }

  viewer.entities.add({
    position: localToCartesian(p.x, p.y, course.heightAt(p.x, p.y) + 6.2),
    box: {
      dimensions: new Cesium.Cartesian3(17, 0.8, 0.8),
      material: Cesium.Color.fromCssColorString('#f2b84b')
    }
  });
}

function initializeWorld() {
  if (viewer && !viewer.isDestroyed()) viewer.destroy();

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
  viewer.scene.skyAtmosphere.show = false;
  viewer.scene.backgroundColor = color('#7b9ab0');
  viewer.scene.fog.enabled = false;

  vehicle = createVehicleState();
  buildCourseVisuals();

  const position = vehiclePosition();
  carEntity = viewer.entities.add({
    name: GravelRushVehicleConfig.name,
    position,
    orientation: vehicleOrientation(position),
    box: {
      dimensions: new Cesium.Cartesian3(1.88, 4.45, 1.38),
      material: color('#f2b84b'),
      outline: true,
      outlineColor: color('#191b1f')
    }
  });

  updateWheelGround();
  updateCarEntity();
  setCamera();
}

function resetCar() {
  const start = course.spawn();
  worldPosition.x = start.x;
  worldPosition.y = start.y;
  spawn.heading = start.heading;
  vehicle = createVehicleState();

  if (carEntity) updateCarEntity();
  updateWheelGround();
  setCamera();
  setWorldStatus('RESET TO START', 1.0);
}

function readInput() {
  let throttle = (keys.has('KeyW') || keys.has('ArrowUp') || touch.has('throttle')) ? 1 : 0;
  let brake = (keys.has('KeyS') || keys.has('ArrowDown') || touch.has('brake')) ? 1 : 0;
  let steer = ((keys.has('KeyD') || keys.has('ArrowRight') || touch.has('right')) ? 1 : 0)
    - ((keys.has('KeyA') || keys.has('ArrowLeft') || touch.has('left')) ? 1 : 0);
  let handbrake = keys.has('Space') || touch.has('handbrake');

  const controller = window.GravelRushGamepad
    ? GravelRushGamepad.read()
    : null;

  if (controller && controller.connected) {
    throttle = Math.max(throttle, controller.throttle);
    brake = Math.max(brake, controller.brake);
    steer = Math.max(-1, Math.min(1, steer + controller.steer));
    handbrake = handbrake || controller.handbrake;
  }

  lastControllerInput = controller;

  return { throttle, brake, steer, handbrake, controller };
}

function updateControllerActions(controller, dt) {
  const connected = Boolean(controller && controller.connected);

  if (connected) {
    if (controller.cameraPressed) changeCamera();
    if (controller.resetPressed) resetCar();

    const response = Math.min(1, dt * 10);
    cameraLookX += ((controller.lookX || 0) - cameraLookX) * response;
    cameraLookY += ((controller.lookY || 0) - cameraLookY) * response;
  } else {
    const response = Math.min(1, dt * 8);
    cameraLookX += (0 - cameraLookX) * response;
    cameraLookY += (0 - cameraLookY) * response;
  }
}

function integrateWorldPosition(dt) {
  const c = Math.cos(vehicle.heading);
  const s = Math.sin(vehicle.heading);

  const northVelocity = c * vehicle.vx - s * vehicle.vy;
  const eastVelocity = s * vehicle.vx + c * vehicle.vy;

  worldPosition.x += eastVelocity * dt;
  worldPosition.y += northVelocity * dt;
}

function wheelWorldPoint(key) {
  const p = GravelRushPhysics.wheelPosition(GravelRushVehicleConfig, key);
  const c = Math.cos(vehicle.heading);
  const s = Math.sin(vehicle.heading);

  const north = c * p.x - s * p.y;
  const east = s * p.x + c * p.y;

  return {
    x: worldPosition.x + east,
    y: worldPosition.y + north
  };
}

function updateWheelGround() {
  const heights = {};

  for (const key of ['fl', 'fr', 'rl', 'rr']) {
    const p = wheelWorldPoint(key);
    heights[key] = course.heightAt(p.x, p.y);
  }

  GravelRushPhysics.setGroundHeights(vehicle, heights);

  const surface = course.surfaceAt(worldPosition.x, worldPosition.y);
  vehicle.surfaceGrip = surface.grip;
  vehicle.surfaceRolling = surface.rolling;
  vehicle.surfaceName = surface.name;
  vehicle.currentSurface = surface;
}

function vehicleAltitude() {
  return vehicle.groundHeight + VEHICLE_BODY_HALF_HEIGHT + Math.max(vehicle.bodyHeightOffset, 0.04);
}

function vehiclePosition() {
  return localToCartesian(worldPosition.x, worldPosition.y, vehicleAltitude());
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

function offsetFromVehicle(forward, right) {
  const c = Math.cos(vehicle.heading);
  const s = Math.sin(vehicle.heading);

  const north = c * forward - s * right;
  const east = s * forward + c * right;

  return {
    x: worldPosition.x + east,
    y: worldPosition.y + north
  };
}

function aimCamera(cameraLocal, targetLocal) {
  const cameraPosition = localToCartesian(cameraLocal.x, cameraLocal.y, cameraLocal.z);
  const targetPosition = localToCartesian(targetLocal.x, targetLocal.y, targetLocal.z);

  const direction = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(targetPosition, cameraPosition, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );

  const surfaceUp = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
    cameraPosition,
    new Cesium.Cartesian3()
  );

  let right = Cesium.Cartesian3.cross(direction, surfaceUp, new Cesium.Cartesian3());
  if (Cesium.Cartesian3.magnitudeSquared(right) < 1e-8) {
    right = Cesium.Cartesian3.clone(Cesium.Cartesian3.UNIT_X, right);
  } else {
    Cesium.Cartesian3.normalize(right, right);
  }

  const up = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );

  viewer.camera.setView({
    destination: cameraPosition,
    orientation: { direction, up }
  });
}

function setCamera() {
  if (!viewer || !vehicle) return;

  const mode = CAMERA_MODES[cameraModeIndex];
  ui.camera.textContent = mode;

  if (carEntity) {
    carEntity.show = mode !== 'FIRST PERSON';
  }

  const carGround = vehicle.groundHeight;
  const carCenter = vehicleAltitude();

  if (mode === 'FIRST PERSON') {
    const viewHeading = vehicle.heading + cameraLookX * Cesium.Math.toRadians(78);
    const cameraOffset = offsetFromVehicle(0.70, 0);
    const lookDistance = 34;
    const targetX = cameraOffset.x + Math.sin(viewHeading) * lookDistance;
    const targetY = cameraOffset.y + Math.cos(viewHeading) * lookDistance;

    aimCamera(
      {
        x: cameraOffset.x,
        y: cameraOffset.y,
        z: carGround + 1.24
      },
      {
        x: targetX,
        y: targetY,
        z: carGround + 1.24 - cameraLookY * 9
      }
    );
    return;
  }

  // Low third-person chase camera. The camera stays only a few meters above
  // the road and sits directly behind the vehicle instead of looking down from above.
  const orbitHeading = vehicle.heading + cameraLookX * Cesium.Math.toRadians(68);
  const chaseDistance = 6.8 + Math.min(vehicle.speed * 0.055, 2.7);
  const chaseX = worldPosition.x - Math.sin(orbitHeading) * chaseDistance;
  const chaseY = worldPosition.y - Math.cos(orbitHeading) * chaseDistance;

  const targetForward = offsetFromVehicle(6.5, 0);

  aimCamera(
    {
      x: chaseX,
      y: chaseY,
      z: carCenter + 2.0 + Math.min(vehicle.speed * 0.018, 0.8)
    },
    {
      x: targetForward.x,
      y: targetForward.y,
      z: carCenter + 0.20 - cameraLookY * 4.5
    }
  );
}

function updateCamera() {
  if (!viewer || !vehicle) return;
  setCamera();
}

function changeCamera() {
  cameraModeIndex = (cameraModeIndex + 1) % CAMERA_MODES.length;
  setCamera();
}

function updateHUD(dt) {
  const t = vehicle.telemetry;
  const p = vehicle.powertrain;
  const surface = vehicle.currentSurface || course.surfaceAt(worldPosition.x, worldPosition.y);
  const displayGear = p.reverse ? 'R' : (Math.abs(vehicle.vx) < 0.15 ? 'N' : String(p.gear));

  ui.speed.textContent = String(Math.round(vehicle.speed * MPH_PER_MPS));
  ui.gear.textContent = displayGear;
  ui.rpm.textContent = Math.round(p.engineRPM / 50) * 50 + ' RPM';
  ui.section.textContent = surface.sectionLabel.toUpperCase();
  ui.progress.textContent =
    (surface.courseDistance / 1000).toFixed(1) + ' / ' +
    (course.totalLength / 1000).toFixed(1) + ' KM';
  ui.gLong.textContent = (t.longitudinalG >= 0 ? '+' : '') + t.longitudinalG.toFixed(2) + 'g LONG';
  ui.gLat.textContent = (t.lateralG >= 0 ? '+' : '') + t.lateralG.toFixed(2) + 'g LAT';
  ui.slip.textContent = Math.round(t.maxSlipRatio * 100) + '% WHEEL SLIP';
  ui.grip.textContent = surface.name + ' • ' + Math.round(surface.grip * 100) + '% μ';
  ui.drive.textContent = GravelRushVehicleConfig.powertrain.drivetrain + ' • ABS • TCS';

  if (surface.offTrack) {
    setWorldStatus('OFF TRACK', 0.15);
  } else if (statusTimer <= 0) {
    ui.worldStatus.textContent = 'ENDURANCE COURSE';
  }

  if (ui.controllerStatus) {
    if (lastControllerInput && lastControllerInput.connected) {
      ui.controllerStatus.textContent =
        'CONTROLLER CONNECTED' +
        (lastControllerInput.hapticsAvailable ? ' • HAPTICS' : '');
    } else {
      ui.controllerStatus.textContent = 'CONTROLLER: NOT CONNECTED';
    }
  }

  if (statusTimer > 0) {
    statusTimer -= dt;
    if (statusTimer <= 0) ui.worldStatus.textContent = 'ENDURANCE COURSE';
  }
}

function frame(now) {
  if (!running || !viewer || viewer.isDestroyed() || !vehicle) return;

  const dt = Math.min((now - lastFrame) / 1000, 0.033);
  lastFrame = now;

  const inputs = readInput();
  updateControllerActions(inputs.controller, dt);

  const targetSubstep = 1 / 120;
  const substeps = Math.max(1, Math.ceil(dt / targetSubstep));
  const subDt = dt / substeps;

  for (let i = 0; i < substeps; i++) {
    updateWheelGround();
    GravelRushPhysics.step(vehicle, inputs, subDt);
    integrateWorldPosition(subDt);
  }

  updateWheelGround();
  updateCarEntity();
  updateCamera();
  updateHUD(dt);

  if (window.GravelRushGamepad) {
    GravelRushGamepad.updateVehicleHaptics(vehicle, inputs, now);
  }

  requestAnimationFrame(frame);
}

ui.startButton.addEventListener('click', () => {
  if (!viewer) initializeWorld();
  ui.startCard.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  ui.help.classList.remove('hidden');
  ui.touch.classList.remove('hidden');
  running = true;
  lastFrame = performance.now();
  requestAnimationFrame(frame);
});

ui.camera.addEventListener('click', changeCamera);
ui.reset.addEventListener('click', resetCar);

window.addEventListener('keydown', event => {
  keys.add(event.code);

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
    event.preventDefault();
  }

  if (event.code === 'KeyR' && !event.repeat) resetCar();
  if (event.code === 'KeyC' && !event.repeat) changeCamera();
});

window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());

document.querySelectorAll('[data-control]').forEach(button => {
  const control = button.dataset.control;

  const press = event => {
    event.preventDefault();
    touch.add(control);
    button.classList.add('active');
    if (button.setPointerCapture && event.pointerId !== undefined) {
      button.setPointerCapture(event.pointerId);
    }
  };

  const release = event => {
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
