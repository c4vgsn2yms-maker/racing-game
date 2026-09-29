'use strict';

const MPH_PER_MPS = 2.2369362921;
const METERS_PER_DEGREE_LAT = 111320;
const CAMERA_MODES = ['THIRD PERSON','FIRST PERSON'];

const ui = {
  setup: document.getElementById('setup-card'),
  trackGrid: document.getElementById('track-grid'),
  start: document.getElementById('start-game'),
  hud: document.getElementById('hud'),
  trackName: document.getElementById('track-name'),
  section: document.getElementById('section-name'),
  progress: document.getElementById('course-progress'),
  worldStatus: document.getElementById('world-status'),
  speed: document.getElementById('speed'),
  gear: document.getElementById('gear'),
  rpm: document.getElementById('rpm'),
  gLong: document.getElementById('g-long'),
  gLat: document.getElementById('g-lat'),
  slip: document.getElementById('slip'),
  grip: document.getElementById('grip'),
  drive: document.getElementById('drive'),
  controllerStatus: document.getElementById('controller-status'),
  camera: document.getElementById('camera'),
  changeTrack: document.getElementById('change-track'),
  reset: document.getElementById('reset'),
  help: document.getElementById('help'),
  touch: document.getElementById('touch-controls')
};

const keys = new Set();
const touch = new Set();

let selectedTrackId = GravelRushTracks.list()[0].id;
let course = null;
let spawn = null;
let viewer = null;
let vehicle = null;
let running = false;
let lastFrame = performance.now();
let cameraModeIndex = 0;
let cameraLookX = 0;
let cameraLookY = 0;
let lastControllerInput = null;
let carModelEntity = null;
let carFallbackEntity = null;
let cockpitParts = [];
let worldPosition = { x:0, y:0 };

function color(hex, alpha=1) {
  return Cesium.Color.fromCssColorString(hex).withAlpha(alpha);
}

function renderTrackMenu() {
  ui.trackGrid.innerHTML = '';
  for (const meta of GravelRushTracks.list()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'track-card' + (meta.id === selectedTrackId ? ' selected' : '');
    button.dataset.trackId = meta.id;
    button.innerHTML =
      '<strong>' + meta.name + '</strong>' +
      '<span>' + meta.subtitle + '</span>' +
      '<small>' + meta.surfaces.join(' + ') + '</small>';
    button.addEventListener('click', () => {
      selectedTrackId = meta.id;
      renderTrackMenu();
    });
    ui.trackGrid.appendChild(button);
  }
}

function destroyWorld() {
  running = false;
  carModelEntity = null;
  carFallbackEntity = null;
  cockpitParts = [];
  vehicle = null;
  course = null;
  spawn = null;
  if (viewer && !viewer.isDestroyed()) viewer.destroy();
  viewer = null;
}

function showTrackMenu() {
  destroyWorld();
  ui.hud.classList.add('hidden');
  ui.help.classList.add('hidden');
  ui.touch.classList.add('hidden');
  ui.setup.classList.remove('hidden');
  renderTrackMenu();
}

function localToGeo(x,y) {
  const lat = course.ORIGIN.latitude + y / METERS_PER_DEGREE_LAT;
  const lonScale = METERS_PER_DEGREE_LAT * Math.cos(Cesium.Math.toRadians(course.ORIGIN.latitude));
  return {
    latitude: lat,
    longitude: course.ORIGIN.longitude + x / lonScale
  };
}

function localToCartesian(x,y,z) {
  const geo = localToGeo(x,y);
  return Cesium.Cartesian3.fromDegrees(geo.longitude,geo.latitude,z);
}

function offsetFromVehicle(forward,right) {
  const c=Math.cos(vehicle.heading), s=Math.sin(vehicle.heading);
  return {
    x: worldPosition.x + s*forward + c*right,
    y: worldPosition.y + c*forward - s*right
  };
}

function vehicleAltitude() {
  return vehicle.groundHeight + 0.69 + Math.max(vehicle.bodyHeightOffset,0.04);
}

function vehiclePosition() {
  return localToCartesian(worldPosition.x,worldPosition.y,vehicleAltitude());
}

function vehicleOrientation(position) {
  return Cesium.Transforms.headingPitchRollQuaternion(
    position,
    new Cesium.HeadingPitchRoll(vehicle.heading,vehicle.pitch,vehicle.roll)
  );
}

function stripVertex(sample,halfWidth,side,raise=0) {
  const nx=-sample.ty, ny=sample.tx;
  const x=sample.x+nx*halfWidth*side;
  const y=sample.y+ny*halfWidth*side;
  return localToCartesian(x,y,course.heightAt(x,y)+raise);
}

function addStrip(widthForSample,materialColor,raise=0) {
  const samples=course.samples;
  const positions=new Float64Array(samples.length*6);
  const indices=new Uint16Array(samples.length*6);
  const points=[];

  for(let i=0;i<samples.length;i++) {
    const width=typeof widthForSample==='function'?widthForSample(samples[i]):widthForSample;
    const left=stripVertex(samples[i],width*.5,1,raise);
    const right=stripVertex(samples[i],width*.5,-1,raise);
    points.push(left,right);
    const p=i*6;
    positions[p]=left.x; positions[p+1]=left.y; positions[p+2]=left.z;
    positions[p+3]=right.x; positions[p+4]=right.y; positions[p+5]=right.z;

    const next=(i+1)%samples.length;
    const k=i*6, aL=i*2, aR=aL+1, bL=next*2, bR=bL+1;
    indices[k]=aL; indices[k+1]=bL; indices[k+2]=bR;
    indices[k+3]=aL; indices[k+4]=bR; indices[k+5]=aR;
  }

  const geometry=new Cesium.Geometry({
    attributes:{
      position:new Cesium.GeometryAttribute({
        componentDatatype:Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute:3,
        values:positions
      })
    },
    indices,
    primitiveType:Cesium.PrimitiveType.TRIANGLES,
    boundingSphere:Cesium.BoundingSphere.fromPoints(points)
  });

  viewer.scene.primitives.add(new Cesium.Primitive({
    geometryInstances:new Cesium.GeometryInstance({
      geometry,
      attributes:{color:Cesium.ColorGeometryInstanceAttribute.fromColor(color(materialColor))}
    }),
    appearance:new Cesium.PerInstanceColorAppearance({flat:true,translucent:false,closed:false}),
    asynchronous:false
  }));
}

function addRoadSurface(surfaceKey) {
  const positions=[], indices=[], points=[];
  let base=0;

  for(let i=0;i<course.samples.length;i++) {
    const a=course.samples[i];
    if(a.surfaceKey!==surfaceKey) continue;
    const b=course.samples[(i+1)%course.samples.length];
    const sa=course.SURFACES[a.surfaceKey];
    const sb=course.SURFACES[b.surfaceKey];
    const quad=[
      stripVertex(a,sa.width*.5,1,.09),
      stripVertex(b,sb.width*.5,1,.09),
      stripVertex(b,sb.width*.5,-1,.09),
      stripVertex(a,sa.width*.5,-1,.09)
    ];
    for(const p of quad) {
      positions.push(p.x,p.y,p.z);
      points.push(p);
    }
    indices.push(base,base+1,base+2,base,base+2,base+3);
    base+=4;
  }

  if(!positions.length) return;
  const geometry=new Cesium.Geometry({
    attributes:{
      position:new Cesium.GeometryAttribute({
        componentDatatype:Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute:3,
        values:new Float64Array(positions)
      })
    },
    indices:new Uint16Array(indices),
    primitiveType:Cesium.PrimitiveType.TRIANGLES,
    boundingSphere:Cesium.BoundingSphere.fromPoints(points)
  });

  viewer.scene.primitives.add(new Cesium.Primitive({
    geometryInstances:new Cesium.GeometryInstance({
      geometry,
      attributes:{color:Cesium.ColorGeometryInstanceAttribute.fromColor(color(course.SURFACES[surfaceKey].color))}
    }),
    appearance:new Cesium.PerInstanceColorAppearance({flat:true,translucent:false,closed:false}),
    asynchronous:false
  }));
}

function buildTrackVisuals() {
  // Compact scene: one 220m-wide terrain ribbon plus one/two road materials.
  // No other tracks or giant world geometry are allocated.
  addStrip(220,course.terrainColor,-.18);
  addStrip(sample=>course.SURFACES[sample.surfaceKey].width+12,course.terrainColor,.02);

  for(const surfaceKey of course.surfaceKeys) addRoadSurface(surfaceKey);

  // Lightweight center markings only for asphalt.
  if(course.surfaceKeys.includes('ASPHALT')) {
    for(let i=0;i<course.samples.length;i+=2) {
      const a=course.samples[i], b=course.samples[(i+1)%course.samples.length];
      viewer.entities.add({
        polyline:{
          positions:[
            localToCartesian(a.x,a.y,course.heightAt(a.x,a.y)+.14),
            localToCartesian(b.x,b.y,course.heightAt(b.x,b.y)+.14)
          ],
          width:1.4,
          material:color('#eee6c8',.8)
        }
      });
    }
  }

  const p=course.samples[0];
  viewer.entities.add({
    position:localToCartesian(p.x,p.y,course.heightAt(p.x,p.y)+4.6),
    label:{
      text:course.name.toUpperCase(),
      font:'700 16px system-ui',
      fillColor:Cesium.Color.WHITE,
      outlineColor:Cesium.Color.BLACK,
      outlineWidth:3,
      style:Cesium.LabelStyle.FILL_AND_OUTLINE,
      distanceDisplayCondition:new Cesium.DistanceDisplayCondition(0,900)
    }
  });
}

function buildCar() {
  const position=vehiclePosition();
  carModelEntity=viewer.entities.add({
    name:'GRX Rally Coupe',
    position,
    orientation:vehicleOrientation(position),
    model:{
      uri:'assets/grx-rally.gltf?v=grx-axis-2',
      scale:1,
      minimumPixelSize:96,
      maximumScale:4,
      silhouetteColor:color('#111318'),
      silhouetteSize:1.0,
      shadows:Cesium.ShadowMode.ENABLED
    }
  });

  const fallbackPoint=offsetFromVehicle(0,0);
  const fallbackPosition=localToCartesian(
    fallbackPoint.x,
    fallbackPoint.y,
    vehicle.groundHeight+.48
  );
  carFallbackEntity=viewer.entities.add({
    name:'GRX fallback chassis',
    position:fallbackPosition,
    orientation:vehicleOrientation(fallbackPosition),
    box:{
      dimensions:new Cesium.Cartesian3(1.82,4.02,.34),
      material:color('#c77b19'),
      outline:true,
      outlineColor:color('#111318')
    }
  });

  cockpitParts=[];
  const dark='#181a1d';
  const addCockpitBox=(name,forward,right,height,dimensions,material)=>{
    const p=offsetFromVehicle(forward,right);
    const pos=localToCartesian(p.x,p.y,vehicle.groundHeight+height);
    const entity=viewer.entities.add({
      name,
      position:pos,
      orientation:vehicleOrientation(pos),
      show:false,
      box:{
        dimensions:new Cesium.Cartesian3(...dimensions),
        material:color(material),
        outline:false
      }
    });
    cockpitParts.push({entity,forward,right,height});
  };

  addCockpitBox('Dashboard',.80,0,.88,[1.70,.32,.24],dark);
  addCockpitBox('Steering wheel',.44,-.38,1.04,[.42,.08,.42],'#090a0b');
  addCockpitBox('Left pillar',.93,-.80,1.28,[.10,.12,.62],dark);
  addCockpitBox('Right pillar',.93,.80,1.28,[.10,.12,.62],dark);
  addCockpitBox('Header',.92,0,1.55,[1.66,.12,.11],dark);
}

function updateVisualParts() {
  if(carModelEntity) {
    const position=vehiclePosition();
    carModelEntity.position=position;
    carModelEntity.orientation=vehicleOrientation(position);
  }

  if(carFallbackEntity) {
    const p=offsetFromVehicle(0,0);
    const position=localToCartesian(p.x,p.y,vehicle.groundHeight+.48);
    carFallbackEntity.position=position;
    carFallbackEntity.orientation=vehicleOrientation(position);
  }

  for(const part of cockpitParts) {
    const p=offsetFromVehicle(part.forward,part.right);
    const pos=localToCartesian(p.x,p.y,vehicle.groundHeight+part.height);
    part.entity.position=pos;
    part.entity.orientation=vehicleOrientation(pos);
  }
}

function createVehicleState() {
  const state=GravelRushPhysics.createVehicle(GravelRushVehicleConfig);
  state.heading=spawn.heading;
  const h=course.heightAt(spawn.x,spawn.y);
  GravelRushPhysics.setGroundHeights(state,{fl:h,fr:h,rl:h,rr:h});
  const surface=course.surfaceAt(spawn.x,spawn.y);
  state.surfaceGrip=surface.grip;
  state.surfaceRolling=surface.rolling;
  state.currentSurface=surface;
  return state;
}

function initializeWorld() {
  destroyWorld();
  course=GravelRushTracks.createTrack(selectedTrackId);
  spawn=course.spawn();
  worldPosition={x:spawn.x,y:spawn.y};

  viewer=new Cesium.Viewer('cesiumContainer',{
    animation:false,baseLayerPicker:false,fullscreenButton:false,geocoder:false,
    homeButton:false,infoBox:false,navigationHelpButton:false,sceneModePicker:false,
    selectionIndicator:false,timeline:false,imageryProvider:false,
    terrainProvider:new Cesium.EllipsoidTerrainProvider(),requestRenderMode:false
  });

  viewer.scene.globe.show=true;
  viewer.scene.globe.baseColor=color(course.terrainColor);
  viewer.scene.globe.enableLighting=false;
  viewer.scene.skyAtmosphere.show=true;
  viewer.scene.backgroundColor=color(course.skyColor);
  viewer.scene.fog.enabled=true;
  viewer.scene.fog.density=.00022;

  vehicle=createVehicleState();
  buildTrackVisuals();
  buildCar();
  updateWheelGround();
  updateVisualParts();
  setCamera();

  ui.trackName.textContent=course.name.toUpperCase();
  ui.setup.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  ui.help.classList.remove('hidden');
  ui.touch.classList.remove('hidden');

  running=true;
  lastFrame=performance.now();
  requestAnimationFrame(frame);
}

function resetCar() {
  if(!course) return;
  spawn=course.spawn();
  worldPosition={x:spawn.x,y:spawn.y};
  vehicle=createVehicleState();
  updateWheelGround();
  updateVisualParts();
  setCamera();
}

function wheelWorldPoint(key) {
  const p=GravelRushPhysics.wheelPosition(GravelRushVehicleConfig,key);
  const c=Math.cos(vehicle.heading), s=Math.sin(vehicle.heading);
  return {
    x:worldPosition.x+s*p.x+c*p.y,
    y:worldPosition.y+c*p.x-s*p.y
  };
}

function updateWheelGround() {
  const heights={};
  for(const key of ['fl','fr','rl','rr']) {
    const p=wheelWorldPoint(key);
    heights[key]=course.heightAt(p.x,p.y);
  }
  GravelRushPhysics.setGroundHeights(vehicle,heights);
  const surface=course.surfaceAt(worldPosition.x,worldPosition.y);
  vehicle.surfaceGrip=surface.grip;
  vehicle.surfaceRolling=surface.rolling;
  vehicle.currentSurface=surface;
}

function integratePosition(dt) {
  const c=Math.cos(vehicle.heading), s=Math.sin(vehicle.heading);
  worldPosition.x+=(s*vehicle.vx+c*vehicle.vy)*dt;
  worldPosition.y+=(c*vehicle.vx-s*vehicle.vy)*dt;
}

function readInput() {
  let throttle=(keys.has('KeyW')||keys.has('ArrowUp')||touch.has('throttle'))?1:0;
  let brake=(keys.has('KeyS')||keys.has('ArrowDown')||touch.has('brake'))?1:0;
  let steer=((keys.has('KeyD')||keys.has('ArrowRight')||touch.has('right'))?1:0)-
    ((keys.has('KeyA')||keys.has('ArrowLeft')||touch.has('left'))?1:0);
  let handbrake=keys.has('Space')||touch.has('handbrake');

  const controller=window.GravelRushGamepad?GravelRushGamepad.read():null;
  if(controller&&controller.connected) {
    throttle=Math.max(throttle,controller.throttle);
    brake=Math.max(brake,controller.brake);
    steer=Math.max(-1,Math.min(1,steer+controller.steer));
    handbrake=handbrake||controller.handbrake;
  }
  lastControllerInput=controller;
  return {throttle,brake,steer,handbrake,controller};
}

function updateController(controller,dt) {
  if(controller&&controller.connected) {
    if(controller.cameraPressed) changeCamera();
    if(controller.resetPressed) resetCar();
    const r=Math.min(1,dt*10);
    cameraLookX+=((controller.lookX||0)-cameraLookX)*r;
    cameraLookY+=((controller.lookY||0)-cameraLookY)*r;
  } else {
    const r=Math.min(1,dt*8);
    cameraLookX+=(0-cameraLookX)*r;
    cameraLookY+=(0-cameraLookY)*r;
  }
}

function aimCamera(cameraLocal,targetLocal,roll=0) {
  const cameraPosition=localToCartesian(cameraLocal.x,cameraLocal.y,cameraLocal.z);
  const targetPosition=localToCartesian(targetLocal.x,targetLocal.y,targetLocal.z);
  const direction=Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(targetPosition,cameraPosition,new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
  const surfaceUp=Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(cameraPosition,new Cesium.Cartesian3());
  let right=Cesium.Cartesian3.cross(direction,surfaceUp,new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(right,right);
  let up=Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(right,direction,new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
  if(Math.abs(roll)>.00001) {
    up=Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.add(
        Cesium.Cartesian3.multiplyByScalar(up,Math.cos(roll),new Cesium.Cartesian3()),
        Cesium.Cartesian3.multiplyByScalar(right,Math.sin(roll),new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      ),new Cesium.Cartesian3()
    );
  }
  viewer.camera.setView({destination:cameraPosition,orientation:{direction,up}});
}

function setCamera() {
  if(!viewer||!vehicle) return;
  const first=CAMERA_MODES[cameraModeIndex]==='FIRST PERSON';
  ui.camera.textContent=first?'VIEW: DRIVER':'VIEW: CHASE';
  if(carModelEntity) carModelEntity.show=!first;
  if(carFallbackEntity) carFallbackEntity.show=!first;
  for(const p of cockpitParts) p.entity.show=first;

  const ground=vehicle.groundHeight;
  const center=vehicleAltitude();

  if(first) {
    // Driver eye position inside the left-hand seat, behind the dashboard.
    const cam=offsetFromVehicle(-.12,-.38);
    const heading=vehicle.heading+cameraLookX*Cesium.Math.toRadians(62);
    const distance=32;
    aimCamera(
      {x:cam.x,y:cam.y,z:ground+1.23},
      {
        x:cam.x+Math.sin(heading)*distance,
        y:cam.y+Math.cos(heading)*distance,
        z:ground+1.23+Math.tan(vehicle.pitch)*distance-cameraLookY*5.2
      },
      vehicle.roll
    );
  } else {
    // Fixed chase mount centered directly behind the vehicle.
    const heading=vehicle.heading+cameraLookX*Cesium.Math.toRadians(48);
    const distance=7.8+Math.min(vehicle.speed*.025,1.2);
    const x=worldPosition.x-Math.sin(heading)*distance;
    const y=worldPosition.y-Math.cos(heading)*distance;
    aimCamera(
      {x,y,z:Math.max(course.heightAt(x,y)+2.15,center+1.75)},
      {x:worldPosition.x,y:worldPosition.y,z:center+.36-cameraLookY*2.2}
    );
  }
}

function changeCamera() {
  cameraModeIndex=(cameraModeIndex+1)%CAMERA_MODES.length;
  cameraLookX=0;
  cameraLookY=0;
  setCamera();
}

function updateHUD() {
  const t=vehicle.telemetry,p=vehicle.powertrain,s=vehicle.currentSurface;
  ui.speed.textContent=Math.round(vehicle.speed*MPH_PER_MPS);
  ui.gear.textContent=p.reverse?'R':(Math.abs(vehicle.vx)<.15?'N':String(p.gear));
  ui.rpm.textContent=Math.round(p.engineRPM/50)*50+' RPM';
  ui.section.textContent=s.sectionLabel.toUpperCase();
  ui.progress.textContent=(s.courseDistance/1000).toFixed(1)+' / '+(course.totalLength/1000).toFixed(1)+' KM';
  ui.worldStatus.textContent=s.offTrack?'OFF TRACK':'ON TRACK';
  ui.gLong.textContent=(t.longitudinalG>=0?'+':'')+t.longitudinalG.toFixed(2)+'g LONG';
  ui.gLat.textContent=(t.lateralG>=0?'+':'')+t.lateralG.toFixed(2)+'g LAT';
  ui.slip.textContent=Math.round(t.maxSlipRatio*100)+'% WHEEL SLIP';
  ui.grip.textContent=s.name+' • '+Math.round(s.grip*100)+'% μ';
  ui.drive.textContent=GravelRushVehicleConfig.powertrain.drivetrain+' • ABS • TCS';
  ui.controllerStatus.textContent=lastControllerInput&&lastControllerInput.connected
    ?'CONTROLLER CONNECTED'+(lastControllerInput.hapticsAvailable?' • HAPTICS':'')
    :'CONTROLLER: NOT CONNECTED';
}

function frame(now) {
  if(!running||!viewer||viewer.isDestroyed()||!vehicle) return;
  const dt=Math.min((now-lastFrame)/1000,.033);
  lastFrame=now;
  const inputs=readInput();
  updateController(inputs.controller,dt);

  const steps=Math.max(1,Math.ceil(dt/(1/120)));
  const stepDt=dt/steps;
  for(let i=0;i<steps;i++) {
    updateWheelGround();
    GravelRushPhysics.step(vehicle,inputs,stepDt);
    integratePosition(stepDt);
  }

  updateWheelGround();
  updateVisualParts();
  setCamera();
  updateHUD();

  if(window.GravelRushGamepad) GravelRushGamepad.updateVehicleHaptics(vehicle,inputs,now);
  requestAnimationFrame(frame);
}

ui.start.addEventListener('click',initializeWorld);
ui.camera.addEventListener('click',changeCamera);
ui.changeTrack.addEventListener('click',showTrackMenu);
ui.reset.addEventListener('click',resetCar);

window.addEventListener('keydown',event=>{
  keys.add(event.code);
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code)) event.preventDefault();
  if(event.code==='KeyR'&&!event.repeat) resetCar();
  if(event.code==='KeyC'&&!event.repeat) changeCamera();
  if(event.code==='KeyT'&&!event.repeat) showTrackMenu();
});
window.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',()=>keys.clear());

document.querySelectorAll('[data-control]').forEach(button=>{
  const control=button.dataset.control;
  const press=event=>{
    event.preventDefault(); touch.add(control); button.classList.add('active');
    if(button.setPointerCapture&&event.pointerId!==undefined) button.setPointerCapture(event.pointerId);
  };
  const release=event=>{
    event.preventDefault(); touch.delete(control); button.classList.remove('active');
  };
  button.addEventListener('pointerdown',press);
  button.addEventListener('pointerup',release);
  button.addEventListener('pointercancel',release);
  button.addEventListener('pointerleave',release);
});

renderTrackMenu();

if(new URLSearchParams(window.location.search).get('autostart')==='1') {
  setTimeout(()=>ui.start.click(),0);
}
