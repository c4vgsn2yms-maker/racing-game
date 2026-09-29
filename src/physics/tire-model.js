'use strict';

window.GravelRushTires = (() => {
  const { clamp } = window.GravelRushMath;

  function frictionCoefficient(config, normalLoad, gripScale = 1) {
    const ratio = normalLoad / Math.max(config.nominalLoad, 1);
    const sensitivity = 1 - config.loadSensitivity * (ratio - 1);
    return config.muDry * gripScale * clamp(sensitivity, 0.78, 1.16);
  }

  function combinedTireForce({
    config,
    normalLoad,
    longitudinalVelocity,
    lateralVelocity,
    steerAngle,
    longitudinalDemand,
    gripScale = 1
  }) {
    if (normalLoad <= 1) {
      return {
        fx: 0,
        fy: 0,
        wheelFx: 0,
        wheelFy: 0,
        slipRatio: 0,
        slipAngle: 0,
        mu: 0,
        saturation: 0,
        excessLongitudinalForce: 0,
        wheelLongitudinalVelocity: 0
      };
    }

    const c = Math.cos(steerAngle);
    const s = Math.sin(steerAngle);

    const vx = c * longitudinalVelocity + s * lateralVelocity;
    const vy = -s * longitudinalVelocity + c * lateralVelocity;
    const slipAngle = clamp(Math.atan2(vy, Math.max(Math.abs(vx), 1.2)), -1.2, 1.2);

    const mu = frictionCoefficient(config, normalLoad, gripScale);
    const frictionLimit = Math.max(mu * normalLoad, 1);

    // Lateral brush response. The hyperbolic tangent gives a progressive breakaway
    // instead of an abrupt linear-force clamp.
    const lateralLinear = -config.corneringStiffness * Math.tan(slipAngle);
    const wheelFy = frictionLimit * Math.tanh(lateralLinear / frictionLimit);

    // Friction-circle coupling: lateral cornering force consumes some of the same
    // contact-patch capacity needed for acceleration or braking.
    const lateralRatio = clamp(wheelFy / frictionLimit, -1, 1);
    const longitudinalCapacity = frictionLimit * Math.sqrt(Math.max(0, 1 - lateralRatio * lateralRatio));

    const wheelFx = clamp(longitudinalDemand, -longitudinalCapacity, longitudinalCapacity);
    const excessLongitudinalForce = longitudinalDemand - wheelFx;

    // Estimate slip from the force operating point. Once demand exceeds available
    // friction, slip grows beyond the nominal peak to represent wheelspin/lockup.
    let slipRatio;
    if (Math.abs(longitudinalDemand) <= longitudinalCapacity + 1) {
      slipRatio = wheelFx / Math.max(config.longitudinalStiffness, 1);
    } else {
      const excessRatio = Math.abs(excessLongitudinalForce) / frictionLimit;
      slipRatio = Math.sign(longitudinalDemand) *
        (config.slipPeakLongitudinal + clamp(excessRatio * 0.55, 0, 1.8));
    }

    slipRatio = clamp(slipRatio, -2.5, 2.5);

    const bodyFx = c * wheelFx - s * wheelFy;
    const bodyFy = s * wheelFx + c * wheelFy;
    const saturation = clamp(Math.hypot(wheelFx, wheelFy) / frictionLimit, 0, 1);

    return {
      fx: bodyFx,
      fy: bodyFy,
      wheelFx,
      wheelFy,
      slipRatio,
      slipAngle,
      mu,
      saturation,
      excessLongitudinalForce,
      wheelLongitudinalVelocity: vx
    };
  }

  return { combinedTireForce, frictionCoefficient };
})();
