'use strict';

window.GravelRushPowertrain = (() => {
  const { clamp, interpCurve, lerp } = window.GravelRushMath;

  function createPowertrain(config) {
    return {
      gear: 1,
      engineRPM: config.idleRPM,
      clutch: 0,
      reverse: false,
      shiftTimer: 0,
      engineTorque: 0,
      wheelTorque: 0
    };
  }

  function gearRatio(config, state) {
    if (state.reverse) return -config.reverseGear;
    return config.forwardGears[Math.max(0, state.gear - 1)] || config.forwardGears.at(-1);
  }

  function averageDrivenOmega(wheels, drivetrain) {
    let names;
    if (drivetrain === 'FWD') names = ['fl', 'fr'];
    else if (drivetrain === 'RWD') names = ['rl', 'rr'];
    else names = ['fl', 'fr', 'rl', 'rr'];
    return names.reduce((sum, key) => sum + Math.abs(wheels[key].omega), 0) / names.length;
  }

  function updateTransmission(config, state, wheels, longitudinalSpeed, vehicleSpeed, inputs, dt) {
    state.shiftTimer = Math.max(0, state.shiftTimer - dt);

    if (vehicleSpeed < 0.65) {
      if (inputs.brake > 0.45 && inputs.throttle < 0.1) state.reverse = true;
      if (inputs.throttle > 0.12) state.reverse = false;
    }

    const ratio = Math.abs(gearRatio(config, state));
    const drivenOmega = averageDrivenOmega(wheels, config.drivetrain);
    const coupledRPM = drivenOmega * ratio * config.finalDrive * 60 / (Math.PI * 2);

    const clutchTarget = clamp(Math.abs(longitudinalSpeed) / config.clutchLockSpeed, 0, 1);
    state.clutch += (clutchTarget - state.clutch) * Math.min(1, dt * 8);

    const freeRevTarget = config.idleRPM +
      inputs.throttle * (config.redlineRPM - config.idleRPM) * 0.56;
    const targetRPM = Math.max(
      config.idleRPM,
      lerp(freeRevTarget, coupledRPM, state.clutch)
    );

    state.engineRPM += (targetRPM - state.engineRPM) * Math.min(1, dt * 12);
    state.engineRPM = clamp(state.engineRPM, config.idleRPM, config.redlineRPM + 250);

    if (!state.reverse && state.shiftTimer <= 0) {
      if (state.engineRPM > config.shiftUpRPM && state.gear < config.forwardGears.length) {
        state.gear += 1;
        state.shiftTimer = 0.22;
      } else if (
        state.engineRPM < config.shiftDownRPM &&
        state.gear > 1 &&
        Math.abs(longitudinalSpeed) > 5
      ) {
        state.gear -= 1;
        state.shiftTimer = 0.18;
      }
    }
  }

  function computeDriveTorque(config, state, wheels, longitudinalSpeed, vehicleSpeed, inputs, dt) {
    updateTransmission(config, state, wheels, longitudinalSpeed, vehicleSpeed, inputs, dt);

    const ratio = gearRatio(config, state);
    const throttleCommand = state.reverse ? inputs.brake : inputs.throttle;
    const baseTorque = interpCurve(config.torqueCurve, state.engineRPM);

    let engineTorque = baseTorque * throttleCommand;

    if (throttleCommand < 0.05 && Math.abs(longitudinalSpeed) > 1) {
      const overIdle = Math.max(0, state.engineRPM - config.idleRPM);
      engineTorque -= overIdle * config.engineBrakeFactor;
    }

    const driven = config.drivetrain === 'FWD'
      ? ['fl', 'fr']
      : config.drivetrain === 'RWD'
        ? ['rl', 'rr']
        : ['fl', 'fr', 'rl', 'rr'];

    if (config.tractionControl && throttleCommand > 0.1) {
      const worstSlip = Math.max(...driven.map(key => Math.abs(wheels[key].lastSlipRatio || 0)));
      if (worstSlip > config.tractionSlipThreshold) {
        const over = worstSlip - config.tractionSlipThreshold;
        engineTorque *= clamp(1 - over * 2.8, 0.18, 1);
      }
    }

    if (state.shiftTimer > 0) engineTorque *= 0.35;

    state.engineTorque = engineTorque;
    state.wheelTorque = engineTorque * ratio * config.finalDrive * config.efficiency * Math.max(state.clutch, 0.22);

    return state.wheelTorque;
  }

  function splitLimitedSlip(totalTorque, leftOmega, rightOmega, lock) {
    const speedDelta = Math.abs(leftOmega) - Math.abs(rightOmega);
    const correction = clamp(speedDelta * lock * 0.08, -0.28, 0.28);
    return {
      left: totalTorque * (0.5 - correction),
      right: totalTorque * (0.5 + correction)
    };
  }

  function distributeTorque(config, totalTorque, wheels) {
    const torques = { fl: 0, fr: 0, rl: 0, rr: 0 };

    if (config.drivetrain === 'FWD') {
      Object.assign(torques, splitLimitedSlip(totalTorque, wheels.fl.omega, wheels.fr.omega, config.axleLock));
      torques.fl = torques.left; torques.fr = torques.right;
      delete torques.left; delete torques.right;
      return torques;
    }

    if (config.drivetrain === 'RWD') {
      const rear = splitLimitedSlip(totalTorque, wheels.rl.omega, wheels.rr.omega, config.axleLock);
      torques.rl = rear.left;
      torques.rr = rear.right;
      return torques;
    }

    const frontAverage = (Math.abs(wheels.fl.omega) + Math.abs(wheels.fr.omega)) * 0.5;
    const rearAverage = (Math.abs(wheels.rl.omega) + Math.abs(wheels.rr.omega)) * 0.5;
    const delta = frontAverage - rearAverage;
    const dynamicBias = clamp(delta * config.centerLock * 0.03, -0.16, 0.16);
    const frontShare = clamp(config.frontTorqueSplit - dynamicBias, 0.25, 0.75);

    const front = splitLimitedSlip(totalTorque * frontShare, wheels.fl.omega, wheels.fr.omega, config.axleLock);
    const rear = splitLimitedSlip(totalTorque * (1 - frontShare), wheels.rl.omega, wheels.rr.omega, config.axleLock);

    torques.fl = front.left;
    torques.fr = front.right;
    torques.rl = rear.left;
    torques.rr = rear.right;
    return torques;
  }

  return {
    createPowertrain,
    computeDriveTorque,
    distributeTorque,
    gearRatio
  };
})();
