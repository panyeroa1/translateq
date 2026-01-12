
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {
  createWorketFromSrc,
  registeredWorklets,
} from './audioworklet-registry';

export class AudioStreamer {
  private sampleRate: number = 24000;
  private bufferSize: number = 7680;
  private audioQueue: Float32Array[] = [];
  private isPlaying: boolean = false;
  private isStreamComplete: boolean = false;
  private scheduledTime: number = 0;
  
  // REDUCED: Lowered from 0.35s to 0.1s for ultra-low latency playback start.
  private initialBufferTime: number = 0.1; 
  
  public gainNode: GainNode;
  public source: AudioBufferSourceNode;
  private endOfQueueAudioSource: AudioBufferSourceNode | null = null;

  // Worker for background timing to prevent throttling
  private schedulerWorker: Worker | null = null;

  public onComplete = () => {};
  public onPlay = () => {};
  public onStop = () => {};

  constructor(public context: AudioContext) {
    this.gainNode = this.context.createGain();
    this.source = this.context.createBufferSource();
    this.gainNode.connect(this.context.destination);
    this.addPCM16 = this.addPCM16.bind(this);
    this.initSchedulerWorker();
  }

  private initSchedulerWorker() {
    const blob = new Blob([`
      let timeoutId;
      let intervalId;
      self.onmessage = function(e) {
        if (e.data.type === 'schedule') {
          timeoutId = setTimeout(() => {
            self.postMessage({ type: 'tick' });
          }, e.data.delay);
        } else if (e.data.type === 'start_interval') {
          if (intervalId) clearInterval(intervalId);
          intervalId = setInterval(() => {
            self.postMessage({ type: 'tick' });
          }, e.data.delay);
        } else if (e.data.type === 'stop') {
          clearTimeout(timeoutId);
          clearInterval(intervalId);
          intervalId = null;
        }
      };
    `], { type: 'application/javascript' });
    
    this.schedulerWorker = new Worker(URL.createObjectURL(blob));
    this.schedulerWorker.onmessage = (e) => {
      if (e.data.type === 'tick') {
        this.scheduleNextBuffer();
      }
    };
  }

  async addWorklet<T extends (d: any) => void>(
    workletName: string,
    workletSrc: string,
    handler: T
  ): Promise<this> {
    let workletsRecord = registeredWorklets.get(this.context);
    if (workletsRecord && workletsRecord[workletName]) {
      workletsRecord[workletName].handlers.push(handler);
      return Promise.resolve(this);
    }
    if (!workletsRecord) {
      registeredWorklets.set(this.context, {});
      workletsRecord = registeredWorklets.get(this.context)!;
    }
    workletsRecord[workletName] = { handlers: [handler] };
    const src = createWorketFromSrc(workletName, workletSrc);
    await this.context.audioWorklet.addModule(src);
    const worklet = new AudioWorkletNode(this.context, workletName);
    workletsRecord[workletName].node = worklet;
    return this;
  }

  private _processPCM16Chunk(chunk: Uint8Array): Float32Array {
    const float32Array = new Float32Array(chunk.length / 2);
    const dataView = new DataView(chunk.buffer);
    for (let i = 0; i < chunk.length / 2; i++) {
      try {
        const int16 = dataView.getInt16(i * 2, true);
        float32Array[i] = int16 / 32768;
      } catch (e) {
        console.error(e);
      }
    }
    return float32Array;
  }

  addPCM16(chunk: Uint8Array) {
    this.isStreamComplete = false;
    let processingBuffer = this._processPCM16Chunk(chunk);
    while (processingBuffer.length >= this.bufferSize) {
      const buffer = processingBuffer.slice(0, this.bufferSize);
      this.audioQueue.push(buffer);
      processingBuffer = processingBuffer.slice(this.bufferSize);
    }
    if (processingBuffer.length > 0) {
      this.audioQueue.push(processingBuffer);
    }
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.onPlay();
      this.scheduledTime = this.context.currentTime + this.initialBufferTime;
      this.scheduleNextBuffer();
    }
  }

  private createAudioBuffer(audioData: Float32Array): AudioBuffer {
    const audioBuffer = this.context.createBuffer(1, audioData.length, this.sampleRate);
    audioBuffer.getChannelData(0).set(audioData);
    return audioBuffer;
  }

  private scheduleNextBuffer() {
    // REDUCED: Lowered from 0.5s to 0.15s to keep the pipe tight.
    const SCHEDULE_AHEAD_TIME = 0.15;

    while (
      this.audioQueue.length > 0 &&
      this.scheduledTime < this.context.currentTime + SCHEDULE_AHEAD_TIME
    ) {
      const audioData = this.audioQueue.shift()!;
      const audioBuffer = this.createAudioBuffer(audioData);
      const source = this.context.createBufferSource();

      if (this.audioQueue.length === 0) {
        if (this.endOfQueueAudioSource) {
          this.endOfQueueAudioSource.onended = null;
        }
        this.endOfQueueAudioSource = source;
        source.onended = () => {
          if (!this.audioQueue.length && this.endOfQueueAudioSource === source) {
            this.endOfQueueAudioSource = null;
            this.onComplete();
            if (this.isPlaying) {
              this.isPlaying = false;
              this.onStop();
            }
          }
        };
      }

      source.buffer = audioBuffer;
      source.connect(this.gainNode);
      const startTime = Math.max(this.scheduledTime, this.context.currentTime);
      source.start(startTime);
      this.scheduledTime = startTime + audioBuffer.duration;
    }

    // Use Worker for timing instead of window.setTimeout/setInterval
    if (this.audioQueue.length === 0) {
      if (this.isStreamComplete) {
        this.isPlaying = false;
        this.onStop();
        this.schedulerWorker?.postMessage({ type: 'stop' });
      } else {
        // Start polling interval via worker
        this.schedulerWorker?.postMessage({ type: 'start_interval', delay: 30 });
      }
    } else {
      const nextCheckTime = (this.scheduledTime - this.context.currentTime) * 1000;
      // Schedule single timeout via worker
      this.schedulerWorker?.postMessage({ type: 'stop' }); // clear previous interval if any
      this.schedulerWorker?.postMessage({ type: 'schedule', delay: Math.max(0, nextCheckTime - 100) });
    }
  }

  stop() {
    this.isPlaying = false;
    this.onStop();
    this.isStreamComplete = true;
    this.audioQueue = [];
    this.scheduledTime = this.context.currentTime;
    
    // Stop worker timers
    this.schedulerWorker?.postMessage({ type: 'stop' });

    this.gainNode.gain.linearRampToValueAtTime(0, this.context.currentTime + 0.1);
    setTimeout(() => {
      this.gainNode.disconnect();
      this.gainNode = this.context.createGain();
      this.gainNode.connect(this.context.destination);
    }, 200);
  }

  async resume() {
    if (this.context.state === 'suspended') await this.context.resume();
    this.isStreamComplete = false;
    this.scheduledTime = this.context.currentTime + this.initialBufferTime;
    this.gainNode.gain.setValueAtTime(1, this.context.currentTime);
  }

  complete() {
    this.isStreamComplete = true;
    this.onComplete();
  }
}
