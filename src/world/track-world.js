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
let carEntities = [];
let cockpitEntities = [];
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

function stripVertex(sample, halfWidth, side, raise = 0) {
  const nx = -sample.ty;
  const ny = sample.tx;
  const x = sample.x + nx * halfWidth * side;
  const y = sample.y + ny * halfWidth * side;
  return localToCartesian(x, y, course.heightAt(x, y) + raise);
}

function buildContinuousStrip(widthForSample, materialColor, raise = 0) {
  const samples = course.samples;
  const points = [];
  const positions = new Float64Array(samples.length * 2 * 3);
  const indices = new Uint16Array(samples.length * 6);

  for (let i = 0; i < samples.length; i++) {
    const width = typeof widthForSample === 'function'
      ? widthForSample(samples[i], i)
      : widthForSample;
    const half = width * 0.5;
    const left = stripVertex(samples[i], half, 1, raise);
    const right = stripVertex(samples[i], half, -1, raise);
    points.push(left, right);

    const base = i * 6;
    positions[base] = left.x;
    positions[base + 1] = left.y;
    positions[base + 2] = left.z;
    positions[base + 3] = right.x;
    positions[base + 4] = right.y;
    positions[base + 5] = right.z;
  }

  for (let i = 0; i < samples.length; i++) {
    const next = (i + 1) % samples.length;
    const aL = i * 2;
    const aR = aL + 1;
    const bL = next * 2;
    const bR = bL + 1;
    const base = i * 6;

    indices[base] = aL;
    indices[base + 1] = bL;
    indices[base + 2] = bR;
    indices[base + 3] = aL;
    indices[base + 4] = bR;
    indices[base + 5] = aR;
  }

  const geometry = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positions
      })
    },
    indices,
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromPoints(points)
  });

  viewer.scene.primitives.add(new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry,
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(color(materialColor))
      }
    }),
    appearance: new Cesium.PerInstanceColorAppearance({
      flat: true,
      translucent: false,
      closed: false
    }),
    asynchronous: false
  }));
}

function buildRoadSurface(surfaceKey) {
  const samples = course.samples;
  const positions = [];
  const indices = [];
  const points = [];
  let vertexBase = 0;

  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    if (a.surfaceKey !== surfaceKey) continue;

    const nextIndex = (i + 1) % samples.length;
    const b = samples[nextIndex];
    const aSurface = course.SURFACES[a.surfaceKey];
    const bSurface = course.SURFACES[b.surfaceKey];

    const aLeft = stripVertex(a, aSurface.width * 0.5, 1, 0.075);
    const aRight = stripVertex(a, aSurface.width * 0.5, -1, 0.075);
    const bLeft = stripVertex(b, bSurface.width * 0.5, 1, 0.075);
    const bRight = stripVertex(b, bSurface.width * 0.5, -1, 0.075);

    const quad = [aLeft, bLeft, bRight, aRight];
    for (const p of quad) {
      positions.push(p.x, p.y, p.z);
      points.push(p);
    }

    indices.push(
      vertexBase, vertexBase + 1, vertexBase + 2,
      vertexBase, vertexBase + 2, vertexBase + 3
    );
    vertexBase += 4;
  }

  if (!positions.length) return;

  const geometry = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: new Float64Array(positions)
      })
    },
    indices: new Uint16Array(indices),
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromPoints(points)
  });

  viewer.scene.primitives.add(new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry,
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(
          color(course.SURFACES[surfaceKey].color)
        )
      }
    }),
    appearance: new Cesium.PerInstanceColorAppearance({
      flat: true,
      translucent: false,
      closed: false
    }),
    asynchronous: false
  }));
}

function buildCourseVisuals() {
  const samples = course.samples;

  // One shared-vertex terrain ribbon for the whole loop eliminates seams and
  // floating wedges between individual road segments.
  buildContinuousStrip(720, '#6e6048', -0.28);
  buildContinuousStrip(
    sample => course.SURFACES[sample.surfaceKey].width + 18,
    '#786a52',
    0.015
  );

  for (const surfaceKey of Object.keys(course.SURFACES)) {
    buildRoadSurface(surfaceKey);
  }

  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % samples.length];

    if ((a.surfaceKey === 'ASPHALT' || a.surfaceKey === 'MOUNTAIN') && i % 2 === 0) {
      viewer.entities.add({
        polyline: {
          positions: [
            localToCartesian(a.x, a.y, course.heightAt(a.x, a.y) + 0.13),
            localToCartesian(b.x, b.y, course.heightAt(b.x, b.y) + 0.13)
          ],
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

  viewer.scene.globe.show = true;
  viewer.scene.globe.baseColor = color('#6e6048');
  viewer.scene.globe.enableLighting = false;
  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.backgroundColor = color('#86a9bd');
  viewer.scene.fog.enabled = true;
  viewer.scene.fog.density = 0.00018;
  viewer.scene.fog.minimumBrightness = 0.22;

  vehicle = createVehicleState();

if (new URLSearchParams(window.location.search).get('autostart') === '1') {
  setTimeout(() => ui.startButton.click(), 0);
}
  buildCourseVisuals();

  buildCarModel();
  buildCockpit();
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

  updateCarEntity();
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

function vehiclePartPosition(forward, right, heightAboveGround) {
  const p = offsetFromVehicle(forward, right);
  return localToCartesian(p.x, p.y, vehicle.groundHeight + heightAboveGround);
}

function addCarBox(name, forward, right, height, dimensions, material) {
  const position = vehiclePartPosition(forward, right, height);
  const entity = viewer.entities.add({
    name,
    position,
    orientation: vehicleOrientation(position),
    box: {
      dimensions: new Cesium.Cartesian3(...dimensions),
      material: color(material),
      outline: false
    }
  });
  carEntities.push({ entity, kind: 'box', forward, right, height });
}

function addCarWheel(name, forward, right) {
  const position = vehiclePartPosition(forward, right, 0.38);
  const tire = viewer.entities.add({
    name,
    position,
    orientation: vehicleOrientation(position),
    ellipsoid: {
      radii: new Cesium.Cartesian3(0.20, 0.37, 0.37),
      material: color('#111214')
    }
  });
  carEntities.push({ entity: tire, kind: 'wheel', forward, right, height: 0.38 });

  const rimPosition = vehiclePartPosition(forward, right, 0.38);
  const rim = viewer.entities.add({
    name: name + ' rim',
    position: rimPosition,
    orientation: vehicleOrientation(rimPosition),
    ellipsoid: {
      radii: new Cesium.Cartesian3(0.205, 0.19, 0.19),
      material: color('#c7ccd1')
    }
  });
  carEntities.push({ entity: rim, kind: 'wheel', forward, right, height: 0.38 });
}

function buildCarModel() {
  carEntities = [];

  const body = '#e39b28';
  const bodyDark = '#c57816';
  const glass = '#25323a';
  const trim = '#17191c';

  addCarBox('GRX chassis', 0.00, 0.00, 0.50, [1.88, 4.18, 0.44], body);
  addCarBox('GRX lower aero', 0.00, 0.00, 0.28, [1.76, 3.86, 0.18], trim);
  addCarBox('GRX hood', 1.23, 0.00, 0.78, [1.74, 1.38, 0.24], bodyDark);
  addCarBox('GRX cabin glass', -0.22, 0.00, 1.06, [1.56, 1.72, 0.50], glass);
  addCarBox('GRX roof', -0.26, 0.00, 1.39, [1.48, 1.34, 0.14], body);
  addCarBox('GRX front bumper', 2.08, 0.00, 0.43, [1.92, 0.26, 0.24], trim);
  addCarBox('GRX rear bumper', -2.08, 0.00, 0.44, [1.92, 0.28, 0.25], trim);
  addCarBox('GRX left skirt', 0.00, -0.92, 0.34, [0.11, 3.55, 0.18], trim);
  addCarBox('GRX right skirt', 0.00, 0.92, 0.34, [0.11, 3.55, 0.18], trim);
  addCarBox('GRX spoiler blade', -1.82, 0.00, 1.36, [1.70, 0.18, 0.12], trim);
  addCarBox('GRX spoiler left', -1.69, -0.60, 1.18, [0.10, 0.12, 0.38], trim);
  addCarBox('GRX spoiler right', -1.69, 0.60, 1.18, [0.10, 0.12, 0.38], trim);
  addCarBox('GRX left headlight', 2.12, -0.53, 0.66, [0.46, 0.08, 0.13], '#f4f1d4');
  addCarBox('GRX right headlight', 2.12, 0.53, 0.66, [0.46, 0.08, 0.13], '#f4f1d4');
  addCarBox('GRX left taillight', -2.13, -0.55, 0.66, [0.43, 0.08, 0.13], '#b52c26');
  addCarBox('GRX right taillight', -2.13, 0.55, 0.66, [0.43, 0.08, 0.13], '#b52c26');

  for (const forward of [-1.32, 1.32]) {
    addCarWheel('GRX wheel', forward, -0.96);
    addCarWheel('GRX wheel', forward, 0.96);
  }
}

function updateCarModel() {
  for (const part of carEntities) {
    const position = vehiclePartPosition(part.forward, part.right, part.height);
    part.entity.position = position;
    part.entity.orientation = vehicleOrientation(position);
  }
}

function cockpitPartPosition(forward, right, heightAboveGround) {
  return vehiclePartPosition(forward, right, heightAboveGround);
}

function buildCockpit() {
  cockpitEntities = [];

  const parts = [
    {
      name: 'Dashboard',
      forward: 0.88,
      right: 0,
      height: 0.84,
      dimensions: [1.72, 0.34, 0.24],
      material: '#17191c'
    },
    {
      name: 'Instrument hood',
      forward: 0.63,
      right: -0.36,
      height: 1.02,
      dimensions: [0.58, 0.22, 0.18],
      material: '#0e1012'
    },
    {
      name: 'Steering wheel',
      forward: 0.48,
      right: -0.38,
      height: 1.04,
      dimensions: [0.42, 0.08, 0.42],
      material: '#090a0b'
    },
    {
      name: 'Left windshield pillar',
      forward: 1.00,
      right: -0.82,
      height: 1.27,
      dimensions: [0.10, 0.12, 0.64],
      material: '#191b1e'
    },
    {
      name: 'Right windshield pillar',
      forward: 1.00,
      right: 0.82,
      height: 1.27,
      dimensions: [0.10, 0.12, 0.64],
      material: '#191b1e'
    },
    {
      name: 'Windshield header',
      forward: 0.98,
      right: 0,
      height: 1.56,
      dimensions: [1.72, 0.13, 0.12],
      material: '#191b1e'
    },
    {
      name: 'Left door top',
      forward: 0.05,
      right: -0.88,
      height: 1.03,
      dimensions: [0.10, 1.40, 0.16],
      material: '#202328'
    },
    {
      name: 'Right door top',
      forward: 0.05,
      right: 0.88,
      height: 1.03,
      dimensions: [0.10, 1.40, 0.16],
      material: '#202328'
    }
  ];

  for (const part of parts) {
    const position = cockpitPartPosition(part.forward, part.right, part.height);
    const entity = viewer.entities.add({
      name: part.name,
      position,
      orientation: vehicleOrientation(position),
      show: false,
      box: {
        dimensions: new Cesium.Cartesian3(...part.dimensions),
        material: color(part.material),
        outline: false
      }
    });

    cockpitEntities.push({ ...part, entity });
  }
}

function updateCockpitEntities() {
  if (!vehicle) return;

  for (const part of cockpitEntities) {
    const position = cockpitPartPosition(part.forward, part.right, part.height);
    part.entity.position = position;
    part.entity.orientation = vehicleOrientation(position);
  }
}

function updateCarEntity() {
  if (!vehicle) return;
  updateCarModel();
  updateCockpitEntities();
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

function aimCamera(cameraLocal, targetLocal, cameraRoll = 0) {
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

  let up = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );

  if (Math.abs(cameraRoll) > 1e-5) {
    const rolledUp = Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(up, Math.cos(cameraRoll), new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(right, Math.sin(cameraRoll), new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    up = Cesium.Cartesian3.normalize(rolledUp, rolledUp);
  }

  viewer.camera.setView({
    destination: cameraPosition,
    orientation: { direction, up }
  });
}

function setCamera() {
  if (!viewer || !vehicle) return;

  const mode = CAMERA_MODES[cameraModeIndex];
  ui.camera.textContent = mode;

  const firstPerson = mode === 'FIRST PERSON';

  for (const part of carEntities) {
    part.entity.show = !firstPerson;
  }

  for (const part of cockpitEntities) {
    part.entity.show = firstPerson;
  }

  const carGround = vehicle.groundHeight;
  const carCenter = vehicleAltitude();

  if (firstPerson) {
    // Left-hand-drive cockpit viewpoint: eye position is inside the cabin,
    // behind the dashboard and slightly left of vehicle centerline.
    const viewHeading = vehicle.heading + cameraLookX * Cesium.Math.toRadians(78);
    const cameraOffset = offsetFromVehicle(0.10, -0.38);
    const lookDistance = 36;
    const targetX = cameraOffset.x + Math.sin(viewHeading) * lookDistance;
    const targetY = cameraOffset.y + Math.cos(viewHeading) * lookDistance;
    const chassisPitchRise = Math.tan(vehicle.pitch) * lookDistance;

    aimCamera(
      {
        x: cameraOffset.x,
        y: cameraOffset.y,
        z: carGround + 1.20
      },
      {
        x: targetX,
        y: targetY,
        z: carGround + 1.20 + chassisPitchRise - cameraLookY * 8.0
      },
      vehicle.roll
    );
    return;
  }

  // Third person now targets the vehicle itself so the car stays visible,
  // rather than aiming several meters ahead and pushing it below the viewport.
  const orbitHeading = vehicle.heading + cameraLookX * Cesium.Math.toRadians(64);
  const chaseDistance = 5.6 + Math.min(vehicle.speed * 0.045, 2.2);
  const chaseX = worldPosition.x - Math.sin(orbitHeading) * chaseDistance;
  const chaseY = worldPosition.y - Math.cos(orbitHeading) * chaseDistance;
  const chaseGround = course.heightAt(chaseX, chaseY);

  aimCamera(
    {
      x: chaseX,
      y: chaseY,
      z: Math.max(chaseGround + 1.85, carCenter + 1.35)
    },
    {
      x: worldPosition.x,
      y: worldPosition.y,
      z: carCenter + 0.12 - cameraLookY * 3.2
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
