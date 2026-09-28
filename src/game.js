'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ui = {
  speed: document.getElementById('speed'),
  surface: document.getElementById('surface'),
  lap: document.getElementById('lap'),
  timer: document.getElementById('timer'),
  best: document.getElementById('best'),
  reset: document.getElementById('reset'),
  start: document.getElementById('start'),
  startCard: document.getElementById('start-card')
};

const TAU = Math.PI * 2;
const ROAD_HALF_WIDTH = 92;
const LAPS_TO_WIN = 3;
const SCALE_METERS_PER_WORLD_UNIT = 0.32;

const centerline = [];
const SEGMENTS = 260;

for (let i = 0; i < SEGMENTS; i++) {
  const t = (i / SEGMENTS) * TAU;
  centerline.push({
    x: Math.cos(t) * 530 + Math.sin(t * 2) * 90,
    y: Math.sin(t) * 355 + Math.cos(t * 3) * 35
  });
}

const input = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false
};

const keys = new Set();
const touch = new Set();

function wrapIndex(i) {
  return (i + SEGMENTS) % SEGMENTS;
}

function pointSegmentDistanceSq(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const denom = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom));
  const x = ax + abx * t;
  const y = ay + aby * t;
  const dx = px - x;
  const dy = py - y;
  return { d2: dx * dx + dy * dy, t, x, y };
}

function nearestTrackPoint(x, y) {
  let best = { d2: Infinity, index: 0, t: 0, x: 0, y: 0 };

  for (let i = 0; i < SEGMENTS; i++) {
    const a = centerline[i];
    const b = centerline[wrapIndex(i + 1)];
    const hit = pointSegmentDistanceSq(x, y, a.x, a.y, b.x, b.y);
    if (hit.d2 < best.d2) {
      best = { ...hit, index: i };
    }
  }

  best.progress = (best.index + best.t) / SEGMENTS;
  best.distance = Math.sqrt(best.d2);
  return best;
}

function tangentAt(index) {
  const a = centerline[wrapIndex(index - 1)];
  const b = centerline[wrapIndex(index + 1)];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len, angle: Math.atan2(dy, dx) };
}

function createCar(color, isAI = false) {
  const p = centerline[0];
  const tangent = tangentAt(0);
  return {
    x: p.x - tangent.y * (isAI ? 24 : -24),
    y: p.y + tangent.x * (isAI ? 24 : -24),
    angle: tangent.angle,
    vx: 0,
    vy: 0,
    speed: 0,
    steerVisual: 0,
    color,
    isAI,
    trackIndex: 0,
    lap: 1,
    progress: 0,
    lastProgress: 0,
    finished: false
  };
}

const player = createCar('#f2b84b', false);
const rival = createCar('#76b7ff', true);

const race = {
  running: false,
  startedAt: 0,
  lapStartedAt: 0,
  elapsed: 0,
  bestLap: null,
  finishedAt: null
};

const camera = {
  x: player.x,
  y: player.y,
  zoom: 1
};

function resetCar(car = player) {
  const nearest = nearestTrackPoint(car.x, car.y);
  const p = centerline[nearest.index];
  const tangent = tangentAt(nearest.index);
  car.x = p.x;
  car.y = p.y;
  car.angle = tangent.angle;
  car.vx = 0;
  car.vy = 0;
  car.speed = 0;
}

function resetRace() {
  Object.assign(player, createCar('#f2b84b', false));
  Object.assign(rival, createCar('#76b7ff', true));
  race.startedAt = performance.now();
  race.lapStartedAt = race.startedAt;
  race.elapsed = 0;
  race.bestLap = null;
  race.finishedAt = null;
  race.running = true;
}

function startRace() {
  resetRace();
  ui.startCard.classList.add('hidden');
}

function readInputs() {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = Array.from(gamepads).find(Boolean);

  const keyThrottle = keys.has('ArrowUp') || keys.has('KeyW');
  const keyBrake = keys.has('ArrowDown') || keys.has('KeyS');
  const keyLeft = keys.has('ArrowLeft') || keys.has('KeyA');
  const keyRight = keys.has('ArrowRight') || keys.has('KeyD');

  let padThrottle = 0;
  let padBrake = 0;
  let padSteer = 0;
  let padHandbrake = false;

  if (gp) {
    padSteer = Math.abs(gp.axes[0] || 0) > 0.12 ? gp.axes[0] : 0;
    padBrake = gp.buttons[6] ? gp.buttons[6].value : 0;
    padThrottle = gp.buttons[7] ? gp.buttons[7].value : 0;
    padHandbrake = Boolean(gp.buttons[0] && gp.buttons[0].pressed);
  }

  input.throttle = Math.max(keyThrottle ? 1 : 0, touch.has('throttle') ? 1 : 0, padThrottle);
  input.brake = Math.max(keyBrake ? 1 : 0, touch.has('brake') ? 1 : 0, padBrake);
  input.steer = Math.max(-1, Math.min(1,
    (keyRight || touch.has('right') ? 1 : 0) -
    (keyLeft || touch.has('left') ? 1 : 0) +
    padSteer
  ));
  input.handbrake = keys.has('Space') || touch.has('handbrake') || padHandbrake;
}

function updatePlayer(dt) {
  readInputs();

  const near = nearestTrackPoint(player.x, player.y);
  const onRoad = near.distance <= ROAD_HALF_WIDTH;
  const forwardX = Math.cos(player.angle);
  const forwardY = Math.sin(player.angle);
  const longitudinal = player.vx * forwardX + player.vy * forwardY;
  const lateralX = player.vx - forwardX * longitudinal;
  const lateralY = player.vy - forwardY * longitudinal;

  const maxForward = onRoad ? 395 : 245;
  const maxReverse = 90;
  const engine = onRoad ? 285 : 185;
  const brakeForce = 360;

  let drive = 0;
  if (input.throttle > 0) {
    drive += engine * input.throttle;
  }

  if (input.brake > 0) {
    if (longitudinal > 12) drive -= brakeForce * input.brake;
    else drive -= engine * 0.52 * input.brake;
  }

  player.vx += forwardX * drive * dt;
  player.vy += forwardY * drive * dt;

  const rawSpeed = Math.hypot(player.vx, player.vy);
  const direction = longitudinal < 0 ? -1 : 1;
  const capped = Math.min(rawSpeed, direction > 0 ? maxForward : maxReverse);
  if (rawSpeed > 0.001 && rawSpeed > capped) {
    player.vx *= capped / rawSpeed;
    player.vy *= capped / rawSpeed;
  }

  const speedFactor = Math.min(Math.abs(longitudinal) / 130, 1);
  const steerStrength = onRoad ? 2.4 : 1.65;
  const reverseSign = longitudinal < -3 ? -1 : 1;
  player.angle += input.steer * steerStrength * (0.22 + speedFactor * 0.78) * reverseSign * dt;

  const grip = input.handbrake ? 1.9 : (onRoad ? 7.7 : 3.0);
  player.vx -= lateralX * Math.min(1, grip * dt);
  player.vy -= lateralY * Math.min(1, grip * dt);

  const rolling = onRoad ? 0.72 : 1.9;
  const drag = Math.max(0, 1 - rolling * dt);
  player.vx *= drag;
  player.vy *= drag;

  if (input.handbrake) {
    const hbDrag = Math.max(0, 1 - 0.75 * dt);
    player.vx *= hbDrag;
    player.vy *= hbDrag;
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.speed = longitudinal;
  player.steerVisual += (input.steer - player.steerVisual) * Math.min(1, dt * 10);

  updateLapState(player, near.progress);

  ui.surface.textContent = onRoad ? 'GRAVEL' : 'LOOSE DIRT';
}

function updateAI(dt) {
  if (rival.finished) return;

  const nearest = nearestTrackPoint(rival.x, rival.y);
  const lookAhead = 7 + Math.floor(Math.min(Math.abs(rival.speed) / 35, 8));
  const targetIndex = wrapIndex(nearest.index + lookAhead);
  const target = centerline[targetIndex];

  const desired = Math.atan2(target.y - rival.y, target.x - rival.x);
  let diff = desired - rival.angle;
  while (diff > Math.PI) diff -= TAU;
  while (diff < -Math.PI) diff += TAU;

  const steer = Math.max(-1, Math.min(1, diff * 1.8));
  rival.angle += steer * 2.15 * dt;

  const turnPenalty = Math.min(Math.abs(diff) / 1.2, 1);
  const targetSpeed = 305 - turnPenalty * 115;
  const fx = Math.cos(rival.angle);
  const fy = Math.sin(rival.angle);
  const longitudinal = rival.vx * fx + rival.vy * fy;

  if (longitudinal < targetSpeed) {
    rival.vx += fx * 225 * dt;
    rival.vy += fy * 225 * dt;
  } else {
    rival.vx *= Math.max(0, 1 - 1.2 * dt);
    rival.vy *= Math.max(0, 1 - 1.2 * dt);
  }

  const lateralX = rival.vx - fx * longitudinal;
  const lateralY = rival.vy - fy * longitudinal;
  rival.vx -= lateralX * Math.min(1, 7 * dt);
  rival.vy -= lateralY * Math.min(1, 7 * dt);

  rival.vx *= Math.max(0, 1 - .62 * dt);
  rival.vy *= Math.max(0, 1 - .62 * dt);
  rival.x += rival.vx * dt;
  rival.y += rival.vy * dt;
  rival.speed = longitudinal;

  updateLapState(rival, nearest.progress);
}

function updateLapState(car, progress) {
  const previous = car.progress;
  car.lastProgress = previous;
  car.progress = progress;

  const crossedStart = previous > 0.84 && progress < 0.16;
  if (crossedStart && car.speed > 20) {
    car.lap += 1;

    if (!car.isAI) {
      const now = performance.now();
      const lapTime = now - race.lapStartedAt;
      race.lapStartedAt = now;
      if (car.lap > 2 && (race.bestLap === null || lapTime < race.bestLap)) {
        race.bestLap = lapTime;
      }
    }

    if (car.lap > LAPS_TO_WIN) {
      car.finished = true;
      if (!car.isAI) {
        race.finishedAt = performance.now();
        race.running = false;
      }
    }
  }
}

function updateCamera(dt) {
  const speed = Math.hypot(player.vx, player.vy);
  const lead = Math.min(speed * .34, 92);
  const targetX = player.x + Math.cos(player.angle) * lead;
  const targetY = player.y + Math.sin(player.angle) * lead;
  const follow = 1 - Math.exp(-6 * dt);
  camera.x += (targetX - camera.x) * follow;
  camera.y += (targetY - camera.y) * follow;

  const targetZoom = Math.max(.72, 1.08 - speed / 900);
  camera.zoom += (targetZoom - camera.zoom) * (1 - Math.exp(-3 * dt));
}

function drawTrack() {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.strokeStyle = '#374224';
  ctx.lineWidth = ROAD_HALF_WIDTH * 2 + 34;
  traceCenterline();
  ctx.stroke();

  ctx.strokeStyle = '#8b7755';
  ctx.lineWidth = ROAD_HALF_WIDTH * 2;
  traceCenterline();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(237,222,184,.24)';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 18]);
  traceCenterline();
  ctx.stroke();
  ctx.setLineDash([]);

  drawStartLine();
}

function traceCenterline() {
  ctx.beginPath();
  ctx.moveTo(centerline[0].x, centerline[0].y);
  for (let i = 1; i < centerline.length; i++) {
    ctx.lineTo(centerline[i].x, centerline[i].y);
  }
  ctx.closePath();
}

function drawStartLine() {
  const p = centerline[0];
  const tangent = tangentAt(0);
  const nx = -tangent.y;
  const ny = tangent.x;
  const length = ROAD_HALF_WIDTH * 1.72;
  const blocks = 10;

  for (let i = 0; i < blocks; i++) {
    const t0 = -length / 2 + (length / blocks) * i;
    const t1 = -length / 2 + (length / blocks) * (i + 1);
    ctx.strokeStyle = i % 2 ? '#f1f1eb' : '#151719';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(p.x + nx * t0, p.y + ny * t0);
    ctx.lineTo(p.x + nx * t1, p.y + ny * t1);
    ctx.stroke();
  }
}

function drawScenery() {
  const spacing = 145;
  for (let gx = -850; gx <= 850; gx += spacing) {
    for (let gy = -650; gy <= 650; gy += spacing) {
      const jitterX = Math.sin(gx * .017 + gy) * 31;
      const jitterY = Math.cos(gy * .019 - gx) * 29;
      const x = gx + jitterX;
      const y = gy + jitterY;
      if (nearestTrackPoint(x, y).distance < ROAD_HALF_WIDTH + 65) continue;

      ctx.fillStyle = '#31411f';
      ctx.beginPath();
      ctx.arc(x, y, 14 + Math.abs(Math.sin(x)) * 9, 0, TAU);
      ctx.fill();

      ctx.fillStyle = '#43572a';
      ctx.beginPath();
      ctx.arc(x - 3, y - 5, 9, 0, TAU);
      ctx.fill();
    }
  }
}

function drawCar(car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.fillRect(-19, -11, 42, 26);

  ctx.fillStyle = car.color;
  roundRect(ctx, -21, -13, 42, 26, 7);
  ctx.fill();

  ctx.fillStyle = '#16191d';
  roundRect(ctx, -7, -10, 16, 20, 4);
  ctx.fill();

  ctx.fillStyle = '#eef5ff';
  ctx.fillRect(14, -9, 4, 6);
  ctx.fillRect(14, 3, 4, 6);

  ctx.fillStyle = '#c92828';
  ctx.fillRect(-19, -9, 3, 6);
  ctx.fillRect(-19, 3, 3, 6);

  ctx.restore();
}

function roundRect(context, x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + w, y, x + w, y + h, radius);
  context.arcTo(x + w, y + h, x, y + h, radius);
  context.arcTo(x, y + h, x, y, radius);
  context.arcTo(x, y, x + w, y, radius);
  context.closePath();
}

function render() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  const targetW = Math.floor(width * dpr);
  const targetH = Math.floor(height * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#667747';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  drawScenery();
  drawTrack();
  drawCar(rival);
  drawCar(player);

  ctx.restore();
}

function formatTime(ms) {
  if (!Number.isFinite(ms)) return '--:--.---';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);
  return String(minutes).padStart(2, '0') + ':' +
    String(seconds).padStart(2, '0') + '.' +
    String(millis).padStart(3, '0');
}

function updateHUD(now) {
  const mph = Math.max(0, Math.abs(player.speed) * SCALE_METERS_PER_WORLD_UNIT * 2.23694);
  ui.speed.textContent = Math.round(mph) + ' mph';

  if (player.finished) {
    ui.lap.textContent = 'FINISHED';
  } else {
    ui.lap.textContent = 'Lap ' + Math.min(player.lap, LAPS_TO_WIN) + ' / ' + LAPS_TO_WIN;
  }

  const activeTime = race.running ? now - race.lapStartedAt :
    (race.finishedAt ? race.finishedAt - race.lapStartedAt : 0);

  ui.timer.textContent = formatTime(activeTime);
  ui.best.textContent = 'Best ' + formatTime(race.bestLap);
}

let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.033);
  last = now;

  if (race.running) {
    updatePlayer(dt);
    updateAI(dt);
  }

  updateCamera(dt);
  updateHUD(now);
  render();
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code)) {
    event.preventDefault();
  }
  if (event.code === 'KeyR') resetCar(player);
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

ui.start.addEventListener('click', startRace);
ui.reset.addEventListener('click', () => resetCar(player));

requestAnimationFrame(frame);
