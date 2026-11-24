/* AETHER — On-device hand tracking and audio synthesis. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = Object.fromEntries([
    'camera','visuals','stage','standby','startBtn','powerBtn','cameraStatus','trackingStatus','statusLight',
    'fpsLabel','modeMini','stageInstruction','interactionHint','coordinate','currentNote','liveNote','toast',
    'miniKeyboard','preset','root','scale','octave','octaveValue','reverb','delay','cutoff','cutoffValue','space','spaceValue',
    'visualTheme','particles','skeleton','connections','trails','volume','volumeValue','mirrorBtn','fullscreenBtn',
    'recordBtn','recordText','recIndicator','recordTime','muteBtn','helpBtn','helpDialog','closeHelp','dismissHelp', 'performanceProfile','deviceHint',
    'presetPreview','presetDescription','beatToggle','beatStyle','bpm','bpmValue','beatVolume','beatVolumeValue','drive','driveValue','beatStatus'
  ].map((id) => [id, $(id)]));

  const CONFIG = {
    mode: 'harp', preset: 'glass', root: 'C', scale: 'pentatonic', octave: 4,
    volume: .75, reverb: true, delay: true, cutoff: 8000, space: .35, drive: .5, beatVolume: .48,
    visual: 'aurora', particles: true, skeleton: true, connections: true, trails: true, mirror: true, performance: 'auto',
  };
  const NOTE_INDEX = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, Bb: 10};
  const NOTE_NAMES = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
  const SCALES = {
    pentatonic: [0,2,4,7,9], major: [0,2,4,5,7,9,11],
    minor: [0,2,3,5,7,8,10], dorian: [0,2,3,5,7,9,10],
    chromatic: [0,1,2,3,4,5,6,7,8,9,10,11]
  };
  const CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
    [5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],
    [13,17],[17,18],[18,19],[19,20],[0,17]
  ];
  const PALETTES = {
    aurora: ['#a58fff','#5ce8e7','#ef9dff','#ffffff'],
    ember: ['#ff8b73','#ffd279','#ff4e92','#ffffff'],
    ice: ['#71c6ff','#bafff0','#86a0ff','#ffffff'],
    mono: ['#ebedf5','#a8b3cd','#dcd7f3','#ffffff']
  };
  const INSTRUCTIONS = {
    harp: ['LASER HARP','MOVE YOUR FINGERS THROUGH THE BEAMS TO PLAY',
      'Move your index fingers left and right across the glowing vertical strings. Each crossing triggers a note.'],
    keys: ['AIR KEYS','LOWER YOUR FINGERS INTO THE KEY ZONES TO PLAY',
      'Tap the illuminated key zones with your index or middle fingertips. Lift away to repeat a note.'],
    theremin: ['THEREMIN','PINCH TO SING · MOVE TO CHANGE PITCH AND VOLUME',
      'Pinch thumb to index finger to sustain a note. Right-hand X controls pitch, Y controls volume; left hand shapes the filter.']
  };

  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const lerp = (a,b,t) => a + (b - a) * t;
  const freqFromMidi = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  const noteName = (midi) => `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  const noteMidi = (index) => {
    const scale = SCALES[CONFIG.scale];
    return 12 * (CONFIG.octave + 1) + NOTE_INDEX[CONFIG.root] +
      12 * Math.floor(index / scale.length) + scale[index % scale.length];
  };
  const midpointDistance = (a,b) => Math.hypot(a.x - b.x, a.y - b.y);

  class SoundEngine {
    constructor() { this.ctx = null; this.recorder = null; this.chunks = []; this.muted = false; }
    async ensure() {
      if (this.ctx) {
        if (this.ctx.state !== 'running') {
          await this.ctx.resume();
          if (this.ctx.state !== 'running') throw new Error('Audio is paused by your browser. Tap Preview or a keyboard note to retry.');
        }
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio API is not supported by this browser.');
      const ctx = this.ctx = new AC();
      // Unlock audio synchronously in the user's tap/click before the first await.
      // iOS Safari can create a context in the suspended state.
      const silent = ctx.createBufferSource();
      silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      silent.connect(ctx.destination);
      silent.start(0);
      const audioReady = ctx.state === 'running' ? Promise.resolve() : ctx.resume();
      this.bus = ctx.createGain(); this.bus.gain.value = .8;
      this.toneFilter = ctx.createBiquadFilter(); this.toneFilter.type = 'lowpass';
      this.toneFilter.frequency.value = CONFIG.cutoff; this.toneFilter.Q.value = .6;
      this.master = ctx.createGain(); this.master.gain.value = CONFIG.volume;
      this.bus.connect(this.toneFilter);
      this.toneFilter.connect(this.master);
      this.delayNode = ctx.createDelay(1.5); this.delayNode.delayTime.value = .27;
      this.delayFeedback = ctx.createGain(); this.delayFeedback.gain.value = .28;
      this.delayWet = ctx.createGain(); this.delayWet.gain.value = CONFIG.delay ? .21 : 0;
      this.toneFilter.connect(this.delayNode);
      this.delayNode.connect(this.delayFeedback); this.delayFeedback.connect(this.delayNode);
      this.delayNode.connect(this.delayWet); this.delayWet.connect(this.master);
      this.convolver = ctx.createConvolver();
      this.convolver.buffer = this.makeImpulse(ctx, 1.8, 2.6);
      this.reverbWet = ctx.createGain(); this.reverbWet.gain.value = CONFIG.reverb ? CONFIG.space : 0;
      this.toneFilter.connect(this.convolver); this.convolver.connect(this.reverbWet); this.reverbWet.connect(this.master);
      this.mediaDest = ctx.createMediaStreamDestination();
      this.limiter=ctx.createDynamicsCompressor();
      this.limiter.threshold.value=-14;
      this.limiter.knee.value=10;
      this.limiter.ratio.value=8;
      this.limiter.attack.value=.003;
      this.limiter.release.value=.19;
      this.master.connect(this.limiter);
      this.limiter.connect(ctx.destination);
      this.limiter.connect(this.mediaDest);
      this.groove=new window.AetherGroove.Bank(ctx,this.bus,this.master);
      this.groove.drumBus.gain.value=CONFIG.beatVolume;
      this.groove.drive=CONFIG.drive;
      this.thereminGain = ctx.createGain(); this.thereminGain.gain.value = 0;
      this.thereminGain.connect(this.bus);
      this.thereminA = ctx.createOscillator(); this.thereminA.type = 'sine';
      this.thereminB = ctx.createOscillator(); this.thereminB.type = 'triangle';
      this.thereminBGain = ctx.createGain(); this.thereminBGain.gain.value = .16;
      this.thereminA.connect(this.thereminGain);
      this.thereminB.connect(this.thereminBGain); this.thereminBGain.connect(this.thereminGain);
      this.thereminA.start(); this.thereminB.start();
      this.updateTimbre();
      this.setEffects();
      await audioReady;
      if (ctx.state !== 'running') throw new Error('Audio is paused by your browser. Tap Preview or a keyboard note to retry.');
    }
    makeImpulse(ctx, seconds, decay) {
      const length = Math.floor(ctx.sampleRate * seconds);
      const b = ctx.createBuffer(2, length, ctx.sampleRate);
      for (let ch=0; ch<2; ch++) {
        const samples = b.getChannelData(ch);
        for (let i=0; i<length; i++) samples[i] = (Math.random()*2-1) * Math.pow(1-i/length, decay);
      }
      return b;
    }
    setEffects() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.muted ? 0 : CONFIG.volume, t, .025);
      this.toneFilter.frequency.setTargetAtTime(CONFIG.cutoff, t, .07);
      this.reverbWet.gain.setTargetAtTime(CONFIG.reverb ? CONFIG.space : 0, t, .06);
      this.delayWet.gain.setTargetAtTime(CONFIG.delay ? .21 : 0, t, .06);
    }
    playNote(midi, velocity = .75) {
      if (!this.ctx) return;
      if (this.groove.playNote(CONFIG.preset,midi,velocity)) return;
      const ctx = this.ctx, now = ctx.currentTime + .004, hz = freqFromMidi(midi);
      const voice = ctx.createGain(); voice.gain.setValueAtTime(.0001, now);
      const v = clamp(velocity, .24, 1);
      const sounds = {
        glass: {partials: [['sine',1,.9],['sine',2.01,.24],['sine',3.98,.11]],attack:.008,duration:1.75},
        pluck: {partials: [['triangle',1,.67],['sawtooth',2,.13]],attack:.006,duration:.88},
        dream: {partials: [['sine',1,.7],['triangle',1.005,.26],['sine',2,.2]],attack:.12,duration:2.9},
        bass: {partials: [['sine',.5,.74],['triangle',1,.23]],attack:.012,duration:1.12}
      };
      const preset = sounds[CONFIG.preset];
      const decay = preset.duration, attack = preset.attack;
      voice.gain.linearRampToValueAtTime(.26*v, now + attack);
      voice.gain.exponentialRampToValueAtTime(.0001, now + decay);
      voice.connect(this.bus);
      for (const [type, ratio, level] of preset.partials) {
        const osc = ctx.createOscillator(), amount = ctx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(hz * ratio, now);
        amount.gain.value = level; osc.connect(amount); amount.connect(voice);
        osc.start(now); osc.stop(now + decay + .055);
      }
    }
    updateTimbre() {
      if (!this.ctx) return;
      const presets={
        guitarClean:['triangle','sawtooth',.11],
        guitarDrive:['sawtooth','square',.19],
        synthLead:['sawtooth','sawtooth',.27],
        synthPad:['sawtooth','triangle',.29],
        trancePluck:['sawtooth','square',.21],
        acid303:['sawtooth','square',.29],
        technoStab:['sawtooth','square',.22],
        technoBass:['square','sine',.23],
        hiphop808:['sine','triangle',.12],
        lofiKeys:['triangle','sine',.14]
      };
      const [a,b,level]=presets[CONFIG.preset]||['sine','triangle',.16];
      this.thereminA.type=a;
      this.thereminB.type=b;
      this.thereminBGain.gain.setTargetAtTime(level,this.ctx.currentTime,.02);
    }
    updateTheremin(active, midi, volume, filterHz = CONFIG.cutoff) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const hz = freqFromMidi(midi);
      this.thereminA.frequency.setTargetAtTime(hz, t, .045);
      this.thereminB.frequency.setTargetAtTime(hz*1.003, t, .05);
      this.thereminGain.gain.setTargetAtTime(active ? .26*clamp(volume,.05,1) : 0, t, .05);
      this.toneFilter.frequency.setTargetAtTime(clamp(filterHz,250,14000), t, .06);
    }
    stopTheremin() {
      if (!this.ctx) return;
      this.thereminGain.gain.setTargetAtTime(0, this.ctx.currentTime, .035);
      this.toneFilter.frequency.setTargetAtTime(CONFIG.cutoff, this.ctx.currentTime, .06);
    }
  }

  // Profiles favor interactivity over the highest image resolution. Tracking FPS
  // and display FPS are measured separately; neither is a promise of device FPS.
  const PROFILES = {
    mobile:  {width:480, height:640, complexity:0, interval:30, dpr:1, particles:65, glow:0},
    tablet:  {width:640, height:480, complexity:0, interval:28, dpr:1, particles:85, glow:0},
    desktop: {width:640, height:480, complexity:0, interval:28, dpr:1, particles:110, glow:0},
    smooth:  {width:640, height:480, complexity:0, interval:28, dpr:1, particles:110, glow:0},
    balanced:{width:960, height:540, complexity:0, interval:33, dpr:1.25, particles:160, glow:3},
    quality: {width:1280,height:720, complexity:1, interval:40, dpr:1.5, particles:210, glow:7}
  };
  const device = {kind:'desktop', orientation:'landscape'};
  function updateDeviceMode() {
    const coarse = window.matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    const smallScreen = Math.min(screen.width, screen.height) <= 600;
    const compact = window.innerWidth <= 700;
    const nextKind = coarse ? (smallScreen || compact ? 'mobile' : 'tablet') : 'desktop';
    const nextOrientation = window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
    const changed = device.kind !== nextKind;
    device.kind = nextKind;
    device.orientation = nextOrientation;
    document.body.dataset.device = nextKind;
    document.body.dataset.orientation = nextOrientation;
    const captions = {
      mobile: nextOrientation === 'portrait'
        ? 'Mobile mode · Front camera · Rotate your phone for a wider stage'
        : 'Mobile mode · Front camera · Touch-friendly controls',
      tablet: 'Tablet mode · Touch-friendly controls',
      desktop: 'Desktop mode · Keyboard and pointer controls'
    };
    els.deviceHint.textContent = captions[nextKind];
    if (changed && camera.active && CONFIG.performance === 'auto') {
      toast('Device layout updated. Restart the camera to apply the new resolution.', 4500);
    }
    resizeCanvas();
  }
  const profile = () => PROFILES[CONFIG.performance === 'auto' ? device.kind : CONFIG.performance];
  const sound = new SoundEngine();
  const camera = {active:false, stream:null, hands:null, processing:false, lastProcess:0, fpsCount:0, fpsStart:0, framesPerSecond:0, tracks:[], previous:new Map(), lastTriggered:new Map(), padZones:new Map(), lastSeen:0, renderCount:0, renderFpsStart:0, renderFps:0, videoFrameCallback:false, pendingVideoCallback:0, activeSession:0};
  const canvas = els.visuals, ctx2 = canvas.getContext('2d', {alpha:true});
  const beamCache = document.createElement('canvas');
  const beamCtx = beamCache.getContext('2d', {alpha:true});
  const graphic = {w:0,h:0,dpr:1,particles:[],trails:new Map(),hits:[],lastTick:0, renderQueued:false, smoothedHands:[], lastRenderedHands:0};
  let beamsDirty = true;
  const invalidateBeams = () => {beamsDirty=true;requestRender();};
  function requestRender(){
    if (!graphic.renderQueued) {graphic.renderQueued=true;requestAnimationFrame(render);}
  }
  let toastTimer = null, noteTimer = null, recordClock = null, recordedAt = 0;
  const setText = (id, text) => { els[id].textContent = text; };
  function toast(text, duration=3200) {
    els.toast.textContent = text; els.toast.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => els.toast.hidden = true, duration);
  }

  function resizeCanvas() {
    const rect = els.stage.getBoundingClientRect();
    graphic.w = rect.width; graphic.h = rect.height;
    // DPR=2 on Retina means 4x as many canvas pixels. One physical pixel
    // per stage CSS pixel is enough for moving neon overlays.
    graphic.dpr = Math.min(window.devicePixelRatio || 1, profile().dpr);
    const w=Math.round(rect.width*graphic.dpr), h=Math.round(rect.height*graphic.dpr);
    if(canvas.width!==w || canvas.height!==h){
      canvas.width=w;canvas.height=h;
      ctx2.setTransform(graphic.dpr,0,0,graphic.dpr,0,0);
      beamsDirty=true;
    }
    requestRender();
  }
  function getScreenPoint(lm) {
    const v = els.camera, w = graphic.w, h = graphic.h;
    const vw = v.videoWidth || 1280, vh = v.videoHeight || 720;
    const scale = Math.max(w / vw, h / vh), paintedW = vw * scale, paintedH = vh * scale;
    const x = (w-paintedW)/2 + lm.x*paintedW;
    return {x: CONFIG.mirror ? w-x : x, y: (h-paintedH)/2 + lm.y*paintedH};
  }

  const color = (i) => PALETTES[CONFIG.visual][i % 4];
  function addParticles(x,y,num=8,velocity=1,colorIndex=0) {
    if (!CONFIG.particles) return;
    const palette = PALETTES[CONFIG.visual];
    num=Math.min(num,Math.max(0,profile().particles-graphic.particles.length));
    for(let i=0;i<num;i++) {
      const a = Math.random()*Math.PI*2, speed = (1+Math.random()*3.1)*velocity;
      graphic.particles.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:380+Math.random()*520,max:900,size:.7+Math.random()*2.1,c:palette[(colorIndex+i)%3]});
    }
    if(graphic.particles.length>profile().particles) graphic.particles.splice(0,graphic.particles.length-profile().particles);
  }
  function burst(x,y,index) {
    graphic.hits.push({x,y,t:performance.now(),c:color(index)});
    if(graphic.hits.length>15)graphic.hits.shift();
    addParticles(x,y,8,1.35,index);
    requestRender();
  }
  function drawGlowLine(x1,y1,x2,y2,c,thickness=1.5,light=.8) {
    // Draw each hand segment once to keep the tracking overlay lightweight.
    ctx2.globalCompositeOperation='source-over';
    ctx2.globalAlpha=light;ctx2.strokeStyle=c;ctx2.lineWidth=thickness;
    ctx2.shadowBlur=profile().glow;ctx2.shadowColor=c;
    ctx2.beginPath();ctx2.moveTo(x1,y1);ctx2.lineTo(x2,y2);ctx2.stroke();
    ctx2.shadowBlur=0;ctx2.globalAlpha=1;
  }
  function drawStaticBeams() {
    const {w,h} = graphic;
    ctx2.save();
    if(CONFIG.mode==='harp') {
      for(let i=0;i<8;i++) {
        const x=w*(.13 + i*.74/7);
        const wash=ctx2.createLinearGradient(0,h*.13,0,h*.9);
        wash.addColorStop(0,'transparent');wash.addColorStop(.22,color(i));wash.addColorStop(.77,color(i));wash.addColorStop(1,'transparent');
        ctx2.globalAlpha=.23; ctx2.strokeStyle=wash; ctx2.lineWidth=1.5;
        ctx2.shadowColor=color(i);ctx2.shadowBlur=12;
        ctx2.beginPath();ctx2.moveTo(x,h*.13);ctx2.lineTo(x,h*.9);ctx2.stroke();
        ctx2.globalAlpha=.65;ctx2.shadowBlur=0;ctx2.fillStyle=color(i);
        ctx2.fillRect(x-2.5,h*.88,5,5);
        ctx2.globalAlpha=.75;ctx2.font='600 10px Space Grotesk, sans-serif';ctx2.textAlign='center';
        ctx2.fillText(noteName(noteMidi(i)),x,h*.94);
      }
    } else if(CONFIG.mode==='keys') {
      const left=w*.08, available=w*.84, zoneW=available/8, top=h*.65,bottom=h*.9;
      for(let i=0;i<8;i++) {
        const x=left+i*zoneW+3, width=zoneW-6;
        ctx2.globalAlpha=.48;ctx2.strokeStyle=color(i);ctx2.fillStyle=color(i)+'21';
        ctx2.lineWidth=1;ctx2.shadowColor=color(i);ctx2.shadowBlur=11;
        ctx2.beginPath();ctx2.roundRect(x,top,width,bottom-top,5);ctx2.fill();ctx2.stroke();
        ctx2.globalAlpha=.8;ctx2.shadowBlur=0;ctx2.fillStyle='#e2e5f9';
        ctx2.font='600 11px Space Grotesk,sans-serif';ctx2.textAlign='center';
        ctx2.fillText(noteName(noteMidi(i)),x+width/2,top+((bottom-top)/2)+4);
      }
    } else {
      const positions=[.17,.32,.48,.63,.78];
      ctx2.lineWidth=1;ctx2.globalAlpha=.23;ctx2.strokeStyle=color(0);
      for(const y of positions){ctx2.beginPath();ctx2.moveTo(w*.07,h*y);ctx2.lineTo(w*.93,h*y);ctx2.stroke();}
      for(let i=0;i<8;i++) {
        const x=w*(.09+i*.82/7);
        ctx2.globalAlpha=.38;ctx2.fillStyle=color(i);ctx2.beginPath();ctx2.arc(x,h*.91,3,0,Math.PI*2);ctx2.fill();
      }
      ctx2.textAlign='center';ctx2.font='600 10px Space Grotesk,sans-serif';ctx2.fillStyle='#bbc0d3';ctx2.globalAlpha=.8;
      ctx2.fillText('← LOW PITCH',w*.15,h*.965);ctx2.fillText('HIGH PITCH →',w*.86,h*.965);
    }
    ctx2.restore();
  }
  function rebuildBeamCache(){
    if(!graphic.w||!graphic.h)return;
    ctx2.clearRect(0,0,graphic.w,graphic.h);
    drawStaticBeams();
    beamCache.width=canvas.width;beamCache.height=canvas.height;
    beamCtx.clearRect(0,0,beamCache.width,beamCache.height);
    beamCtx.drawImage(canvas,0,0);
    beamsDirty=false;
  }
  function visualHits(now){
    for (let i=graphic.hits.length-1;i>=0;i--) {
      const hit=graphic.hits[i], p=(now-hit.t)/460;
      if(p>1){graphic.hits.splice(i,1);continue;}
      const alpha=1-p;
      ctx2.save();ctx2.globalCompositeOperation='lighter';ctx2.strokeStyle=hit.c;ctx2.shadowColor=hit.c;ctx2.shadowBlur=profile().glow;
      ctx2.globalAlpha=alpha*.8;ctx2.lineWidth=2;
      ctx2.beginPath();ctx2.arc(hit.x,hit.y,8+p*52,0,Math.PI*2);ctx2.stroke();
      ctx2.globalAlpha=alpha;ctx2.fillStyle='#fff';ctx2.beginPath();ctx2.arc(hit.x,hit.y,2+(1-p)*3,0,Math.PI*2);ctx2.fill();ctx2.restore();
    }
  }
  function visualsHands(now,dt) {
    const hands=camera.tracks;
    // Exponential smoothing reduces tracking jitter at 15-30 detection FPS.
    // Use the unfiltered points for triggers to avoid introducing note latency.
    const alpha=1-Math.exp(-Math.max(1,dt)/27);
    if(graphic.smoothedHands.length!==hands.length){
      graphic.smoothedHands=hands.map(hand=>({pinch:hand.pinch,points:hand.points.map(p=>({...p}))}));
    }else{
      hands.forEach((hand,i)=>{
        const displayed=graphic.smoothedHands[i];displayed.pinch=hand.pinch;
        hand.points.forEach((p,j)=>{displayed.points[j].x+=alpha*(p.x-displayed.points[j].x);displayed.points[j].y+=alpha*(p.y-displayed.points[j].y);});
      });
    }
    const visualHands=graphic.smoothedHands;
    ctx2.save();
    if(CONFIG.connections && visualHands.length===2) {
      const a=visualHands[0].points,b=visualHands[1].points;
      for(const [i,j] of [[8,8],[12,12],[4,4],[20,20],[8,12]]) {
        drawGlowLine(a[i].x,a[i].y,b[j].x,b[j].y,color(i+j),1.2,.45);
      }
    }
    visualHands.forEach((hand,idx)=>{
      const pts=hand.points;
      if(CONFIG.skeleton){
        for(const [a,b] of CONNECTIONS) drawGlowLine(pts[a].x,pts[a].y,pts[b].x,pts[b].y,color(idx),1.1,.5);
        ctx2.fillStyle=color(idx);ctx2.globalAlpha=.9;
        for(const i of [0,4,8,12,16,20]) {
          const p=pts[i];ctx2.beginPath();ctx2.arc(p.x,p.y,i===8?4:2.7,0,Math.PI*2);ctx2.fill();
        }
        ctx2.globalAlpha=1;
      }
      for(const tipIndex of [8,12]) {
        const p=pts[tipIndex];
        ctx2.fillStyle=color(idx+tipIndex);ctx2.globalAlpha=.95;
        ctx2.beginPath();ctx2.arc(p.x,p.y,4,0,Math.PI*2);ctx2.fill();ctx2.globalAlpha=1;
      }
      if(hand.pinch) drawGlowLine(pts[4].x,pts[4].y,pts[8].x,pts[8].y,color(idx),3,1);
    });
    if(CONFIG.trails) {
      for(const [key, points] of graphic.trails.entries()) {
        while(points.length && now-points[0].t>720) points.shift();
        if(points.length<2){if(!points.length)graphic.trails.delete(key);continue;}
        const shade=color(Number(key.split(':')[0])||0);
        // Every second trail segment is enough for smooth movement, with half
        // the costly line work. Keep the trail on the visual layer only.
        for(let i=2;i<points.length;i+=2) {
          const strength=(1-(now-points[i].t)/650) * i/points.length;
          if(strength>.03)drawGlowLine(points[i-2].x,points[i-2].y,points[i].x,points[i].y,shade,2*strength+1,strength*.8);
        }
      }
    }
    ctx2.restore();
  }
  function visualsParticles(dt) {
    if(!CONFIG.particles) {graphic.particles.length=0;return;}
    ctx2.save();ctx2.globalCompositeOperation='lighter';
    for(let i=graphic.particles.length-1;i>=0;i--){
      const p=graphic.particles[i];p.life-=dt;
      if(p.life<=0){graphic.particles.splice(i,1);continue;}
      const f=dt/16.67; p.x+=p.vx*f;p.y+=p.vy*f;p.vx*=.986;p.vy*=.986;
      ctx2.globalAlpha=clamp(p.life/p.max,0,1);
      ctx2.fillStyle=p.c;
      ctx2.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);
    }
    ctx2.restore();
  }
  function render(now) {
    graphic.renderQueued=false;
    if(document.hidden)return;
    const dt=clamp(now-(graphic.lastTick||now),0,42);graphic.lastTick=now;
    if(graphic.w&&graphic.h) {
      if(beamsDirty)rebuildBeamCache();
      ctx2.clearRect(0,0,graphic.w,graphic.h);
      if(camera.active){
        ctx2.drawImage(beamCache,0,0,graphic.w,graphic.h);
        if(now-camera.lastSeen>400){camera.tracks=[];graphic.smoothedHands=[];}
        visualHits(now);visualsHands(now,dt);
      }
      visualsParticles(dt);
    }
    if(camera.active || graphic.hits.length || graphic.particles.length)requestRender();
    if(camera.active){
      camera.renderCount++;
      if(now-camera.renderFpsStart>=1000){
        camera.renderFps=Math.round(camera.renderCount*1000/(now-camera.renderFpsStart));
        camera.renderFpsStart=now;camera.renderCount=0;
        els.fpsLabel.textContent=`${camera.framesPerSecond} TRACK / ${camera.renderFps} FPS`;
      }
    }
  }

  let lastShownMidi=null,lastShownAt=0;
  function showNote(midi,source='camera') {
    const now=performance.now();
    if(source==='continuous' && midi===lastShownMidi && now-lastShownAt<750)return;
    lastShownMidi=midi;lastShownAt=now;
    els.currentNote.textContent=noteName(midi);els.liveNote.hidden=false;
    clearTimeout(noteTimer);noteTimer=setTimeout(()=>els.liveNote.hidden=true,1000);
    for(const key of els.miniKeyboard.children){
      if(Number(key.dataset.midi)!==midi)continue;
      key.classList.add('playing');setTimeout(()=>key.classList.remove('playing'),260);
      break;
    }
  }
  function triggerNote(index, x=graphic.w/2,y=graphic.h/2, velocity=.8) {
    const midi=noteMidi(index);
    sound.playNote(midi,velocity);showNote(midi);
    burst(x,y,index);
  }
  function setMode(mode) {
    CONFIG.mode=mode;
    for (const b of document.querySelectorAll('[data-mode]')) {
      const selected=b.dataset.mode===mode;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));
    }
    const [label,step,hint]=INSTRUCTIONS[mode];
    els.modeMini.textContent=`/ ${label}`;
    els.stageInstruction.textContent=step;
    els.interactionHint.innerHTML=`<span>✦</span> ${hint}`;
    camera.padZones.clear();camera.previous.clear();camera.lastTriggered.clear();
    graphic.trails.clear();graphic.smoothedHands=[];
    invalidateBeams();sound.stopTheremin();
  }
  function renderKeys() {
    els.miniKeyboard.replaceChildren();
    for(let i=0;i<8;i++) {
      const midi=noteMidi(i),button=document.createElement('button');
      button.type='button';button.className='mini-key';button.dataset.midi=midi;
      button.setAttribute('aria-label',`Play ${noteName(midi)} using key ${i+1}`);
      button.innerHTML=`<b>${noteName(midi)}</b><span>${i+1}</span>`;
      button.addEventListener('click',async()=>{
        try{await sound.ensure();triggerNote(i,graphic.w*(.13+i*.74/7),graphic.h*.58,.85);}catch(e){toast(e.message);}
      });els.miniKeyboard.appendChild(button);
    }
  }
  function handleResults(results) {
    if(!camera.active) return;
    const now=performance.now(), all=results.multiHandLandmarks || [];
    const hands=all.map(lm=>{
      const points=lm.map(getScreenPoint);
      const palmSpan=midpointDistance(points[5],points[17]);
      const pinch=midpointDistance(points[4],points[8]) < palmSpan*.55;
      return {points,pinch};
    }).sort((a,b)=>a.points[0].x-b.points[0].x);
    camera.tracks=hands;camera.lastSeen=now;
    els.trackingStatus.textContent=hands.length?`${hands.length} HAND${hands.length>1?'S':''} TRACKED`:'SEARCHING FOR HANDS';
    if(hands.length){
      const p=hands[hands.length-1].points[8];
      els.coordinate.textContent=`X: ${String(Math.round(p.x/graphic.w*100)).padStart(2,'0')}  Y: ${String(Math.round(p.y/graphic.h*100)).padStart(2,'0')}`;
    }else{els.coordinate.textContent='X: --   Y: --';}
    camera.fpsCount++;
    if(now-camera.fpsStart>=1000){
      camera.framesPerSecond=Math.round(camera.fpsCount*1000/(now-camera.fpsStart));camera.fpsCount=0;camera.fpsStart=now;
      els.fpsLabel.textContent=`${camera.framesPerSecond} TRACK / ${camera.renderFps} FPS`;
    }
    if(CONFIG.mode==='theremin') {
      if(hands.length){
        const right=hands[hands.length-1], tip=right.points[8];
        const x=clamp(tip.x/graphic.w,0,1),y=clamp(tip.y/graphic.h,0,1);
        const idx=clamp(Math.round((x-.08)/.84*7),0,7);
        const midi=noteMidi(idx);
        const cutoff=hands.length>1 ? 350+Math.pow(1-clamp(hands[0].points[8].y/graphic.h,0,1),2)*11500 : CONFIG.cutoff;
        sound.updateTheremin(right.pinch,midi,1-y*.8,cutoff);
        if(right.pinch){showNote(midi,'continuous');if(Math.random()<.18)addParticles(tip.x,tip.y,1,.55,idx);}
      }else{sound.stopTheremin();}
    }else { sound.stopTheremin(); }
    hands.forEach((hand,h)=>{
      for(const finger of [8,12]) {
        const p=hand.points[finger], key=`${h}:${finger}`,prev=camera.previous.get(key);
        const normalizedX=p.x/graphic.w, normalizedY=p.y/graphic.h;
        if(CONFIG.trails){const trail=graphic.trails.get(key)||[];trail.push({...p,t:now});if(trail.length>16)trail.shift();graphic.trails.set(key,trail);}
        if(CONFIG.particles && Math.random()<.09) addParticles(p.x,p.y,1,.3,h+finger);
        if(CONFIG.mode==='harp' && prev && normalizedY>.13 && normalizedY<.9) {
          const motion=Math.abs(p.x-prev.x);
          if(motion>graphic.w*.005){
            for(let i=0;i<8;i++) {
              const sx=graphic.w*(.13+i*.74/7), cooldown=`${key}:harp:${i}`;
              if(Math.min(prev.x,p.x)<=sx && Math.max(prev.x,p.x)>=sx && now-(camera.lastTriggered.get(cooldown)||0)>160){
                camera.lastTriggered.set(cooldown,now); triggerNote(i,sx,p.y,clamp(.4+motion/(graphic.w*.09),.4,1));
              }
            }
          }
        }
        if(CONFIG.mode==='keys') {
          const insideY=normalizedY>.65 && normalizedY<.9, insideX=normalizedX>=.08 && normalizedX<.92;
          const zone=insideY&&insideX ? clamp(Math.floor((normalizedX-.08)/.84*8),0,7) : -1;
          const prevZone=camera.padZones.get(key)??-1;
          if(zone!==prevZone){
            if(zone>=0 && now-(camera.lastTriggered.get(key+':key:'+zone)||0)>160){
              camera.lastTriggered.set(key+':key:'+zone,now);
              triggerNote(zone,p.x,p.y,.75);
            }
            camera.padZones.set(key,zone);
          }
        }
        camera.previous.set(key,{...p,t:now});
      }
    });
    if(!hands.length){camera.previous.clear();camera.padZones.clear();}
  }

  async function setupHands() {
    if(camera.hands) return;
    if(!window.Hands) throw new Error('Offline hand-tracking assets are missing. Install the vendored MediaPipe package and reload.');
    const detector=new window.Hands({locateFile:(file)=>`./vendor/mediapipe-hands/${file}`});
    detector.setOptions({maxNumHands:2,modelComplexity:profile().complexity,minDetectionConfidence:.62,minTrackingConfidence:.54});
    detector.onResults(handleResults);camera.hands=detector;
  }
  // Schedule inference from *new camera frames* rather than running a second
  // unconstrained animation loop. Drop frames when the previous inference is
  // still busy instead of allowing a queue of stale hand poses to build up.
  function queueTracking(session){
    if(!camera.active || camera.activeSession!==session || document.hidden)return;
    if(typeof els.camera.requestVideoFrameCallback==='function'){
      camera.pendingVideoCallback=els.camera.requestVideoFrameCallback((now)=>{
        if(!camera.active||camera.activeSession!==session)return;
        detectFrame(now);
        queueTracking(session);
      });
    }else{
      requestAnimationFrame((now)=>{
        if(!camera.active||camera.activeSession!==session)return;
        detectFrame(now);
        queueTracking(session);
      });
    }
  }
  function detectFrame(now){
    if(camera.processing || now-camera.lastProcess<profile().interval || els.camera.readyState<2 || !camera.hands)return;
    camera.processing=true;camera.lastProcess=now;
    camera.hands.send({image:els.camera}).catch((error)=>{
      console.error('Hand tracking failed:',error);
      if(now-(camera.lastErrorToast||0)>7000){toast('Hand tracking lost. Try better lighting or restart the camera.');camera.lastErrorToast=now;}
    }).finally(()=>{camera.processing=false;});
  }
  function syncPerformance(){
    if(camera.hands)camera.hands.setOptions({modelComplexity:profile().complexity});
    resizeCanvas();invalidateBeams();
    if(camera.active)toast('Performance profile updated. Restart camera to apply resolution.');
  }
  async function startCamera(){
    if(camera.active){stopCamera();return;}
    const session=++camera.activeSession;
    els.powerBtn.disabled=true;els.startBtn.disabled=true;
    setText('cameraStatus','INITIALIZING CAMERA');
    try{
      if(!navigator.mediaDevices?.getUserMedia) throw new Error('Camera requires HTTPS or localhost, and a supported browser.');
      await sound.ensure();
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:profile().width},height:{ideal:profile().height},frameRate:{ideal:30,max:30}},audio:false});
      if(document.hidden || camera.activeSession!==session){
        stream.getTracks().forEach(track=>track.stop());
        throw new DOMException('Camera start cancelled.','AbortError');
      }
      camera.stream=stream;els.camera.srcObject=stream;
      await els.camera.play();
      await setupHands();
      if(document.hidden || camera.activeSession!==session)throw new DOMException('Camera start cancelled.','AbortError');
      camera.active=true;camera.fpsStart=performance.now();camera.fpsCount=0;
      camera.renderFpsStart=camera.fpsStart;camera.renderFps=0;camera.renderCount=0;camera.lastSeen=performance.now();
      els.stage.classList.add('live');els.statusLight.classList.add('active');
      setText('cameraStatus','CAMERA LIVE');setText('trackingStatus','SEARCHING FOR HANDS');
      els.powerBtn.innerHTML='<span>◉</span> STOP CAMERA';
      requestRender();queueTracking(camera.activeSession);toast('Camera ready. Move both hands into the frame.');
    }catch(error){
      if(error?.name!=='AbortError')console.error('Unable to start camera:',error);
      if(camera.stream){camera.stream.getTracks().forEach(track=>track.stop());camera.stream=null;}
      els.camera.srcObject=null;
      camera.active=false;
      els.stage.classList.remove('live');els.statusLight.classList.remove('active');
      setText('cameraStatus','CAMERA OFFLINE');
      setText('trackingStatus','AWAITING INPUT');
      if(error?.name!=='AbortError'){
        const reason=error?.name==='NotAllowedError'?'Camera permission was denied. Allow access in your browser settings and retry.':
          error?.name==='NotFoundError'?'No camera found on this device.':error?.message||'Camera failed to start.';
        toast(reason,6500);
      }
    }finally{els.powerBtn.disabled=false;els.startBtn.disabled=false;}
  }
  function stopCamera(){
    camera.active=false;camera.activeSession++;camera.tracks=[];graphic.smoothedHands=[];camera.previous.clear();camera.padZones.clear();
    if(camera.pendingVideoCallback && typeof els.camera.cancelVideoFrameCallback==='function')els.camera.cancelVideoFrameCallback(camera.pendingVideoCallback);
    camera.pendingVideoCallback=0;
    camera.stream?.getTracks().forEach(t=>t.stop());camera.stream=null;els.camera.srcObject=null;
    els.stage.classList.remove('live');els.statusLight.classList.remove('active');
    setText('cameraStatus','CAMERA OFFLINE');setText('trackingStatus','AWAITING INPUT');
    setText('fpsLabel','–– TRACK / –– FPS');els.powerBtn.innerHTML='<span>◉</span> ENABLE CAMERA';
    sound.stopTheremin();graphic.trails.clear();graphic.particles.length=0;graphic.hits.length=0;requestRender();
  }
  function formatTime(s){return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
  async function toggleRecording(){
    if(sound.recorder?.state==='recording'){sound.recorder.stop();return;}
    try{
      await sound.ensure();
      if(!window.MediaRecorder) throw new Error('Audio recording is not supported by this browser.');
      const types=['audio/webm;codecs=opus','audio/mp4','audio/webm'];
      const mimeType=types.find(t=>MediaRecorder.isTypeSupported(t));
      sound.chunks=[];
      const recorder=new MediaRecorder(sound.mediaDest.stream,mimeType?{mimeType}:undefined);
      sound.recorder=recorder;
      recorder.ondataavailable=(event)=>{if(event.data.size)sound.chunks.push(event.data);};
      recorder.onerror=(e)=>toast(`Recording error: ${e.error?.message||'unknown error'}`);
      recorder.onstop=()=>{
        clearInterval(recordClock);els.recIndicator.hidden=true;els.recordBtn.classList.remove('recording');
        els.recordText.textContent='RECORD AUDIO';
        const chunks=sound.chunks;
        sound.chunks=[];
        if(sound.recorder===recorder)sound.recorder=null;
        if(!chunks.length){toast('No audio was captured.');return;}
        const blob=new Blob(chunks,{type:recorder.mimeType});
        const url=URL.createObjectURL(blob),a=document.createElement('a');
        const ext=blob.type.includes('mp4')?'m4a':'webm';
        a.href=url;a.download=`aether-performance-${new Date().toISOString().replace(/[:.]/g,'-')}.${ext}`;
        document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
        toast('Audio recording saved to your downloads.');
      };
      sound.recorder.start(250);recordedAt=Date.now();
      els.recordBtn.classList.add('recording');els.recordText.textContent='STOP & SAVE';
      els.recIndicator.hidden=false;els.recordTime.textContent='00:00';
      clearInterval(recordClock);recordClock=setInterval(()=>els.recordTime.textContent=formatTime(Math.floor((Date.now()-recordedAt)/1000)),500);
      toast('Recording synthesizer audio only. Camera video is never recorded.');
    }catch(error){toast(error.message||'Could not record audio.',5000);}
  }

  function bindUi(){
    els.startBtn.addEventListener('click',startCamera);els.powerBtn.addEventListener('click',startCamera);
    els.recordBtn.addEventListener('click',toggleRecording);
    document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
    const presetDescriptions={
      glass:'Crystalline bells with long shimmering decay.',
      pluck:'Dry, focused analog pluck.',
      dream:'Airy ambient pad with a slow bloom.',
      bass:'Warm subby synthesizer bass.',
      guitarClean:'Bright plucked synth-guitar, clean and expressive.',
      guitarDrive:'Gritty overdriven synth-guitar lead.',
      synthLead:'Detuned neon synthwave lead.',
      synthPad:'Wide, slowly evolving retro-synth pad.',
      trancePluck:'Bright, pulsing trance pluck.',
      acid303:'Resonant acid-style 303-inspired squelch.',
      technoStab:'Aggressive filtered techno stab.',
      technoBass:'Punchy low-end electronic bass.',
      hiphop808:'Pitch-dropping 808-style sub bass.',
      lofiKeys:'Mellow dusty electric keys.'
    };
    const suggestedStyles={guitarDrive:'synthwave',guitarClean:'synthwave',synthLead:'synthwave',synthPad:'synthwave',trancePluck:'psytrance',acid303:'psytrance',technoStab:'techno',technoBass:'techno',hiphop808:'hiphop',lofiKeys:'lofi'};
    const syncBeatUi=()=>{
      const playing=Boolean(sound.groove?.playing);
      els.beatToggle.textContent=playing?'■ STOP GROOVE':'▶ START GROOVE';
      els.beatToggle.setAttribute('aria-pressed',String(playing));
      els.beatToggle.classList.toggle('running',playing);
      els.beatStatus.textContent=playing?'● BEAT PLAYING':'○ BEAT STOPPED';
    };
    els.preset.addEventListener('change',e=>{
      CONFIG.preset=e.target.value;
      els.presetDescription.textContent=presetDescriptions[CONFIG.preset]||'';
      sound.updateTimbre();
      document.querySelectorAll('[data-sound]').forEach(b=>b.classList.toggle('active',b.dataset.sound===CONFIG.preset));
      const style=suggestedStyles[CONFIG.preset];
      if(style && !sound.groove?.playing) {
        els.beatStyle.value=style;
        const tempo=window.AetherGroove.GROOVES[style].bpm;
        els.bpm.value=tempo;
        els.bpmValue.textContent=tempo+' BPM';
      }
    });
    document.querySelectorAll('[data-sound]').forEach(button=>button.addEventListener('click',async()=>{
      els.preset.value=button.dataset.sound;
      els.preset.dispatchEvent(new Event('change'));
      try{await sound.ensure();triggerNote(3,graphic.w*.52,graphic.h*.56,.83);}
      catch(error){toast(error.message||'Sound preview is unavailable.');}
    }));
    els.presetPreview.addEventListener('click',async()=>{
      try{await sound.ensure();triggerNote(3,graphic.w*.52,graphic.h*.56,.86);}
      catch(error){toast(error.message||'Sound preview is unavailable.');}
    });
    els.beatToggle.addEventListener('click',async()=>{
      try{
        await sound.ensure();
        if(sound.groove.playing)sound.groove.stop();
        else sound.groove.start(els.beatStyle.value,Number(els.bpm.value));
        syncBeatUi();
      }catch(error){toast(error.message||'Unable to start the groove.');}
    });
    els.beatStyle.addEventListener('change',()=>{
      const style=els.beatStyle.value;
      const bpm=window.AetherGroove.GROOVES[style].bpm;
      els.bpm.value=bpm;
      els.bpmValue.textContent=bpm+' BPM';
      if(sound.groove?.playing)sound.groove.start(style,bpm);
      syncBeatUi();
    });
    els.bpm.addEventListener('input',()=>{
      els.bpmValue.textContent=els.bpm.value+' BPM';
      sound.groove?.setBpm(Number(els.bpm.value));
    });
    els.beatVolume.addEventListener('input',()=>{
      CONFIG.beatVolume=Number(els.beatVolume.value)/100*.8;
      els.beatVolumeValue.textContent=els.beatVolume.value+'%';
      if(sound.groove)sound.groove.drumBus.gain.setTargetAtTime(CONFIG.beatVolume,sound.ctx.currentTime,.025);
    });
    els.drive.addEventListener('input',()=>{
      CONFIG.drive=Number(els.drive.value)/100;
      els.driveValue.textContent=els.drive.value+'%';
      if(sound.groove)sound.groove.drive=CONFIG.drive;
    });
    els.presetDescription.textContent=presetDescriptions[CONFIG.preset];
    syncBeatUi();
    els.root.addEventListener('change',e=>{CONFIG.root=e.target.value;renderKeys();invalidateBeams();});
    els.scale.addEventListener('change',e=>{CONFIG.scale=e.target.value;renderKeys();invalidateBeams();});
    els.octave.addEventListener('input',e=>{CONFIG.octave=Number(e.target.value);els.octaveValue.textContent=CONFIG.octave;renderKeys();invalidateBeams();});
    els.reverb.addEventListener('change',e=>{CONFIG.reverb=e.target.checked;sound.setEffects();});
    els.delay.addEventListener('change',e=>{CONFIG.delay=e.target.checked;sound.setEffects();});
    els.cutoff.addEventListener('input',e=>{CONFIG.cutoff=Number(e.target.value);els.cutoffValue.textContent=`${(CONFIG.cutoff/1000).toFixed(1)} kHz`;sound.setEffects();});
    els.space.addEventListener('input',e=>{CONFIG.space=Number(e.target.value)/100;els.spaceValue.textContent=`${e.target.value}%`;sound.setEffects();});
    els.volume.addEventListener('input',e=>{CONFIG.volume=Number(e.target.value)/100;els.volumeValue.textContent=`${e.target.value}%`;sound.setEffects();});
    els.muteBtn.addEventListener('click',()=>{sound.muted=!sound.muted;els.muteBtn.classList.toggle('muted',sound.muted);els.muteBtn.setAttribute('aria-label',sound.muted?'Unmute sound':'Mute sound');sound.setEffects();});
    els.visualTheme.addEventListener('change',e=>{CONFIG.visual=e.target.value;document.body.dataset.visual=CONFIG.visual;invalidateBeams();});
    for(const k of ['particles','skeleton','connections','trails'])els[k].addEventListener('change',e=>{CONFIG[k]=e.target.checked;if(k==='trails'&&!CONFIG[k])graphic.trails.clear();});
    els.performanceProfile.addEventListener('change',e=>{CONFIG.performance=e.target.value;syncPerformance();});
    els.mirrorBtn.addEventListener('click',()=>{CONFIG.mirror=!CONFIG.mirror;els.camera.style.transform=CONFIG.mirror?'scaleX(-1)':'none';els.mirrorBtn.title=CONFIG.mirror?'Mirrored video':'Unmirrored video';});
    els.fullscreenBtn.addEventListener('click',()=>{
      if(document.fullscreenElement)document.exitFullscreen?.();else els.stage.requestFullscreen?.().catch(()=>toast('Fullscreen is not available.'));
    });
    els.helpBtn.addEventListener('click',()=>els.helpDialog.showModal());
    els.closeHelp.addEventListener('click',()=>els.helpDialog.close());
    els.dismissHelp.addEventListener('click',()=>els.helpDialog.close());
    els.helpDialog.addEventListener('click',e=>{if(e.target===els.helpDialog)els.helpDialog.close();});
    document.addEventListener('keydown',async e=>{
      if(e.repeat||e.altKey||e.metaKey||e.ctrlKey||/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)||els.helpDialog.open)return;
      if(/^Digit[1-8]$/.test(e.code)||/^Numpad[1-8]$/.test(e.code)){
        const index=Number(e.code.at(-1))-1;
        try{await sound.ensure();triggerNote(index,graphic.w*(.13+index*.74/7),graphic.h*.55,.84);}catch(err){toast(err.message);}
      }
    });
    let pausedForPrivacy=false;
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){
        sound.stopTheremin();
        if(sound.groove?.playing){sound.groove.stop();syncBeatUi();}
        if(camera.active||camera.stream||els.powerBtn.disabled){
          stopCamera();
          pausedForPrivacy=true;
        }
      }else{
        requestRender();
        if(pausedForPrivacy){
          pausedForPrivacy=false;
          toast('Camera stopped when this tab was hidden. Click Start Camera to resume.',5500);
        }
      }
    });
    window.addEventListener('pagehide',stopCamera);
    if(window.ResizeObserver)new ResizeObserver(resizeCanvas).observe(els.stage);
    else window.addEventListener('resize',resizeCanvas);
    let adaptationFrame = 0;
    const adapt = () => {
      cancelAnimationFrame(adaptationFrame);
      adaptationFrame=requestAnimationFrame(updateDeviceMode);
    };
    window.addEventListener('resize',adapt,{passive:true});
    window.addEventListener('orientationchange',adapt,{passive:true});
  }
  renderKeys();bindUi();updateDeviceMode();setMode('harp');resizeCanvas();requestRender();
})();

