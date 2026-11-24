/* AETHER Sound Bank — original browser-synthesized instruments and grooves. */
(() => {
  'use strict';

  // Sound names describe synthesis styles, not recordings or licensed samples.
  const PATCHES = Object.freeze({
    guitarClean: {waves:[['triangle',1,0,.75],['sawtooth',2,-2,.15],['sine',3,0,.08]], attack:.004, duration:1.6, peak:.32, filter:[5400,1150,.9], drive:0},
    guitarDrive: {waves:[['sawtooth',1,-4,.52],['sawtooth',1,4,.52],['triangle',.5,0,.24]], attack:.005, duration:1.55, peak:.26, filter:[4500,1550,.75], drive:3.5},
    synthLead:  {waves:[['sawtooth',1,-7,.48],['sawtooth',1,7,.48],['square',.5,0,.14]], attack:.012, duration:1.45, peak:.24, filter:[4800,2300,1.6], drive:.5},
    synthPad:   {waves:[['sawtooth',1,-9,.40],['sawtooth',1,9,.40],['triangle',.5,0,.24]], attack:.28, duration:3.7, peak:.22, filter:[2350,1050,.8], drive:0},
    trancePluck:{waves:[['sawtooth',1,-5,.52],['sawtooth',1,5,.52],['sine',2,0,.13]], attack:.004, duration:.92, peak:.30, filter:[7200,1050,1.3], drive:.35},
    acid303:    {waves:[['sawtooth',1,0,.75],['square',1,.5,.32]], attack:.003, duration:.5, peak:.28, filter:[6500,520,12], drive:1.1, bend:1.025},
    technoStab: {waves:[['sawtooth',1,0,.45],['square',1.26,0,.23],['sawtooth',1.5,1,.19]], attack:.006, duration:.64, peak:.23, filter:[5000,880,3.2], drive:1.6},
    technoBass: {waves:[['sawtooth',1,0,.48],['square',1,-3,.35],['sine',.5,0,.55]], attack:.005, duration:.72, peak:.28, filter:[2200,420,2.5], drive:1.4, octave:-1},
    hiphop808:  {waves:[['sine',1,0,1],['triangle',1,0,.14]], attack:.003, duration:1.65, peak:.42, filter:[1400,720,.5], drive:1.7, octave:-2, bend:1.8},
    lofiKeys:   {waves:[['triangle',1,0,.67],['sine',2,0,.18],['triangle',1.004,0,.22]], attack:.014, duration:2.25, peak:.28, filter:[2600,800,.6], drive:0}
  });

  const GROOVES = Object.freeze({
    synthwave: {bpm:108, kick:[0,4,8,12],snare:[4,12],hat:[2,6,10,14],open:[7,15]},
    psytrance: {bpm:140, kick:[0,4,8,12],snare:[4,12],hat:[2,6,10,14],open:[3,7,11,15]},
    techno: {bpm:130, kick:[0,4,8,12],snare:[4,12],hat:[2,4,6,8,10,12,14],open:[7,15]},
    hiphop: {bpm:92, kick:[0,6,11],snare:[4,12],hat:[0,2,4,6,8,10,12,14],open:[14]},
    lofi: {bpm:78, kick:[0,7,10],snare:[4,12],hat:[2,4,6,10,12,14],open:[]}
  });

  const clamp = (x,a,b) => Math.min(b,Math.max(a,x));

  class Bank {
    constructor(ctx, noteOut, drumOut) {
      this.ctx=ctx;
      this.noteOut=noteOut;
      this.drumBus=ctx.createGain();
      this.drumBus.gain.value=.48;
      this.drumBus.connect(drumOut);
      this.noise=this.makeNoiseBuffer();
      this.shapes=new Map();
      this.voices=[];
      this.drive=.5;
      this.playing=false;
      this.style='synthwave';
      this.bpm=108;
      this.step=0;
      this.nextTime=0;
      this.timer=null;
      this.generation=0;
    }
    makeNoiseBuffer() {
      const count=Math.floor(this.ctx.sampleRate*.4);
      const b=this.ctx.createBuffer(1,count,this.ctx.sampleRate);
      const data=b.getChannelData(0);
      for(let i=0;i<count;i++)data[i]=Math.random()*2-1;
      return b;
    }
    shape(amount) {
      if(!this.shapes.has(amount)) {
        const curve=new Float32Array(2048), k=1+amount*8, norm=Math.tanh(k);
        for(let i=0;i<curve.length;i++)curve[i]=Math.tanh(((i/(curve.length-1))*2-1)*k)/norm;
        this.shapes.set(amount,curve);
      }
      return this.shapes.get(amount);
    }
    playNote(id, midi, velocity=.75) {
      const patch=PATCHES[id];
      if(!patch)return false;
      const ctx=this.ctx, t=ctx.currentTime+.006;
      const fundamental=440*Math.pow(2,(midi-69+(patch.octave||0)*12)/12);
      const amp=ctx.createGain();
      const loudness=clamp(velocity,.25,1)*patch.peak;
      amp.gain.setValueAtTime(.0001,t);
      amp.gain.linearRampToValueAtTime(loudness,t+patch.attack);
      amp.gain.exponentialRampToValueAtTime(.0001,t+patch.duration);
      const filter=ctx.createBiquadFilter();
      filter.type='lowpass';
      filter.Q.setValueAtTime(patch.filter[2],t);
      filter.frequency.setValueAtTime(patch.filter[0],t);
      filter.frequency.exponentialRampToValueAtTime(patch.filter[1],t+Math.min(patch.duration*.8,1.4));
      let output=filter;
      if(patch.drive) {
        const shaper=ctx.createWaveShaper();
        shaper.curve=this.shape(patch.drive*(.35+this.drive*1.3));
        shaper.oversample='none'; // Keep CPU use predictable during camera tracking.
        const trim=ctx.createGain();
        trim.gain.value=.42;
        filter.connect(shaper);shaper.connect(trim);
        output=trim;
      }
      output.connect(amp);amp.connect(this.noteOut);
      const oscillators=[];
      for(const [type,ratio,detune,level] of patch.waves) {
        const osc=ctx.createOscillator(),gain=ctx.createGain();
        osc.type=type;
        osc.detune.setValueAtTime(detune,t);
        const frequency=clamp(fundamental*ratio,20,18000);
        osc.frequency.setValueAtTime(frequency*(patch.bend||1),t);
        if(patch.bend)osc.frequency.exponentialRampToValueAtTime(frequency,t+(id==='hiphop808'?.13:.065));
        gain.gain.value=level;
        osc.connect(gain);gain.connect(filter);
        osc.start(t);osc.stop(t+patch.duration+.09);
        oscillators.push(osc);
      }
      const voice={amp,oscillators};
      this.voices.push(voice);
      oscillators[0].onended=()=> {
        const pos=this.voices.indexOf(voice);
        if(pos!==-1)this.voices.splice(pos,1);
        amp.disconnect();
      };
      // Avoid unbounded oscillator counts under rapid repeated hand gestures.
      if(this.voices.length>12){
        const oldest=this.voices.shift();
        if(oldest!==voice){
          const fade=ctx.currentTime+.003;
          oldest.amp.gain.cancelScheduledValues(fade);
          oldest.amp.gain.setTargetAtTime(0,fade,.008);
          // The original scheduled oscillator stop remains valid.
        }
      }
      return true;
    }
    noiseHit(t,kind) {
      const ctx=this.ctx,noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),env=ctx.createGain();
      noise.buffer=this.noise;
      filter.type=kind==='hat'?'highpass':'bandpass';
      filter.frequency.value=kind==='hat'?7300:1550;
      filter.Q.value=kind==='hat'?.6:.8;
      const duration=kind==='hat'?.055:.15;
      env.gain.setValueAtTime(kind==='hat'?.16:.25,t);
      env.gain.exponentialRampToValueAtTime(.0001,t+duration);
      noise.connect(filter);filter.connect(env);env.connect(this.drumBus);
      noise.start(t);noise.stop(t+duration+.005);
    }
    kick(t,soft=false) {
      const ctx=this.ctx,osc=ctx.createOscillator(),amp=ctx.createGain();
      osc.type='sine';
      osc.frequency.setValueAtTime(155,t);
      osc.frequency.exponentialRampToValueAtTime(47,t+.12);
      amp.gain.setValueAtTime(soft?.40:.72,t);
      amp.gain.exponentialRampToValueAtTime(.0001,t+(soft?.26:.34));
      osc.connect(amp);amp.connect(this.drumBus);
      osc.start(t);osc.stop(t+.36);
    }
    snare(t,soft=false) {
      this.noiseHit(t,'snare');
      const ctx=this.ctx,osc=ctx.createOscillator(),amp=ctx.createGain();
      osc.type='triangle';
      osc.frequency.setValueAtTime(185,t);
      osc.frequency.exponentialRampToValueAtTime(115,t+.08);
      amp.gain.setValueAtTime(soft?.12:.22,t);
      amp.gain.exponentialRampToValueAtTime(.0001,t+.105);
      osc.connect(amp);amp.connect(this.drumBus);
      osc.start(t);osc.stop(t+.12);
    }
    setBpm(bpm){this.bpm=clamp(Number(bpm)||108,65,175);}
    setStyle(style) {
      if(!GROOVES[style])return;
      this.style=style;
      this.step=0;
      this.nextTime=this.ctx.currentTime+.05;
      this.generation++;
    }
    start(style=this.style,bpm=this.bpm) {
      if(this.playing)this.stop();
      this.setStyle(style);
      this.setBpm(bpm);
      this.playing=true;
      this.step=0;
      this.nextTime=this.ctx.currentTime+.035;
      this.tick();
      this.timer=setInterval(()=>this.tick(),25);
    }
    tick() {
      if(!this.playing)return;
      const ctx=this.ctx,pattern=GROOVES[this.style];
      if(!pattern)return;
      if(this.nextTime<ctx.currentTime-.1)this.nextTime=ctx.currentTime+.01;
      const stepSeconds=60/this.bpm/4;
      let maxAhead=8;
      while(this.nextTime<ctx.currentTime+.1 && maxAhead-->0){
        const step=this.step;
        const swing=(this.style==='hiphop'||this.style==='lofi') && step%2===1 ? stepSeconds*.18 : 0;
        const at=this.nextTime+swing;
        if(pattern.kick.includes(step))this.kick(at,this.style==='lofi');
        if(pattern.snare.includes(step))this.snare(at,this.style==='lofi');
        if(pattern.hat.includes(step))this.noiseHit(at,'hat');
        if(pattern.open.includes(step))this.noiseHit(at,'hat');
        this.step=(step+1)%16;
        this.nextTime+=stepSeconds;
      }
    }
    stop() {
      this.playing=false;
      if(this.timer!==null)clearInterval(this.timer);
      this.timer=null;
    }
  }
  window.AetherGroove=Object.freeze({Bank,PATCHES,GROOVES});
})();
