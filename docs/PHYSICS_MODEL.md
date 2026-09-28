# Vehicle Physics Model

This document describes the browser vehicle simulation used by the Phoenix open-world build.

The model is intended to be physically coherent and tunable in real units. It is not a homologated vehicle model and it does not claim to reproduce a specific production vehicle without measured tire, suspension, aero and engine data.

## Coordinate system and rigid body

The simulation uses a planar 3-DOF rigid vehicle body:

- longitudinal velocity `vx`
- lateral velocity `vy`
- yaw rate `r`

The body integrates tire, aerodynamic, rolling, grade and braking forces using Newton's second law. Body-coordinate velocity derivatives include the rotating-frame yaw terms.

The vehicle tracks real WGS84 latitude/longitude separately. Body velocity is transformed to north/east velocity before updating the geodetic position.

## Tire model

Each of the four tires has its own:

- normal load
- longitudinal force
- lateral force
- slip ratio
- slip angle
- wheel angular velocity
- friction utilization

The lateral model is a brush-like response based on cornering stiffness and slip angle. It transitions progressively toward the friction limit rather than snapping from linear grip to a hard clamp.

Longitudinal force begins with the requested wheel force from engine/brake torque.

Longitudinal and lateral tire forces share one contact-patch limit using a friction circle:

`sqrt(Fx^2 + Fy^2) <= mu * Fz`

This means a tire using most of its grip to corner has less force available for acceleration or braking.

The friction coefficient includes a load-sensitivity term. A heavily loaded tire can generate more absolute force, but not perfectly proportional force, which makes load transfer matter.

When longitudinal demand exceeds the remaining contact-patch capacity, the tire reports increased slip ratio. That feeds traction control and ABS logic.

### Why the low-speed solver is force based

A fully dynamic wheel-slip model can become numerically stiff near zero vehicle speed because slip ratio divides by longitudinal speed. The current browser model therefore uses torque-derived force demand plus a combined friction limit and estimates slip from the operating point.

This keeps launches and parking-lot speeds stable at real-time frame rates. The architecture can later accept measured Magic Formula / MF-Tyre parameters without changing the rest of the vehicle model.

## Vertical load and suspension

Each corner has:

- spring rate
- damper rate
- suspension travel
- bump stop
- normal load
- suspension compression
- compression velocity
- sampled ground height

Static axle load comes from CG position and wheelbase.

Longitudinal load transfer depends on:

- mass
- longitudinal acceleration
- CG height
- wheelbase

Lateral load transfer depends on:

- mass
- lateral acceleration
- CG height
- track width

Front/rear distribution of lateral load transfer is influenced by front/rear roll stiffness, including spring rates and anti-roll bar rates.

Suspension compression is integrated as a spring-damper response rather than instantly teleporting to the target load.

## Road plane and terrain

The Phoenix renderer samples Google 3D geometry at all four wheel locations.

The four points are used to fit a local road plane:

- front/rear height difference produces road grade
- left/right height difference produces road bank
- deviations from that fitted plane are treated as local bumps

This prevents a steady uphill road from being mistaken for a giant front-suspension compression event.

Road grade and bank affect gravity forces. Chassis pitch and roll also include suspension deflection, but suspension attitude is kept separate from road slope so body roll does not create fake gravity.

Very abrupt front-vs-rear height discontinuities are used as a simple obstacle proxy because Google Photorealistic 3D Tiles are a visual map layer, not a complete game collision mesh.

## Aerodynamics

Aerodynamic drag uses:

`Fd = 0.5 * rho * Cd * A * v^2`

The config contains:

- air density
- drag coefficient
- frontal area
- downforce coefficient
- front/rear aero balance
- side-drag coefficient and side area

Downforce increases tire normal loads with speed. Side drag opposes lateral motion.

The current fictional rally car has only mild downforce.

## Rolling resistance

Rolling resistance starts from:

`Frr = Crr * m * g`

The coefficient also has a small speed-squared term so road load grows gradually with speed.

Rolling resistance is applied once at the body level. It is not double-counted as a second wheel torque loss.

## Engine

The engine uses an RPM-vs-torque curve in SI units.

Torque is linearly interpolated between table points. Throttle scales positive torque and closed-throttle operation creates calibrated engine braking.

The model tracks:

- idle RPM
- current RPM
- redline
- engine torque
- engine inertia parameter
- clutch coupling state

The baseline curve is fictional and should be replaced with measured or manufacturer-derived data for a specific vehicle.

## Transmission and drivetrain

Wheel torque is derived from:

`Twheel = Tengine * gearRatio * finalDrive * efficiency`

The baseline vehicle uses:

- 6 forward ratios
- reverse ratio
- final drive
- driveline efficiency
- automatic RPM-based shifting
- minimum shift time
- AWD
- front/rear torque split
- center locking behavior
- left/right limited-slip behavior

Reverse is selected only when total vehicle speed is nearly zero, so a spinning/sliding car cannot accidentally engage reverse merely because its longitudinal body velocity crosses zero.

## Brakes, ABS and TCS

Service brake torque is split by configurable front brake bias.

The handbrake adds rear-axle brake torque.

ABS reduces requested brake torque when estimated negative slip passes the lock threshold.

Traction control reduces engine torque when a driven wheel exceeds the configured positive-slip threshold.

Both systems operate on the same per-wheel slip state used by the tire model.

## Fixed-step stability

Rendering can have irregular frame times. Vehicle dynamics are substepped toward 120 Hz so tire, yaw and suspension integration remain stable during ordinary frame-time variation.

## Current baseline vehicle

The current `Desert Rally AWD` is a fictional calibration vehicle:

- mass: 1520 kg
- wheelbase: 2.65 m
- CG height: 0.53 m
- AWD
- 6-speed automatic logic
- 1.05 nominal dry friction coefficient
- independent front/rear spring and damper rates
- anti-roll bars
- ABS and TCS
- mild aerodynamic downforce

All parameters live in `src/physics/vehicle-config.js`.

## Important limitations

The current browser build does **not yet** include:

- measured Pacejka / MF-Tyre coefficient sets
- tire temperature, pressure, wear or hydroplaning
- explicit unsprung-mass/tire-sidewall 2-DOF dynamics at every corner
- suspension geometry such as camber gain, caster, toe, bump steer or roll centers
- driveshaft/clutch elasticity and backlash
- turbocharger spool / manifold pressure dynamics
- fuel mass and fuel slosh
- full 6-DOF chassis inertia
- deformable vehicle collision
- production-quality road/curb collision meshes
- road material classification for every Phoenix street

Those are future fidelity layers, not hidden assumptions.

## Reference basis used for this implementation

The implementation was checked against engineering references for:

- Newtonian 3-DOF bicycle/vehicle-body dynamics
- tire slip angle, slip ratio and combined-slip behavior
- quarter-car spring/damper suspension modeling
- load transfer
- engine torque curves
- gearbox and final-drive torque multiplication
- aerodynamic drag
- rolling resistance

See the project development notes and commit history for the implementation evolution.
