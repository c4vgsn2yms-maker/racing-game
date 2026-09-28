# Gravel Rush — Phoenix Open World

Gravel Rush is now a 3D open-world driving prototype centered on Phoenix, Arizona.

The default build streams real-world Phoenix imagery and geometry from **Google Maps Platform Photorealistic 3D Tiles** through CesiumJS. Google map content is not copied, scraped, traced, or stored in this repository.

## Current 3D build

- Real-world WGS84 latitude/longitude movement
- Google Photorealistic 3D Tiles streamed at runtime
- Phoenix downtown spawn
- City-scale streaming rather than a small prebuilt track
- Third-person chase camera
- Hood/close camera
- Free orbit camera
- Four-wheel longitudinal/lateral/yaw vehicle dynamics
- Per-wheel combined-slip tire forces and load-sensitive traction
- Longitudinal and lateral load transfer
- Spring/damper suspension with travel, bump stops and anti-roll distribution
- Road grade/bank derived from four wheel-height samples
- Aerodynamic drag, mild downforce and side drag
- Speed-dependent rolling resistance
- RPM/torque-curve engine model
- 6-speed automatic transmission, final drive and driveline efficiency
- AWD center/axle limited-slip torque distribution
- ABS and traction control
- Handbrake-assisted rear-wheel braking
- Keyboard controls
- Gamepad controls
- Touch controls
- Ground-height sampling against loaded 3D geometry
- Sudden-height obstacle rejection to reduce driving onto building roofs
- On-screen coordinates and speed
- Required map/data attribution enabled in the renderer
- API key held only in browser session storage

The original top-down handling prototype is preserved at `legacy.html`.

## Google Maps setup

You need a Google Cloud project with billing enabled and the **Map Tiles API** enabled.

1. Create a Google Maps Platform API key.
2. Restrict the key to the web origins that will host the game.
3. Enable the Map Tiles API for that project.
4. Open the game and enter the key in the setup panel.
5. The key is retained only for the browser session.

Do not commit unrestricted API keys to this public repository.

See `docs/GOOGLE_MAPS_SETUP.md` for details.

## Vehicle physics

The vehicle simulation is modular and parameterized in SI units. The current baseline is a fictional 1520 kg AWD rally car rather than a copy of a production model.

Read `docs/PHYSICS_MODEL.md` for the equations, modeling choices, calibration assumptions and known limitations.

Run the dependency-free physics regression checks with:

```bash
npm test
```

## Controls

**Keyboard**
- W / Up Arrow — throttle
- S / Down Arrow — brake / reverse
- A/D or Left/Right — steer
- Space — handbrake
- C — camera
- R — reset downtown

**Gamepad**
- RT / R2 — throttle
- LT / L2 — brake / reverse
- Left stick — steer
- A / Cross — handbrake

**Touch**
- On-screen steering, gas, brake and handbrake

## Architecture note

Google's 3D tiles are the visual world layer. They are streamed through the licensed API and are not converted into game-owned map data.

For production-grade vehicle collision, traffic, road rules, missions and navigation, gameplay data should be supplied by a separately licensed/open dataset or authored game data rather than extracted from Google Maps content.

See `docs/ROADMAP.md` for the development path.
