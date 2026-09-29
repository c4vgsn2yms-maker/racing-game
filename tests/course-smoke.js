'use strict';

const assert=require('node:assert/strict');
global.window=globalThis;

require('../src/physics/math.js');
require('../src/physics/vehicle-config.js');
require('../src/physics/tire-model.js');
require('../src/physics/powertrain.js');
require('../src/physics/vehicle-dynamics.js');
require('../src/world/course-data.js');

const metas=GravelRushTracks.list();
assert.equal(metas.length,6,'six selectable tracks should exist');

for(const meta of metas) {
  const track=GravelRushTracks.createTrack(meta.id);
  assert.ok(track.samples.length>=80 && track.samples.length<=100,
    meta.name+' should stay lightweight');
  assert.ok(track.totalLength>2500 && track.totalLength<12000,
    meta.name+' should be a compact standalone track');
  assert.ok(track.surfaceKeys.length>=1 && track.surfaceKeys.length<=2,
    meta.name+' should use only one or two terrains');

  const seen=new Set(track.samples.map(p=>p.surfaceKey));
  for(const key of seen) assert.ok(track.surfaceKeys.includes(key));

  for(let i=0;i<track.samples.length;i+=11) {
    const p=track.samples[i];
    assert.ok(Number.isFinite(track.heightAt(p.x,p.y)),meta.name+' height should be finite');
    const s=track.surfaceAt(p.x,p.y);
    assert.ok(s.grip>0 && s.rolling>0,meta.name+' surface physics should be valid');
  }

  const spawn=track.spawn();
  assert.ok(Number.isFinite(spawn.heading));
  assert.ok(Number.isFinite(spawn.z));
  const off=track.surfaceAt(spawn.x+180,spawn.y+180);
  assert.ok(off.offTrack,meta.name+' should detect off-track terrain');
}

const asphalt=GravelRushTracks.createTrack('redline').surfaceAt(0,0);
const iceTrack=GravelRushTracks.createTrack('frostbite');
const icePoint=iceTrack.samples.find(p=>p.surfaceKey==='ICE');
const ice=iceTrack.surfaceAt(icePoint.x,icePoint.y);
assert.ok(asphalt.grip>ice.grip,'asphalt should retain more grip than ice');

console.log('Selectable track smoke tests passed.');
