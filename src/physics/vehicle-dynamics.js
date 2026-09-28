'use strict';

window.GravelRushPhysics = (() => {
  const M = window.GravelRushMath;
  const Tires = window.GravelRushTires;
  const Powertrain = window.GravelRushPowertrain;

  const WHEEL_LAYOUT = {
    fl: { axle: 'front', side: 'left', steer: true },
    fr: { axle: 'front', side: 'right', steer: true },
    rl: { axle: 'rear', side: 'left', steer: false },
    rr: { axle: 'rear', side: 'right', steer: false }
  };

  function makeWheel(config, key, staticLoad) {
    const axle = WHEEL_LAYOUT[key].axle;
    const springRate = axle === 'front' ? config.suspension.springRateFront : config.suspension.springRateRear;
    return {
      omega: 0,
      angle: 0,
      normalLoad: staticLoad,
      targetLoad: staticLoad,
      compression: staticLoad / springRate,
      compressionVelocity: 0,
      groundHeight: 0,
      lastGroundHeight: 0,
      lastSlipRatio: 0,
      lastSlipAngle: 0,
      saturation: 0,
      fx: 0,
      fy: 0
    };
  }

  function createVehicle(config) {
    const weight = config.mass * M.G;
    const frontAxle = weight * config.cgToRear / config.wheelbase;
    const rearAxle = weight * config.cgToFront / config.wheelbase;

    return {
      config,
      vx: 0,
      vy: 0,
      yawRate: 0,
      heading: 0,
      ax: 0,
      ay: 0,
      previousAx: 0,
      previousAy: 0,
      pitch: 0,
      roll: 0,
      steerAngle: 0,
      speed: 0,
      groundHeight: 0,
      bodyHeightOffset: config.rideHeight,
      impact: 0,
      wheels: {
        fl: makeWheel(config, 'fl', frontAxle * 0.5),
        fr: makeWheel(config, 'fr', frontAxle * 0.5),
        rl: makeWheel(config, 'rl', rearAxle * 0.5),
        rr: makeWheel(config, 'rr', rearAxle * 0.5)
      },
      powertrain: Powertrain.createPowertrain(config.powertrain),
      telemetry: {
        aeroDrag: 0,
        downforce: 0,
        rollingResistance: 0,
        maxSlipRatio: 0,
        maxSlipAngle: 0,
        gripUse: 0,
        longitudinalG: 0,
        lateralG: 0
      }
    };
  }

  function wheelPosition(config, key) {
    const front = WHEEL_LAYOUT[key].axle === 'front';
    const left = WHEEL_LAYOUT[key].side === 'left';
    return {
      x: front ? config.cgToFront : -config.cgToRear,
      y: (left ? -1 : 1) * (front ? config.trackFront : config.trackRear) * 0.5
    };
  }

  function setGroundHeights(state, heights) {
    const values = [];
    for (const key of Object.keys(WHEEL_LAYOUT)) {
      if (Number.isFinite(heights[key])) {
        state.wheels[key].lastGroundHeight = state.wheels[key].groundHeight;
        state.wheels[key].groundHeight = heights[key];
        values.push(heights[key]);
      }
    }
    if (values.length) {
      state.groundHeight = values.reduce((a, b) => a + b, 0) / values.length;
    }
  }

  function updateNormalLoads(state, dt) {
    const c = state.config;
    const s = c.suspension;
    const weight = c.mass * M.G;
    const frontStatic = weight * c.cgToRear / c.wheelbase;
    const rearStatic = weight * c.cgToFront / c.wheelbase;

    const aero = state.telemetry.downforce;
    const aeroFront = aero * c.aero.downforceBalanceFront;
    const aeroRear = aero - aeroFront;

    const longitudinalTransfer = c.mass * state.previousAx * c.cgHeight / c.wheelbase;
    const frontTotal = Math.max(200, frontStatic + aeroFront - longitudinalTransfer);
    const rearTotal = Math.max(200, rearStatic + aeroRear + longitudinalTransfer);

    const trackMean = (c.trackFront + c.trackRear) * 0.5;
    const totalLateralTransfer = c.mass * state.previousAy * c.cgHeight / Math.max(trackMean, 0.1);
    const frontShare = frontTotal / Math.max(frontTotal + rearTotal, 1);
    const frontLatTransfer = totalLateralTransfer * frontShare;
    const rearLatTransfer = totalLateralTransfer * (1 - frontShare);

    const targets = {
      fl: frontTotal * 0.5 + frontLatTransfer,
      fr: frontTotal * 0.5 - frontLatTransfer,
      rl: rearTotal * 0.5 + rearLatTransfer,
      rr: rearTotal * 0.5 - rearLatTransfer
    };

    const avgGround = state.groundHeight;

    for (const key of Object.keys(WHEEL_LAYOUT)) {
      const wheel = state.wheels[key];
      const axle = WHEEL_LAYOUT[key].axle;
      const springRate = axle === 'front' ? s.springRateFront : s.springRateRear;
      const damperRate = axle === 'front' ? s.damperRateFront : s.damperRateRear;
      const travel = axle === 'front' ? s.travelFront : s.travelRear;
      const cornerMass = c.sprungMass * 0.25;

      wheel.targetLoad = Math.max(60, targets[key]);

      const roadInput = M.clamp(wheel.groundHeight - avgGround, -0.12, 0.12);
      let targetCompression = wheel.targetLoad / springRate + roadInput;

      if (targetCompression > travel) {
        const over = targetCompression - travel;
        targetCompression = travel + over * springRate / (springRate + s.bumpStopRate);
      }

      const springForce = springRate * (targetCompression - wheel.compression);
      const dampingForce = -damperRate * wheel.compressionVelocity;
      const compressionAccel = (springForce + dampingForce) / Math.max(cornerMass, 1);

      wheel.compressionVelocity += compressionAccel * dt;
      wheel.compression += wheel.compressionVelocity * dt;
      wheel.compression = M.clamp(wheel.compression, 0.01, travel + 0.035);

      const dynamicLoad = springRate * wheel.compression + damperRate * wheel.compressionVelocity;
      const bumpLoad = wheel.compression > travel
        ? (wheel.compression - travel) * s.bumpStopRate
        : 0;
      wheel.normalLoad = Math.max(40, dynamicLoad + bumpLoad);
    }

    // Anti-roll bars couple left/right suspension travel at each axle. This does not
    // create grip; it redistributes vertical load and therefore changes each tire's limit.
    const frontArb = (state.wheels.fl.compression - state.wheels.fr.compression) * s.antiRollFront;
    const rearArb = (state.wheels.rl.compression - state.wheels.rr.compression) * s.antiRollRear;
    state.wheels.fl.normalLoad = Math.max(40, state.wheels.fl.normalLoad + frontArb);
    state.wheels.fr.normalLoad = Math.max(40, state.wheels.fr.normalLoad - frontArb);
    state.wheels.rl.normalLoad = Math.max(40, state.wheels.rl.normalLoad + rearArb);
    state.wheels.rr.normalLoad = Math.max(40, state.wheels.rr.normalLoad - rearArb);

    const leftCompression = (state.wheels.fl.compression + state.wheels.rl.compression) * 0.5;
    const rightCompression = (state.wheels.fr.compression + state.wheels.rr.compression) * 0.5;
    const frontCompression = (state.wheels.fl.compression + state.wheels.fr.compression) * 0.5;
    const rearCompression = (state.wheels.rl.compression + state.wheels.rr.compression) * 0.5;

    const frontGround = (state.wheels.fl.groundHeight + state.wheels.fr.groundHeight) * 0.5;
    const rearGround = (state.wheels.rl.groundHeight + state.wheels.rr.groundHeight) * 0.5;
    const leftGround = (state.wheels.fl.groundHeight + state.wheels.rl.groundHeight) * 0.5;
    const rightGround = (state.wheels.fr.groundHeight + state.wheels.rr.groundHeight) * 0.5;

    state.pitch = Math.atan2(frontGround - rearGround + rearCompression - frontCompression, c.wheelbase);
    state.roll = Math.atan2(rightGround - leftGround + leftCompression - rightCompression, trackMean);

    const avgCompression = (leftCompression + rightCompression) * 0.5;
    const staticCompression = weight * 0.25 /
      ((s.springRateFront + s.springRateRear) * 0.5);
    state.bodyHeightOffset = c.rideHeight - (avgCompression - staticCompression) * 0.38;
  }

  function brakeTorques(state, inputs) {
    const c = state.config;
    const b = c.brakes;
    // In automatic reverse, the brake pedal becomes reverse throttle once nearly stopped.
    // The opposite pedal then acts as the service brake.
    const serviceBrake = state.powertrain.reverse ? inputs.throttle : inputs.brake;
    const requested = serviceBrake * b.maxTorque;
    const frontEach = requested * b.frontBias * 0.5;
    const rearEach = requested * (1 - b.frontBias) * 0.5;
    const result = { fl: frontEach, fr: frontEach, rl: rearEach, rr: rearEach };

    if (inputs.handbrake) {
      result.rl += b.handbrakeTorque * 0.5;
      result.rr += b.handbrakeTorque * 0.5;
    }

    if (b.absEnabled) {
      for (const key of Object.keys(result)) {
        const slip = state.wheels[key].lastSlipRatio;
        if (slip < -b.absSlipThreshold && Math.abs(state.vx) > 3) {
          const over = Math.abs(slip) - b.absSlipThreshold;
          result[key] *= M.clamp(1 - over * 3.2, 0.12, 1);
        }
      }
    }

    return result;
  }

  function computeAero(state) {
    const c = state.config.aero;
    const speed = Math.hypot(state.vx, state.vy);
    const dynamicPressure = 0.5 * c.airDensity * speed * speed;

    state.telemetry.aeroDrag = dynamicPressure * c.dragCoefficient * c.frontalArea;
    state.telemetry.downforce = dynamicPressure * c.downforceCoefficient * c.frontalArea;

    const sideDrag = 0.5 * c.airDensity * c.sideDragCoefficient * c.sideArea * state.vy * Math.abs(state.vy);

    return {
      fx: speed > 0.05 ? -state.telemetry.aeroDrag * (state.vx / speed) : 0,
      fy: -sideDrag
    };
  }

  function step(state, inputs, dt) {
    const c = state.config;
    const tireCfg = c.tires;

    updateNormalLoads(state, dt);

    const driveTotal = Powertrain.computeDriveTorque(
      c.powertrain,
      state.powertrain,
      state.wheels,
      state.vx,
      state.speed,
      inputs,
      dt
    );

    const driveTorques = Powertrain.distributeTorque(c.powertrain, driveTotal, state.wheels);
    const brakes = brakeTorques(state, inputs);

    const speedAbs = Math.abs(state.vx);
    const steerMax = M.lerp(0.60, 0.24, M.smoothStep(8, 43, speedAbs));
    const steerTarget = inputs.steer * steerMax;
    state.steerAngle += (steerTarget - state.steerAngle) * Math.min(1, dt * 10.5);

    let sumFx = 0;
    let sumFy = 0;
    let yawMoment = 0;
    let maxSlipRatio = 0;
    let maxSlipAngle = 0;
    let gripUse = 0;

    for (const key of Object.keys(WHEEL_LAYOUT)) {
      const wheel = state.wheels[key];
      const pos = wheelPosition(c, key);
      const steer = WHEEL_LAYOUT[key].steer ? state.steerAngle : 0;

      const wheelVx = state.vx - state.yawRate * pos.y;
      const wheelVy = state.vy + state.yawRate * pos.x;

      const driveForceDemand = driveTorques[key] / tireCfg.radius;
      const brakeDirection = Math.sign(wheelVx || state.vx || wheel.omega || 1);
      const brakeForceDemand = brakes[key] / tireCfg.radius * brakeDirection;
      const longitudinalDemand = driveForceDemand - brakeForceDemand;

      const force = Tires.combinedTireForce({
        config: tireCfg,
        normalLoad: wheel.normalLoad,
        longitudinalVelocity: wheelVx,
        lateralVelocity: wheelVy,
        steerAngle: steer,
        longitudinalDemand
      });

      wheel.lastSlipRatio = force.slipRatio;
      wheel.lastSlipAngle = force.slipAngle;
      wheel.saturation = force.saturation;
      wheel.fx = force.fx;
      wheel.fy = force.fy;

      maxSlipRatio = Math.max(maxSlipRatio, Math.abs(force.slipRatio));
      maxSlipAngle = Math.max(maxSlipAngle, Math.abs(force.slipAngle));
      gripUse = Math.max(gripUse, force.saturation);

      sumFx += force.fx;
      sumFy += force.fy;
      yawMoment += pos.x * force.fy - pos.y * force.fx;

      const targetOmega =
        force.wheelLongitudinalVelocity * (1 + force.slipRatio) / tireCfg.radius;
      const excessTorque = force.excessLongitudinalForce * tireCfg.radius;

      // Wheel rotational state follows road speed in the adhesion region and spins
      // progressively when requested torque exceeds the contact patch limit.
      wheel.omega += (targetOmega - wheel.omega) * Math.min(1, dt * 18);
      wheel.omega += (excessTorque / tireCfg.wheelInertia) * dt * 0.18;

      const omegaLimit = 310;
      wheel.omega = M.clamp(wheel.omega, -omegaLimit, omegaLimit);
    }

    const aero = computeAero(state);
    sumFx += aero.fx;
    sumFy += aero.fy;

    const speed = Math.hypot(state.vx, state.vy);
    const rollingCoefficient = tireCfg.rollingResistance + tireCfg.rollingResistanceSpeed * speed * speed;
    const rollingForce = rollingCoefficient * c.mass * M.G;
    state.telemetry.rollingResistance = rollingForce;

    if (speed > 0.08) {
      sumFx -= rollingForce * state.vx / speed;
      sumFy -= rollingForce * state.vy / speed;
    }

    // Gravity projected onto the local road plane inferred from the four sampled wheel heights.
    sumFx += -c.mass * M.G * Math.sin(state.pitch);
    sumFy += -c.mass * M.G * Math.sin(state.roll);

    // Mild aerodynamic / chassis yaw damping keeps very high-speed spins finite.
    yawMoment += -state.yawRate * (150 + speed * 12);

    const cgAx = sumFx / c.mass;
    const cgAy = sumFy / c.mass;

    // Body-coordinate velocity derivatives include the rotating-frame terms.
    const du = cgAx + state.yawRate * state.vy;
    const dv = cgAy - state.yawRate * state.vx;
    const yawAccel = yawMoment / c.yawInertia;

    state.vx += du * dt;
    state.vy += dv * dt;
    state.yawRate += yawAccel * dt;
    state.heading += state.yawRate * dt;

    if (Math.abs(state.vx) < 0.015 && Math.abs(state.vy) < 0.015 && inputs.throttle < 0.01 && inputs.brake < 0.01) {
      state.vx = 0;
      state.vy = 0;
    }

    state.previousAx = state.ax;
    state.previousAy = state.ay;
    state.ax = cgAx;
    state.ay = cgAy;
    state.speed = Math.hypot(state.vx, state.vy);

    state.telemetry.maxSlipRatio = maxSlipRatio;
    state.telemetry.maxSlipAngle = maxSlipAngle;
    state.telemetry.gripUse = gripUse;
    state.telemetry.longitudinalG = cgAx / M.G;
    state.telemetry.lateralG = cgAy / M.G;

    return state;
  }

  return {
    createVehicle,
    setGroundHeights,
    wheelPosition,
    step
  };
})();
