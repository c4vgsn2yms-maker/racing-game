'use strict';

window.GravelRushVehicleConfig = {
  id: 'desert-rally-awd',
  name: 'Desert Rally AWD',
  mass: 1520,
  sprungMass: 1380,
  wheelbase: 2.65,
  trackFront: 1.56,
  trackRear: 1.55,
  cgToFront: 1.18,
  cgToRear: 1.47,
  cgHeight: 0.53,
  yawInertia: 2450,
  rideHeight: 0.19,

  aero: {
    airDensity: 1.12,
    dragCoefficient: 0.33,
    frontalArea: 2.20,
    downforceCoefficient: 0.06,
    downforceBalanceFront: 0.46,
    sideDragCoefficient: 0.72,
    sideArea: 3.2
  },

  tires: {
    radius: 0.335,
    wheelInertia: 1.28,
    nominalLoad: 3725,
    muDry: 1.05,
    loadSensitivity: 0.075,
    longitudinalStiffness: 93000,
    corneringStiffness: 78000,
    rollingResistance: 0.014,
    rollingResistanceSpeed: 0.000025,
    slipPeakLongitudinal: 0.13,
    slipPeakLateral: 0.11
  },

  suspension: {
    springRateFront: 36000,
    springRateRear: 33000,
    damperRateFront: 4100,
    damperRateRear: 3800,
    bumpStopRate: 125000,
    travelFront: 0.20,
    travelRear: 0.22,
    antiRollFront: 13500,
    antiRollRear: 10500
  },

  brakes: {
    maxTorque: 3300,
    frontBias: 0.66,
    handbrakeTorque: 2700,
    absEnabled: true,
    absSlipThreshold: 0.18
  },

  powertrain: {
    drivetrain: 'AWD',
    frontTorqueSplit: 0.46,
    centerLock: 0.34,
    axleLock: 0.30,
    efficiency: 0.90,
    finalDrive: 4.11,
    forwardGears: [3.63, 2.19, 1.52, 1.18, 0.96, 0.79],
    reverseGear: 3.42,
    idleRPM: 900,
    redlineRPM: 6900,
    shiftUpRPM: 6500,
    shiftDownRPM: 2250,
    engineInertia: 0.22,
    clutchLockSpeed: 7.5,
    engineBrakeFactor: 0.035,
    tractionControl: true,
    tractionSlipThreshold: 0.16,
    torqueCurve: [
      [900, 155],
      [1500, 225],
      [2200, 285],
      [3000, 325],
      [3800, 350],
      [4600, 362],
      [5400, 350],
      [6200, 320],
      [6800, 280],
      [7000, 0]
    ]
  }
};
