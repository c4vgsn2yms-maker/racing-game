# Gravel Rush Roadmap

## Current milestone — Multi-Terrain Endurance

The default browser build now uses a purpose-built generated driving world instead of Google Maps.

Implemented:

- ~38.3 km continuous loop
- 250 spline samples
- asphalt
- gravel
- loose dirt
- mud
- deep sand
- rocky trail
- packed snow
- ice
- mountain tarmac
- rough rally terrain
- large elevation changes
- banked corners
- rough/ramp-shaped sections
- off-track terrain
- surface-dependent grip
- surface-dependent rolling resistance
- track progress and section HUD
- keyboard, touch and first-class controller support
- controller vibration hooks
- regression tests for physics, controller input and course generation

The previous Phoenix/Google 3D Tiles experiment remains in the repository as reference code but is not loaded by the default page.

## Vehicle physics — implemented baseline

- 3-DOF rigid-body longitudinal/lateral/yaw dynamics
- four tire contact patches
- slip angle and estimated longitudinal slip
- combined tire-force friction limit
- tire load sensitivity
- longitudinal/lateral load transfer
- spring/damper suspension
- travel and bump stops
- anti-roll stiffness distribution
- road grade and banking
- engine RPM/torque curve
- clutch coupling approximation
- six forward gears + reverse
- final drive
- driveline efficiency
- AWD torque distribution
- configurable FWD/RWD/AWD architecture
- service brake bias
- handbrake
- ABS
- traction control
- aerodynamic drag/downforce
- rolling resistance
- fixed-step substepping near 120 Hz

## Next — Terrain and chassis fidelity

- true 6-DOF chassis motion
- vertical velocity and airborne physics
- real jumps instead of ground-following ramp profiles
- landing forces and suspension bottoming
- explicit unsprung mass and tire vertical compliance
- higher-detail terrain mesh around the driving line
- rutting and deformable loose surfaces
- puddles and water depth
- mud depth
- sand sink resistance
- snow depth
- ice patches and transitions
- surface-specific dust, gravel, mud, snow and spray particles
- tire tracks and skid marks

## Next — Tire and suspension fidelity

- measured Pacejka / MF-Tyre parameter sets
- tire temperature
- tire pressure
- tire wear
- wet grip and hydroplaning
- camber
- caster
- toe
- roll centers
- bump steer
- spring preload
- adjustable dampers
- ride-height tuning
- anti-roll bar tuning

## Vehicles

Add a garage using the same physics architecture:

1. compact AWD rally sedan
2. lightweight AWD performance sedan
3. short-wheelbase 4x4 truck
4. short-wheelbase RWD pickup
5. lightweight RWD coupe

Each vehicle should define mass, wheelbase, tracks, CG, suspension, engine curve, gear ratios, final drive, aero and tire parameters.

## Gameplay

- lap timing
- checkpoints
- sector timing
- rally stage timing
- ghost runs
- AI opponents
- endurance events
- rally events
- off-road events
- time trials
- hill climbs
- vehicle recovery
- garages and tuning
- damage
- repair
- fuel as an optional simulation setting
- day/night cycle
- weather

## Browser vs native engine

The browser build remains useful for rapid physics and gameplay iteration.

For the eventual highest-fidelity version, Unreal Engine remains a strong migration target once the browser systems and vehicle-data format are mature enough to justify native 3D collision, skeletal vehicles, advanced effects and larger worlds.
