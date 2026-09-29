'use strict';

window.GravelRushTracks = (() => {
  const ORIGIN = {
    latitude: 34.25,
    longitude: -112.10,
    height: 30
  };

  const SURFACES = {
    ASPHALT: {
      name: 'ASPHALT',
      grip: 1.00,
      rolling: 1.00,
      width: 15,
      roughness: 0.010,
      bank: 0.035,
      color: '#44484f',
      terrainColor: '#75664c'
    },
    GRAVEL: {
      name: 'GRAVEL',
      grip: 0.76,
      rolling: 1.30,
      width: 17,
      roughness: 0.075,
      bank: 0.018,
      color: '#9a8e75',
      terrainColor: '#75664c'
    },
    DIRT: {
      name: 'LOOSE DIRT',
      grip: 0.68,
      rolling: 1.45,
      width: 17,
      roughness: 0.105,
      bank: 0.014,
      color: '#8a5b35',
      terrainColor: '#62432c'
    },
    MUD: {
      name: 'MUD',
      grip: 0.50,
      rolling: 2.10,
      width: 18,
      roughness: 0.13,
      bank: 0.008,
      color: '#4b382d',
      terrainColor: '#3d352e'
    },
    SAND: {
      name: 'DEEP SAND',
      grip: 0.58,
      rolling: 2.35,
      width: 20,
      roughness: 0.085,
      bank: 0.010,
      color: '#c7a86b',
      terrainColor: '#b88f52'
    },
    ROCK: {
      name: 'ROCKY TRAIL',
      grip: 0.79,
      rolling: 1.65,
      width: 15,
      roughness: 0.16,
      bank: 0.014,
      color: '#696765',
      terrainColor: '#565352'
    },
    SNOW: {
      name: 'PACKED SNOW',
      grip: 0.46,
      rolling: 1.55,
      width: 17,
      roughness: 0.045,
      bank: 0.014,
      color: '#e4e8eb',
      terrainColor: '#cfd7dd'
    },
    ICE: {
      name: 'ICE',
      grip: 0.23,
      rolling: 0.75,
      width: 18,
      roughness: 0.004,
      bank: 0.006,
      color: '#a8d3df',
      terrainColor: '#d5e7ed'
    }
  };

  const DEFINITIONS = [
    {
      id: 'redline',
      name: 'Redline Circuit',
      subtitle: 'Fast paved technical loop',
      surfaceKeys: ['ASPHALT'],
      terrainColor: '#6a624f',
      skyColor: '#88a9bd',
      points: [
        [0,0,0],[700,-80,4],[1350,180,12],[1750,720,22],
        [1500,1320,32],[850,1580,24],[150,1450,15],[-520,1080,8],
        [-820,470,4],[-650,-180,0],[-100,-420,0]
      ],
      bands: [[0,1,'ASPHALT','Redline Circuit']],
      samplesPerControl: 8
    },
    {
      id: 'dust-devil',
      name: 'Dust Devil Rally',
      subtitle: 'Gravel straights + loose dirt switchbacks',
      surfaceKeys: ['GRAVEL','DIRT'],
      terrainColor: '#776248',
      skyColor: '#97adba',
      points: [
        [0,0,0],[650,-180,12],[1250,-20,34],[1650,420,70],
        [1500,950,112],[950,1280,145],[320,1120,100],[-180,720,62],
        [-550,240,28],[-420,-330,8],[160,-520,0]
      ],
      bands: [
        [0,0.52,'GRAVEL','Dust Devil Gravel'],
        [0.52,1,'DIRT','Dust Devil Dirt']
      ],
      samplesPerControl: 8
    },
    {
      id: 'dune-runner',
      name: 'Dune Runner',
      subtitle: 'Rolling sand with hard-packed dirt',
      surfaceKeys: ['SAND','DIRT'],
      terrainColor: '#b48b53',
      skyColor: '#a9b8bd',
      points: [
        [0,0,0],[600,-240,15],[1280,-120,38],[1850,300,74],
        [1920,900,112],[1450,1380,80],[800,1480,42],[180,1200,18],
        [-420,820,4],[-620,260,0],[-390,-330,6],[120,-520,10]
      ],
      bands: [
        [0,0.68,'SAND','Dune Sand'],
        [0.68,1,'DIRT','Hard-pack Return']
      ],
      samplesPerControl: 8
    },
    {
      id: 'frostbite',
      name: 'Frostbite Loop',
      subtitle: 'Packed snow and slick ice',
      surfaceKeys: ['SNOW','ICE'],
      terrainColor: '#cad7dc',
      skyColor: '#9fb4c2',
      points: [
        [0,0,0],[520,-100,5],[1050,100,16],[1340,520,28],
        [1200,1020,38],[720,1290,30],[120,1220,18],[-430,900,10],
        [-680,380,2],[-520,-120,0],[-60,-330,0]
      ],
      bands: [
        [0,0.58,'SNOW','Frostbite Snow'],
        [0.58,1,'ICE','Frozen Lake']
      ],
      samplesPerControl: 8
    },
    {
      id: 'quarry',
      name: 'Quarry Run',
      subtitle: 'Rocky climb with gravel descent',
      surfaceKeys: ['ROCK','GRAVEL'],
      terrainColor: '#5b5954',
      skyColor: '#879aa5',
      points: [
        [0,0,0],[450,-150,25],[900,-40,80],[1250,280,145],
        [1220,780,210],[850,1100,245],[360,1000,205],[-80,680,140],
        [-360,260,70],[-260,-180,20],[100,-330,0]
      ],
      bands: [
        [0,0.55,'ROCK','Quarry Climb'],
        [0.55,1,'GRAVEL','Gravel Descent']
      ],
      samplesPerControl: 8
    },
    {
      id: 'bogline',
      name: 'Bogline',
      subtitle: 'Mud basin with dirt escape roads',
      surfaceKeys: ['MUD','DIRT'],
      terrainColor: '#4c4938',
      skyColor: '#879794',
      points: [
        [0,0,0],[560,-90,2],[1080,130,3],[1340,580,6],
        [1100,1050,4],[560,1220,1],[-20,1060,0],[-480,700,1],
        [-630,220,0],[-420,-250,1],[70,-390,0]
      ],
      bands: [
        [0,0.62,'MUD','Bogline Mud'],
        [0.62,1,'DIRT','Dry Dirt Exit']
      ],
      samplesPerControl: 8
    }
  ];

  function catmullRom(p0,p1,p2,p3,t) {
    const t2=t*t;
    const t3=t2*t;
    const c=(a,b,c,d)=>0.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);
    return {x:c(p0.x,p1.x,p2.x,p3.x),y:c(p0.y,p1.y,p2.y,p3.y),z:c(p0.z,p1.z,p2.z,p3.z)};
  }

  function createTrack(id) {
    const definition = DEFINITIONS.find(track => track.id === id) || DEFINITIONS[0];
    const control = definition.points.map(([x,y,z])=>({x,y,z:ORIGIN.height+z}));
    const samples=[];
    const n=control.length;
    const per=definition.samplesPerControl || 8;

    for(let i=0;i<n;i++) {
      const p0=control[(i-1+n)%n];
      const p1=control[i];
      const p2=control[(i+1)%n];
      const p3=control[(i+2)%n];
      for(let j=0;j<per;j++) samples.push(catmullRom(p0,p1,p2,p3,j/per));
    }

    let totalLength=0;
    for(let i=0;i<samples.length;i++) {
      const next=samples[(i+1)%samples.length];
      const length=Math.hypot(next.x-samples[i].x,next.y-samples[i].y);
      samples[i].segmentLength=length;
      samples[i].distance=totalLength;
      totalLength+=length;
    }

    function sectionForProgress(progress) {
      const p=((progress%1)+1)%1;
      for(const [start,end,key,label] of definition.bands) {
        if(p>=start && p<end) return {key,label,surface:SURFACES[key]};
      }
      const fallback=definition.bands[0];
      return {key:fallback[2],label:fallback[3],surface:SURFACES[fallback[2]]};
    }

    for(let i=0;i<samples.length;i++) {
      const prev=samples[(i-1+samples.length)%samples.length];
      const next=samples[(i+1)%samples.length];
      const tx=next.x-prev.x;
      const ty=next.y-prev.y;
      const len=Math.hypot(tx,ty)||1;
      samples[i].tx=tx/len;
      samples[i].ty=ty/len;
      samples[i].progress=samples[i].distance/totalLength;
      const section=sectionForProgress(samples[i].progress);
      samples[i].surfaceKey=section.key;
      samples[i].sectionLabel=section.label;
      samples[i].width=section.surface.width;

      const a=samples[(i-2+samples.length)%samples.length];
      const b=samples[(i+2)%samples.length];
      const inX=samples[i].x-a.x;
      const inY=samples[i].y-a.y;
      const outX=b.x-samples[i].x;
      const outY=b.y-samples[i].y;
      samples[i].turnSign=Math.sign(inX*outY-inY*outX);
    }

    function nearestPoint(x,y) {
      let best=null;
      for(let i=0;i<samples.length;i++) {
        const a=samples[i];
        const b=samples[(i+1)%samples.length];
        const vx=b.x-a.x, vy=b.y-a.y;
        const len2=vx*vx+vy*vy||1;
        const t=Math.max(0,Math.min(1,((x-a.x)*vx+(y-a.y)*vy)/len2));
        const px=a.x+vx*t, py=a.y+vy*t;
        const dx=x-px, dy=y-py;
        const distance2=dx*dx+dy*dy;
        if(!best || distance2<best.distance2) {
          const segmentLength=Math.sqrt(len2);
          const nx=-vy/segmentLength, ny=vx/segmentLength;
          const lateral=dx*nx+dy*ny;
          const courseDistance=a.distance+segmentLength*t;
          const progress=courseDistance/totalLength;
          best={
            index:i,t,x:px,y:py,z:a.z+(b.z-a.z)*t,
            distance2,distanceFromCenter:Math.sqrt(distance2),lateral,
            tangentX:vx/segmentLength,tangentY:vy/segmentLength,
            courseDistance,progress,section:sectionForProgress(progress),
            turnSign:a.turnSign||0
          };
        }
      }
      return best;
    }

    function roughnessHeight(surface,x,y,offTrackScale=1) {
      const wave=Math.sin(x*.051)*.45+Math.sin(y*.069+1.7)*.35+Math.sin((x+y)*.027)*.20;
      return wave*surface.roughness*offTrackScale;
    }

    function heightAt(x,y) {
      const near=nearestPoint(x,y);
      const surface=near.section.surface;
      const onTrack=near.distanceFromCenter<=surface.width*.60;
      const bankAngle=surface.bank*near.turnSign;
      const bankHeight=near.lateral*Math.tan(bankAngle);
      const rough=roughnessHeight(surface,x,y,onTrack?1:2.0);
      return near.z+bankHeight+rough;
    }

    function surfaceAt(x,y) {
      const near=nearestPoint(x,y);
      const base=near.section.surface;
      const halfWidth=base.width*.5;
      if(near.distanceFromCenter<=halfWidth) {
        return {
          ...base,key:near.section.key,sectionLabel:near.section.label,
          offTrack:false,distanceFromTrack:near.distanceFromCenter,
          progress:near.progress,courseDistance:near.courseDistance
        };
      }

      const far=near.distanceFromCenter>halfWidth+25;
      return {
        ...base,key:'OFFTRACK_'+near.section.key,
        name:far?'OFF-TRACK TERRAIN':base.name+' SHOULDER',
        grip:base.grip*(far?.62:.78),
        rolling:base.rolling*(far?1.85:1.42),
        sectionLabel:near.section.label,offTrack:true,
        distanceFromTrack:near.distanceFromCenter,
        progress:near.progress,courseDistance:near.courseDistance
      };
    }

    function spawn() {
      const a=samples[0], b=samples[1];
      return {
        x:a.x,y:a.y,z:heightAt(a.x,a.y),
        heading:Math.atan2(b.x-a.x,b.y-a.y)
      };
    }

    return {
      ...definition,
      ORIGIN,
      SURFACES,
      samples,
      totalLength,
      nearestPoint,
      heightAt,
      surfaceAt,
      sectionForProgress,
      spawn
    };
  }

  function list() {
    return DEFINITIONS.map(track => ({
      id:track.id,
      name:track.name,
      subtitle:track.subtitle,
      surfaces:track.surfaceKeys.map(key=>SURFACES[key].name)
    }));
  }

  return { ORIGIN, SURFACES, list, createTrack };
})();
