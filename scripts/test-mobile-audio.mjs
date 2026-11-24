import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the real SoundEngine implementation with a Safari-like suspended
// AudioContext. This catches first-tap unlock regressions without a device.
const app=await readFile('app.js','utf8');
const start=app.indexOf('  class SoundEngine {');
const end=app.indexOf('  // Profiles favor',start);
assert.ok(start>=0 && end>start,'SoundEngine extraction markers must be present');

class Param {
  constructor(value=0){this.value=value;}
  setValueAtTime(value){this.value=value;return this;}
  linearRampToValueAtTime(value){this.value=value;return this;}
  exponentialRampToValueAtTime(value){this.value=value;return this;}
  setTargetAtTime(value){this.value=value;return this;}
  cancelScheduledValues(){return this;}
}
class Node {
  constructor(){
    for(const name of ['gain','frequency','Q','detune','delayTime','threshold','knee','ratio','attack','release']){
      this[name]=new Param();
    }
    this.stream={};
  }
  connect(){return this;}
  disconnect(){}
  start(){this.started=true;}
  stop(){this.stopped=true;}
}
class MobileAudioContext {
  static instances=[];
  static initialState='suspended';
  constructor(){
    this.state=MobileAudioContext.initialState;
    this.currentTime=2;
    this.sampleRate=8000;
    this.destination=new Node();
    this.resumeCalls=0;
    this.sourceStarts=0;
    this.oscillatorStarts=0;
    MobileAudioContext.instances.push(this);
  }
  resume(){
    this.resumeCalls++;
    this.state='running';
    return Promise.resolve();
  }
  createGain(){return new Node();}
  createBiquadFilter(){return new Node();}
  createDelay(){return new Node();}
  createConvolver(){return new Node();}
  createMediaStreamDestination(){return new Node();}
  createDynamicsCompressor(){return new Node();}
  createBuffer(_channels,length){
    const array=new Float32Array(length);
    return {getChannelData:()=>array};
  }
  createBufferSource(){
    const n=new Node();
    n.start=()=>{this.sourceStarts++};
    return n;
  }
  createOscillator(){
    const n=new Node();
    n.start=()=>{this.oscillatorStarts++};
    return n;
  }
}
const navigator={audioSession:{type:'auto'}};
const window={
  AudioContext:MobileAudioContext,
  AetherGroove:{Bank:class {
    constructor(){this.drumBus=new Node();}
    playNote(){return false;}
  }}
};
const CONFIG={
  cutoff:8000,volume:.75,reverb:true,delay:true,space:.35,
  beatVolume:.48,drive:.5,preset:'glass'
};
const context={window,navigator,CONFIG,Math,Float32Array,Promise,
  freqFromMidi:(m)=>440*Math.pow(2,(m-69)/12),
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value))};
vm.runInNewContext(app.slice(start,end)+'\nthis.SoundEngine=SoundEngine;',context);
const SoundEngine=context.SoundEngine;

const sound=new SoundEngine();
const firstTap=sound.ensure();
// Check synchronously, before awaiting: unlock must occur in the user gesture.
assert.equal(MobileAudioContext.instances.length,1);
assert.equal(sound.ctx.resumeCalls,1,'initial suspended context must call resume()');
assert.equal(sound.ctx.sourceStarts,1,'initial gesture must start silent audio source');
assert.equal(navigator.audioSession.type,'playback','supported iOS session must permit playback');
await firstTap;
assert.equal(sound.ctx.state,'running');
sound.playNote(60,.75);
assert.ok(sound.ctx.oscillatorStarts>=3,'a playable note must start oscillators');

sound.ctx.state='interrupted';
await sound.ensure();
assert.equal(sound.ctx.state,'running','recover from iOS interruption');
assert.equal(sound.ctx.resumeCalls,2);
sound.ctx.state='suspended';
await sound.ensure();
assert.equal(sound.ctx.resumeCalls,3,'recover from backgrounding');
assert.equal(MobileAudioContext.instances.length,1,'reuse audio context');

MobileAudioContext.initialState='running';
const sound2=new SoundEngine();
await sound2.ensure();
assert.equal(sound2.ctx.resumeCalls,0,'already running context need not resume');
assert.equal(sound2.ctx.sourceStarts,1,'unlock on first tap remains harmless');

console.log('Mobile audio tests passed: initial unlock, playback category, note output, interrupt recovery.');
