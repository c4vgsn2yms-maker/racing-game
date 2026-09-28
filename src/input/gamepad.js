'use strict';

window.GravelRushGamepad = (() => {
  const STANDARD = {
    A: 0,
    B: 1,
    X: 2,
    Y: 3,
    LB: 4,
    RB: 5,
    LT: 6,
    RT: 7,
    BACK: 8,
    START: 9,
    LS: 10,
    RS: 11,
    DPAD_UP: 12,
    DPAD_DOWN: 13,
    DPAD_LEFT: 14,
    DPAD_RIGHT: 15,
    HOME: 16
  };

  const state = {
    index: null,
    id: '',
    mapping: '',
    connected: false,
    previousButtons: [],
    lastHapticAt: 0,
    hapticsAvailable: false
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function deadzone(value, zone = 0.12) {
    const magnitude = Math.abs(value || 0);
    if (magnitude <= zone) return 0;
    const normalized = (magnitude - zone) / (1 - zone);
    return Math.sign(value) * clamp(normalized, 0, 1);
  }

  function trigger(value, zone = 0.025) {
    const v = clamp(Number.isFinite(value) ? value : 0, 0, 1);
    return v <= zone ? 0 : (v - zone) / (1 - zone);
  }

  function buttonValue(pad, index) {
    const button = pad && pad.buttons && pad.buttons[index];
    return button ? clamp(button.value || (button.pressed ? 1 : 0), 0, 1) : 0;
  }

  function buttonPressed(pad, index) {
    const button = pad && pad.buttons && pad.buttons[index];
    return Boolean(button && (button.pressed || button.value > 0.5));
  }

  function pressedThisFrame(pad, index) {
    const current = buttonPressed(pad, index);
    const previous = Boolean(state.previousButtons[index]);
    return current && !previous;
  }

  function connectedPads() {
    if (!navigator.getGamepads) return [];
    return Array.from(navigator.getGamepads()).filter(pad => pad && pad.connected);
  }

  function selectPad() {
    const pads = connectedPads();

    if (state.index !== null) {
      const current = pads.find(pad => pad.index === state.index);
      if (current) return current;
    }

    const preferred = pads.find(pad => pad.mapping === 'standard') || pads[0] || null;

    if (preferred) {
      state.index = preferred.index;
      state.id = preferred.id || 'Controller';
      state.mapping = preferred.mapping || 'generic';
      state.connected = true;
      state.previousButtons = [];
      updateHapticCapability(preferred);
    } else {
      state.index = null;
      state.id = '';
      state.mapping = '';
      state.connected = false;
      state.previousButtons = [];
      state.hapticsAvailable = false;
    }

    return preferred;
  }

  function updateHapticCapability(pad) {
    const actuator = pad && (pad.vibrationActuator ||
      (pad.hapticActuators && pad.hapticActuators[0]));

    state.hapticsAvailable = Boolean(
      actuator &&
      (typeof actuator.playEffect === 'function' || typeof actuator.pulse === 'function')
    );
  }

  function fallbackTriggerAxis(pad, axisIndex) {
    if (!pad || pad.mapping === 'standard' || !Number.isFinite(pad.axes[axisIndex])) return 0;
    return trigger((pad.axes[axisIndex] + 1) * 0.5, 0.04);
  }

  function read() {
    const pad = selectPad();

    if (!pad) {
      return {
        connected: false,
        id: '',
        mapping: '',
        steer: 0,
        throttle: 0,
        brake: 0,
        handbrake: false,
        cameraPressed: false,
        resetPressed: false,
        lookX: 0,
        lookY: 0,
        hapticsAvailable: false
      };
    }

    state.connected = true;
    state.id = pad.id || 'Controller';
    state.mapping = pad.mapping || 'generic';
    updateHapticCapability(pad);

    const stickSteer = deadzone(pad.axes[0] || 0, 0.10);
    const dpadSteer =
      (buttonPressed(pad, STANDARD.DPAD_RIGHT) ? 1 : 0) -
      (buttonPressed(pad, STANDARD.DPAD_LEFT) ? 1 : 0);

    const steerRaw = Math.abs(dpadSteer) > 0 ? dpadSteer : stickSteer;
    const steer = Math.sign(steerRaw) * Math.pow(Math.abs(steerRaw), 1.16);

    const throttle = Math.max(
      trigger(buttonValue(pad, STANDARD.RT)),
      fallbackTriggerAxis(pad, 5)
    );

    const brake = Math.max(
      trigger(buttonValue(pad, STANDARD.LT)),
      fallbackTriggerAxis(pad, 4)
    );

    const result = {
      connected: true,
      id: state.id,
      mapping: state.mapping,
      steer,
      throttle,
      brake,
      handbrake: buttonPressed(pad, STANDARD.A),
      cameraPressed: pressedThisFrame(pad, STANDARD.Y),
      resetPressed: pressedThisFrame(pad, STANDARD.B),
      lookX: deadzone(pad.axes[2] || 0, 0.14),
      lookY: deadzone(pad.axes[3] || 0, 0.14),
      hapticsAvailable: state.hapticsAvailable
    };

    state.previousButtons = Array.from(
      { length: pad.buttons.length },
      (_, index) => buttonPressed(pad, index)
    );

    return result;
  }

  async function rumble(weakMagnitude, strongMagnitude, duration = 70) {
    const pads = connectedPads();
    const pad = pads.find(item => item.index === state.index);
    if (!pad) return false;

    const actuator = pad.vibrationActuator ||
      (pad.hapticActuators && pad.hapticActuators[0]);

    if (!actuator) return false;

    const weak = clamp(weakMagnitude, 0, 1);
    const strong = clamp(strongMagnitude, 0, 1);
    if (weak <= 0.01 && strong <= 0.01) return false;

    try {
      if (typeof actuator.playEffect === 'function') {
        await actuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration,
          weakMagnitude: weak,
          strongMagnitude: strong
        });
        return true;
      }

      if (typeof actuator.pulse === 'function') {
        await actuator.pulse(Math.max(weak, strong), duration);
        return true;
      }
    } catch (_) {
      state.hapticsAvailable = false;
    }

    return false;
  }

  function updateVehicleHaptics(vehicle, inputs, now = performance.now()) {
    if (!state.hapticsAvailable || !vehicle || now - state.lastHapticAt < 85) return;

    const telemetry = vehicle.telemetry || {};
    const slip = clamp(telemetry.maxSlipRatio || 0, 0, 1.5);
    const grip = clamp(telemetry.gripUse || 0, 0, 1);
    const longitudinalG = Math.abs(telemetry.longitudinalG || 0);
    const lateralG = Math.abs(telemetry.lateralG || 0);

    const slipRumble = clamp((slip - 0.10) * 0.65, 0, 0.55);
    const gripRumble = clamp((grip - 0.86) * 0.85, 0, 0.30);
    const brakeRumble = inputs && inputs.brake > 0.65
      ? clamp((longitudinalG - 0.45) * 0.45, 0, 0.28)
      : 0;
    const cornerRumble = clamp((lateralG - 0.72) * 0.15, 0, 0.12);
    const handbrakeRumble = inputs && inputs.handbrake ? 0.16 : 0;

    const weak = clamp(gripRumble + cornerRumble + handbrakeRumble, 0, 0.55);
    const strong = clamp(slipRumble + brakeRumble, 0, 0.62);

    if (weak > 0.01 || strong > 0.01) {
      state.lastHapticAt = now;
      void rumble(weak, strong, 75);
    }
  }

  function status() {
    return { ...state };
  }

  window.addEventListener('gamepadconnected', (event) => {
    if (state.index === null || event.gamepad.mapping === 'standard') {
      state.index = event.gamepad.index;
      state.id = event.gamepad.id || 'Controller';
      state.mapping = event.gamepad.mapping || 'generic';
      state.connected = true;
      state.previousButtons = [];
      updateHapticCapability(event.gamepad);
    }
  });

  window.addEventListener('gamepaddisconnected', (event) => {
    if (event.gamepad.index === state.index) {
      state.index = null;
      state.id = '';
      state.mapping = '';
      state.connected = false;
      state.previousButtons = [];
      state.hapticsAvailable = false;
    }
  });

  return {
    read,
    rumble,
    updateVehicleHaptics,
    status
  };
})();
