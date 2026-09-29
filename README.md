# Gravel Rush

Gravel Rush is a browser-based 3D driving prototype with realistic vehicle dynamics, first/third-person cameras, controller support, and a custom GRX Rally Coupe.

## Selectable track architecture

The old single ~38 km mixed-terrain world has been retired from the default game. The browser now loads **one compact track at a time**. Changing tracks destroys the current Cesium scene before building the next one, reducing geometry count and memory pressure on phones.

Current tracks:

- **Redline Circuit** — 7.42 km — asphalt
- **Dust Devil Rally** — 6.85 km — gravel + loose dirt
- **Dune Runner** — 7.81 km — sand + dirt
- **Frostbite Loop** — 5.97 km — packed snow + ice
- **Quarry Run** — 5.23 km — rock + gravel
- **Bogline** — 5.97 km — mud + dirt

Each course uses only 88–96 spline samples and one or two surface materials.

## Vehicle

The default vehicle is the custom **GRX Rally Coupe**, assembled directly in the game from body, hood, cabin glass, roof, bumpers, spoiler, wheels and cockpit pieces.

Camera modes:
- low third-person chase view
- first-person view from the driver's seat with cockpit framing

## Physics

- per-wheel combined tire forces
- surface-dependent friction and rolling resistance
- load sensitivity
- longitudinal/lateral load transfer
- spring/damper suspension
- anti-roll stiffness distribution
- road grade and banking
- engine torque curve and RPM
- 6-speed automatic transmission
- AWD torque distribution
- ABS and traction control
- aerodynamic drag/downforce
- fixed physics substeps near 120 Hz

## Controls

Gamepad:
- Left stick / D-pad — steer
- RT / R2 — throttle
- LT / L2 — brake / reverse
- A / Cross — handbrake
- Y / Triangle — first/third person
- B / Circle — reset
- Right stick — look

Keyboard:
- W / Up — throttle
- S / Down — brake / reverse
- A/D or Left/Right — steer
- Space — handbrake
- C — camera
- R — reset
- T — return to track selection

Touch controls remain available on phones.

## Testing

`npm test` runs physics, controller and selectable-track regression tests.

The track test checks all six tracks independently for finite geometry, valid surface physics, compact sample counts, off-track behavior, and the one/two-terrain limit.
