# Racing Game Roadmap

## Current milestone — Phoenix 3D open world

Implemented:

- CesiumJS 3D world renderer
- Google Maps Platform Photorealistic 3D Tiles integration
- Phoenix downtown world origin/spawn
- Geodetic vehicle movement
- Chase, hood and orbit cameras
- Touch, keyboard and gamepad driving
- Height sampling against rendered 3D geometry
- Streaming world architecture
- Preserved legacy 2D handling build

## Next — Real vehicle physics

Move the player car from a simple geodetic bicycle model toward a proper rigid-body vehicle simulation:

- sprung and unsprung mass
- four-wheel suspension raycasts
- tire slip angle and longitudinal slip
- weight transfer
- engine torque curve
- clutch and gearbox
- FWD / RWD / AWD / selectable 4WD
- open, limited-slip and locking differentials
- ABS and traction control options
- tire temperature / compound hooks
- controller vibration / force feedback where supported

Vehicle data should include mass, wheelbase, track width, suspension travel, center of mass, engine curve, gear ratios, final drive, steering lock, aero drag, tire parameters and surface grip.

Initial fictional archetypes:

1. Compact AWD rally sedan
2. Lightweight AWD performance sedan
3. Short-wheelbase 4x4 truck
4. Short-wheelbase RWD pickup
5. Lightweight RWD coupe

## Phoenix gameplay layer

Google Photorealistic 3D Tiles stay as the streamed visual environment.

Do **not** scrape, trace or convert Google map content into a permanent gameplay dataset.

Add independently licensed/open or authored gameplay layers for:

- road centerlines and road classes
- drivable-surface classification
- traffic lanes
- intersections and signals
- speed zones
- spawn points
- route planning
- race routes
- garages
- dealerships
- fuel/charging locations
- police and traffic AI routing
- collision proxies where needed

This lets the game retain real Phoenix geography without treating streamed Google content as owned game assets.

## World systems

- seamless city streaming
- traffic
- pedestrians where appropriate
- day/night cycle
- Arizona weather
- dust
- rain and wet-road grip
- destructible lightweight props
- vehicle damage
- towing/recovery
- garages and vehicle storage
- fuel/energy system as an optional realism setting

## Events

- street circuits
- point-to-point city races
- highway runs
- mountain-road time trials
- dirt/desert rally stages
- off-road trails
- drag racing
- delivery/driving jobs
- free-roam challenges

## Engine direction

The browser/Cesium build is useful for validating the real-world map streaming and game design.

For the full physics-heavy version, Unreal Engine + Cesium for Unreal is the preferred production path because it can combine the same Google Photorealistic 3D Tiles stream with Unreal's vehicle physics, collision systems, AI, world gameplay and rendering.
