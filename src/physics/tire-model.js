'use strict';

window.GravelRushTires = (() => {
  const { clamp } = window.GravelRushMath;

  function frictionCoefficient(config, normalLoad) {
    const ratio = normalLoad / Math.max(config.nominalLoad, 1);
    const sensitivity = 1 - config.loadSensitivity * (ratio - 1);
    return config.muDry * clamp(sensitivity, 0.78, 1.16);
  }

  function combinedTireForce({
    config,
    normalLoad,
    longitudinalVelocity,
    lateralVelocity,
    wheelOmega,
    steerAngle
  }) {
    if (normalLoad <= 1) {
      return {
        fx: 0,
        fy: 0,
        slipRatio: 0,
        slipAngle: 0,
        mu: 0,
        saturation: 0
      };
    }

    const c = Math.cos(steerAngle);
    const s = Math.sin(steerAngle);

    const vx = c * longitudinalVelocity + s * lateralVelocity;
    const vy = -s * longitudinalVelocity + c * lateralVelocity;

    const referenceSpeed = Math.max(Math.abs(vx), 2.0);
    const treadSpeed = wheelOmega * config.radius;
    const slipRatio = clamp((treadSpeed - vx) / referenceSpeed, -2.5, 2.5);
    const slipAngle = clamp(Math.atan2(vy, Math.max(Math.abs(vx), 1.5)), -1.2, 1.2);

    const mu = frictionCoefficient(config, normalLoad);
    const frictionLimit = Math.max(mu * normalLoad, 1);

    // Brush-like linear region transitioning smoothly into the friction limit.
    let fx = config.longitudinalStiffness * slipRatio;
    let fy = -config.corneringStiffness * Math.tan(slipAngle);

    const normalized = Math.hypot(fx / frictionLimit, fy / frictionLimit);
    let saturation = normalized;

    if (normalized > 1) {
      const scale = 1 / normalized;
      fx *= scale;
      fy *= scale;
      saturation = 1;
    } else if (normalized > 0.72) {
      // Progressively soften the approach to the peak so breakaway is not a hard clamp.
      const blend = (normalized - 0.72) / 0.28;
      const softScale = 1 - 0.12 * blend * blend;
      fx *= softScale;
      fy *= softScale;
    }

    const bodyFx = c * fx - s * fy;
    const bodyFy = s * fx + c * fy;

    return {
      fx: bodyFx,
      fy: bodyFy,
      wheelFx: fx,
      wheelFy: fy,
      slipRatio,
      slipAngle,
      mu,
      saturation
    };
  }

  return { combinedTireForce, frictionCoefficient };
})();
