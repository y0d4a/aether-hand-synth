import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

class Param {
  constructor(value=0){this.value=value;}
  setValueAtTime(value){this.value=value;return this;}
  linearRampToValueAtTime(value){this.value=value;return this;}
  exponentialRampToValueAtTime(value){this.value=value;return this;}
  setTargetAtTime(value){this.value=value;return this;}
  cancelScheduledValues(){return this;}
}
class AudioNodeMock {
  constructor(){
    this.gain=new Param(1);
    this.frequency=new Param(440);
    this.Q=new Param(1);
    this.detune=new Param(0);
    this.threshold=new Param(0);
    this.knee=new Param(0);
    this.ratio=new Param(1);
    this.attack=new Param(0);
    this.release=new Param(0);
  }
  connect(){return this;}
  disconnect(){return this;}
  start(){this.started=true;}
  stop(){this.stopped=true;}
}
let oscillatorCount=0,bufferCount=0,intervalCount=0;
const context={
  currentTime:1,
  sampleRate:44100,
  createGain:()=>new AudioNodeMock(),
  createBiquadFilter:()=>new AudioNodeMock(),
  createWaveShaper:()=>new AudioNodeMock(),
  createOscillator:()=>{oscillatorCount++;return new AudioNodeMock();},
  createBufferSource:()=>{bufferCount++;return new AudioNodeMock();},
  createBuffer:(_channels,length)=>({getChannelData:()=>new Float32Array(length)})
};
const sandbox={
  window:{},
  setInterval:()=>{intervalCount++;return intervalCount;},
  clearInterval:()=>{},
  Float32Array,Math
};
vm.runInNewContext(await readFile('sound-bank.js','utf8'),sandbox,{filename:'sound-bank.js'});
const {Bank,PATCHES,GROOVES}=sandbox.window.AetherGroove;
assert.equal(Object.keys(PATCHES).length,10);
assert.equal(Object.keys(GROOVES).length,5);
const bank=new Bank(context,new AudioNodeMock(),new AudioNodeMock());
for (const key of Object.keys(PATCHES)) {
  assert.equal(bank.playNote(key,60,.7),true,key);
}
assert.equal(bank.playNote('not-a-preset',60),false);
assert.ok(oscillatorCount>=20);
bank.drive=.8;
assert.equal(bank.playNote('guitarDrive',64,.8),true);
for(const [name,pattern] of Object.entries(GROOVES)){
  assert.ok(pattern.kick.length>0);
  assert.ok(pattern.snare.length>0);
  assert.ok(pattern.hat.length>0);
  bank.start(name,pattern.bpm);
  bank.tick();
  bank.stop();
  assert.equal(bank.playing,false);
}
assert.ok(bufferCount>0,'groove should synthesize percussion');
console.log('Audio smoke test passed:',Object.keys(PATCHES).length,'new patches and',Object.keys(GROOVES).length,'grooves.');
