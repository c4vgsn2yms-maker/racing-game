'use strict';

window.GravelRushMath = (() => {
  const G = 9.80665;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const moveToward = (current, target, maxDelta) => {
    if (Math.abs(target - current) <= maxDelta) return target;
    return current + Math.sign(target - current) * maxDelta;
  };

  const smoothStep = (edge0, edge1, x) => {
    const t = clamp((x - edge0) / Math.max(edge1 - edge0, 1e-9), 0, 1);
    return t * t * (3 - 2 * t);
  };

  const interpCurve = (points, x) => {
    if (!points.length) return 0;
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (x <= points[i][0]) {
        const [x0, y0] = points[i - 1];
        const [x1, y1] = points[i];
        return lerp(y0, y1, (x - x0) / Math.max(x1 - x0, 1e-9));
      }
    }
    return points[points.length - 1][1];
  };

  const signedSquare = value => value * Math.abs(value);

  return { G, clamp, lerp, moveToward, smoothStep, interpCurve, signedSquare };
})();
