'use strict';

window.GravelRushCourse = (() => {
  const ORIGIN = {
    latitude: 34.25,
    longitude: -112.10,
    height: 420
  };

  const SURFACES = {
    ASPHALT: {
      name: 'ASPHALT',
      grip: 1.00,
      rolling: 1.00,
      width: 16,
      roughness: 0.015,
      bank: 0.015,
      color: '#44484f',
      terrainColor: '#69543a'
    },
    GRAVEL: {
      name: 'GRAVEL',
      grip: 0.76,
      rolling: 1.30,
      width: 18,
      roughness: 0.09,
      bank: 0.010,
      color: '#9a8e75',
      terrainColor: '#75664c'
    },
    DIRT: {
      name: 'LOOSE DIRT',
      grip: 0.68,
      rolling: 1.45,
      width: 18,
      roughness: 0.14,
      bank: 0.008,
      color: '#8a5b35',
      terrainColor: '#62432c'
    },
    MUD: {
      name: 'MUD',
      grip: 0.50,
      rolling: 2.10,
      width: 20,
      roughness: 0.18,
      bank: 0.004,
      color: '#4b382d',
      terrainColor: '#3d352e'
    },
    SAND: {
      name: 'DEEP SAND',
      grip: 0.58,
      rolling: 2.35,
      width: 22,
      roughness: 0.11,
      bank: 0.006,
      color: '#c7a86b',
      terrainColor: '#b88f52'
    },
    ROCK: {
      name: 'ROCKY TRAIL',
      grip: 0.79,
      rolling: 1.65,
      width: 15,
      roughness: 0.30,
      bank: 0.010,
      color: '#696765',
      terrainColor: '#565352'
    },
    SNOW: {
      name: 'PACKED SNOW',
      grip: 0.46,
      rolling: 1.55,
      width: 18,
      roughness: 0.06,
      bank: 0.010,
      color: '#e4e8eb',
      terrainColor: '#cfd7dd'
    },
    ICE: {
      name: 'ICE',
      grip: 0.23,
      rolling: 0.75,
      width: 19,
      roughness: 0.005,
      bank: 0.004,
      color: '#a8d3df',
      terrainColor: '#d5e7ed'
    },
    MOUNTAIN: {
      name: 'MOUNTAIN TARMAC',
      grip: 0.96,
      rolling: 1.05,
      width: 13,
      roughness: 0.025,
      bank: 0.075,
      color: '#37393e',
      terrainColor: '#4d4b46'
    },
    ROUGH: {
      name: 'ROUGH RALLY',
      grip: 0.70,
      rolling: 1.55,
      width: 17,
      roughness: 0.22,
      bank: 0.018,
      color: '#765d45',
      terrainColor: '#5a4737'
    }
  };

  // Roughly 38 km before spline smoothing. The route deliberately doubles back
  // and changes elevation instead of being a simple oval.
  const CONTROL_POINTS = [
    [0, 0, 0],
    [1200, -300, 20],
    [2600, -100, 60],
    [4200, 600, 130],
    [5200, 1800, 230],
    [4800, 3300, 320],
    [3600, 4300, 420],
    [1800, 4700, 360],
    [200, 4200, 240],
    [-1400, 3500, 170],
    [-2800, 2400, 100],
    [-3600, 700, 45],
    [-3300, -1200, 20],
    [-2200, -2600, 10],
    [-800, -3200, 0],
    [900, -3000, 15],
    [2500, -2500, 30],
    [3700, -1700, 80],
    [3000, -600, 150],
    [1500, -900, 110],
    [400, -1500, 60],
    [-900, -1300, 40],
    [-1800, -500, 30],
    [-1200, 500, 50],
    [-300, 900, 30]
  ].map(([x, y, z]) => ({ x, y, z: ORIGIN.height + z }));

  const SECTION_BANDS = [
    [0.00, 0.10, 'ASPHALT', 'High-speed asphalt'],
    [0.10, 0.22, 'GRAVEL', 'Fast gravel'],
    [0.22, 0.33, 'DIRT', 'Loose dirt switchbacks'],
    [0.33, 0.42, 'MUD', 'Mud basin'],
    [0.42, 0.53, 'SAND', 'Deep sand dunes'],
    [0.53, 0.63, 'ROCK', 'Rock crawl ridge'],
    [0.63, 0.72, 'SNOW', 'Snow climb'],
    [0.72, 0.79, 'ICE', 'Frozen lake'],
    [0.79, 0.91, 'MOUNTAIN', 'Banked mountain descent'],
    [0.91, 1.00, 'ROUGH', 'Rough rally and jumps']
  ];

  function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;

    function component(a, b, c, d) {
      return 0.5 * (
        2 * b +
        (-a + c) * t +
        (2 * a - 5 * b + 4 * c - d) * t2 +
        (-a + 3 * b - 3 * c + d) * t3
      );
    }

    return {
      x: component(p0.x, p1.x, p2.x, p3.x),
      y: component(p0.y, p1.y, p2.y, p3.y),
      z: component(p0.z, p1.z, p2.z, p3.z)
    };
  }

  function sectionForProgress(progress) {
    const p = ((progress % 1) + 1) % 1;
    for (const [start, end, key, label] of SECTION_BANDS) {
      if (p >= start && p < end) {
        return { key, label, surface: SURFACES[key] };
      }
    }
    return { key: 'ASPHALT', label: 'Start / finish', surface: SURFACES.ASPHALT };
  }

  function buildSamples(perControl = 10) {
    const result = [];
    const n = CONTROL_POINTS.length;

    for (let i = 0; i < n; i++) {
      const p0 = CONTROL_POINTS[(i - 1 + n) % n];
      const p1 = CONTROL_POINTS[i];
      const p2 = CONTROL_POINTS[(i + 1) % n];
      const p3 = CONTROL_POINTS[(i + 2) % n];

      for (let j = 0; j < perControl; j++) {
        result.push(catmullRom(p0, p1, p2, p3, j / perControl));
      }
    }

    let total = 0;
    for (let i = 0; i < result.length; i++) {
      const next = result[(i + 1) % result.length];
      const dx = next.x - result[i].x;
      const dy = next.y - result[i].y;
      const segmentLength = Math.hypot(dx, dy);
      result[i].segmentLength = segmentLength;
      result[i].distance = total;
      total += segmentLength;
    }

    for (let i = 0; i < result.length; i++) {
      const prev = result[(i - 1 + result.length) % result.length];
      const next = result[(i + 1) % result.length];
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;

      result[i].tx = tx / len;
      result[i].ty = ty / len;
      result[i].progress = result[i].distance / total;

      const section = sectionForProgress(result[i].progress);
      result[i].surfaceKey = section.key;
      result[i].sectionLabel = section.label;
      result[i].width = section.surface.width;

      const a = result[(i - 2 + result.length) % result.length];
      const b = result[(i + 2) % result.length];
      const inX = result[i].x - a.x;
      const inY = result[i].y - a.y;
      const outX = b.x - result[i].x;
      const outY = b.y - result[i].y;
      const cross = inX * outY - inY * outX;
      result[i].turnSign = Math.sign(cross);
    }

    return { samples: result, totalLength: total };
  }

  const built = buildSamples();
  const samples = built.samples;
  const totalLength = built.totalLength;

  function nearestPoint(x, y) {
    let best = null;

    for (let i = 0; i < samples.length; i++) {
      const a = samples[i];
      const b = samples[(i + 1) % samples.length];
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const len2 = vx * vx + vy * vy || 1;
      const wx = x - a.x;
      const wy = y - a.y;
      const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
      const px = a.x + vx * t;
      const py = a.y + vy * t;
      const dx = x - px;
      const dy = y - py;
      const distance2 = dx * dx + dy * dy;

      if (!best || distance2 < best.distance2) {
        const segmentLength = Math.sqrt(len2);
        const nx = -vy / segmentLength;
        const ny = vx / segmentLength;
        const lateral = dx * nx + dy * ny;
        const z = a.z + (b.z - a.z) * t;
        const courseDistance = a.distance + segmentLength * t;
        const progress = courseDistance / totalLength;
        const section = sectionForProgress(progress);

        best = {
          index: i,
          t,
          x: px,
          y: py,
          z,
          distance2,
          distanceFromCenter: Math.sqrt(distance2),
          lateral,
          tangentX: vx / segmentLength,
          tangentY: vy / segmentLength,
          courseDistance,
          progress,
          section,
          turnSign: a.turnSign || 0
        };
      }
    }

    return best;
  }

  const JUMPS = [
    { progress: 0.928, halfWidth: 38, amplitude: 1.25 },
    { progress: 0.950, halfWidth: 44, amplitude: 1.70 },
    { progress: 0.974, halfWidth: 32, amplitude: 1.05 }
  ];

  function jumpHeight(courseDistance) {
    let height = 0;

    for (const jump of JUMPS) {
      const center = jump.progress * totalLength;
      let delta = Math.abs(courseDistance - center);
      delta = Math.min(delta, totalLength - delta);

      if (delta < jump.halfWidth) {
        const phase = 1 - delta / jump.halfWidth;
        height += jump.amplitude * Math.sin(phase * Math.PI * 0.5) ** 2;
      }
    }

    return height;
  }

  function roughnessHeight(surface, x, y, offTrackScale = 1) {
    const wave =
      Math.sin(x * 0.061) * 0.45 +
      Math.sin(y * 0.083 + 1.7) * 0.35 +
      Math.sin((x + y) * 0.031) * 0.20;

    return wave * surface.roughness * offTrackScale;
  }

  function heightAt(x, y) {
    const near = nearestPoint(x, y);
    const surface = near.section.surface;
    const onTrack = near.distanceFromCenter <= surface.width * 0.58;

    const bankAngle = surface.bank * near.turnSign;
    const bankHeight = near.lateral * Math.tan(bankAngle);
    const rough = roughnessHeight(surface, x, y, onTrack ? 1 : 3.5);
    const jump = onTrack ? jumpHeight(near.courseDistance) : 0;

    return near.z + bankHeight + rough + jump;
  }

  function surfaceAt(x, y) {
    const near = nearestPoint(x, y);
    const base = near.section.surface;
    const halfWidth = base.width * 0.5;

    if (near.distanceFromCenter <= halfWidth) {
      return {
        ...base,
        key: near.section.key,
        sectionLabel: near.section.label,
        offTrack: false,
        distanceFromTrack: near.distanceFromCenter,
        progress: near.progress,
        courseDistance: near.courseDistance
      };
    }

    const far = near.distanceFromCenter > halfWidth + 35;
    return {
      ...base,
      key: 'OFFTRACK_' + near.section.key,
      name: far ? 'OFF-TRACK TERRAIN' : base.name + ' SHOULDER',
      grip: base.grip * (far ? 0.58 : 0.74),
      rolling: base.rolling * (far ? 2.1 : 1.55),
      sectionLabel: near.section.label,
      offTrack: true,
      distanceFromTrack: near.distanceFromCenter,
      progress: near.progress,
      courseDistance: near.courseDistance
    };
  }

  function spawn() {
    const a = samples[0];
    const b = samples[1];
    return {
      x: a.x,
      y: a.y,
      z: heightAt(a.x, a.y),
      heading: Math.atan2(b.x - a.x, b.y - a.y)
    };
  }

  return {
    ORIGIN,
    SURFACES,
    SECTION_BANDS,
    samples,
    totalLength,
    nearestPoint,
    heightAt,
    surfaceAt,
    sectionForProgress,
    spawn
  };
})();
