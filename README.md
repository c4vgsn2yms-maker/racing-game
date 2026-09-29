# Gravel Rush — Multi-Terrain Endurance

Gravel Rush is a browser-based 3D driving prototype built around realistic vehicle dynamics and a purpose-built endurance course.

The default game no longer requires Google Maps or an API key. The world is generated directly by the game and is designed specifically to exercise the vehicle physics across very different surfaces and elevations.

## Current 3D build

- ~38.3 km continuous endurance loop
- 10 distinct terrain/surface sections:
  - high-speed asphalt
  - gravel
  - loose dirt
  - mud
  - deep sand
  - rocky trail
  - packed snow
  - ice
  - mountain tarmac
  - rough rally terrain
- major climbs and descents
- banked mountain sections
- rough suspension-test terrain and ramp/jump-shaped features
- off-track shoulders and rough terrain
- section markers and start/finish structure
- no map API key required
- low third-person chase camera
- true first-person cockpit camera from the driver's seat
- visible dashboard, steering-wheel position, windshield pillars and cabin framing
- first-person view follows chassis pitch and body roll
- camera cycle contains only first-person and third-person driving views

## Vehicle physics

- Four-wheel longitudinal/lateral/yaw vehicle dynamics
- Per-wheel combined tire forces
- Surface-dependent tire friction
- Surface-dependent rolling resistance
- Tire load sensitivity
- Longitudinal and lateral load transfer
- Spring/damper suspension
- Suspension travel and bump stops
- Anti-roll stiffness distribution
- Road grade and banking
- Aerodynamic drag, mild downforce and side drag
- RPM/torque-curve engine model
- 6-speed automatic transmission
- final drive and driveline efficiency
- AWD center/axle limited-slip behavior
- ABS and traction control
- handbrake
- fixed physics substeps around 120 Hz

The current baseline vehicle is a fictional 1520 kg AWD rally car rather than a direct copy of a production model.

See `docs/PHYSICS_MODEL.md` for the modeling details and limitations.

## Controller support

**Gamepad / controller**
- Left stick or D-pad — steer
- RT / R2 — analog throttle
- LT / L2 — analog brake / reverse
- A / Cross — handbrake
- Y / Triangle — switch first-person / third-person
- B / Circle — reset vehicle
- Right stick — camera look
- Feature-detected vibration feedback for tire slip and heavy loading

The game prefers the browser's standard Gamepad API mapping, so common Xbox- and PlayStation-style controllers should work without a custom profile.

## Keyboard

- W / Up Arrow — throttle
- S / Down Arrow — brake / reverse
- A/D or Left/Right — steer
- Space — handbrake
- C — switch first-person / third-person
- R — reset

## Touch

On-screen steering, throttle, brake and handbrake controls are available on touch devices.

## Testing

Run the dependency-free regression suite with:

```bash
npm test
```

The suite checks vehicle dynamics, controller mappings and the generated course/surface behavior.

## Legacy builds

- `legacy.html` preserves the original 2D handling prototype.
- `src/phoenix.js` and `docs/GOOGLE_MAPS_SETUP.md` preserve the earlier Google Photorealistic 3D Tiles experiment for reference, but they are no longer part of the default game.

## Development direction

The next fidelity steps are proper 6-DOF airborne vehicle motion, improved terrain meshes, surface-specific particles/tracks, collision geometry, damage, more vehicles, AI opponents and event/race systems.

See `docs/ROADMAP.md` for the development path.
