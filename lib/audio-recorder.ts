
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { audioContext } from './utils';
import AudioRecordingWorklet from './worklets/audio-processing';
import VolMeterWorket from './worklets/vol-meter';

import { createWorketFromSrc } from './audioworklet-registry';
import EventEmitter from 'eventemitter3';

function arrayBufferToBase64(buffer: ArrayBuffer) {
  var binary = '';
  var bytes = new Uint8Array(buffer);
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export class AudioRecorder {
  private emitter = new EventEmitter();

  public on = this.emitter.on.bind(this.emitter);
  public off = this.emitter.off.bind(this.emitter);

  stream: MediaStream | undefined;
  audioContext: AudioContext | undefined;
  source: MediaStreamAudioSourceNode | undefined;
  recording: boolean = false;
  recordingWorklet: AudioWorkletNode | undefined;
  vuWorklet: AudioWorkletNode | undefined;

  private starting: Promise<void> | null = null;
  
  // Adaptive VAD & Gain State
  private currentGain: number = 1.0;
  private targetGain: number = 1.0;
  private noiseFloor: number = 0.005;
  private isSpeaking: boolean = false;
  private silenceFrames: number = 0;
  private calibrationFrames: number = 30; // ~750ms calibration
  
  // Rolling volume average for stability
  private volumeHistory: number[] = [];
  private readonly HISTORY_SIZE = 12;

  // Ducking Logic Variables
  private volumeMultiplier: number = 1.0; 
  private targetVolumeMultiplier: number = 1.0; 

  constructor(public sampleRate = 16000) {}

  public setVolumeMultiplier(multiplier: number) {
    this.targetVolumeMultiplier = multiplier;
  }

  /**
   * Dynamically adjusts sensitivity and gain based on ambient noise levels.
   */
  private updateSensitivity(volume: number) {
    // 1. Rolling Average for Energy Smoothing
    this.volumeHistory.push(volume);
    if (this.volumeHistory.length > this.HISTORY_SIZE) {
      this.volumeHistory.shift();
    }
    const smoothVolume = this.volumeHistory.reduce((a, b) => a + b, 0) / this.volumeHistory.length;

    // 2. Initial Calibration Phase
    if (this.calibrationFrames > 0) {
      // Establish baseline noise floor aggressively during start
      this.noiseFloor = (this.noiseFloor * 0.7) + (smoothVolume * 0.3);
      this.calibrationFrames--;
      return;
    }

    // 3. Adaptive Noise Floor Tracking
    // Use an asymmetric filter: noise floor drifts up slowly but down even more slowly
    const isBackground = smoothVolume < (this.noiseFloor * 1.8);
    const noiseAlpha = isBackground ? 0.02 : 0.0005; 
    this.noiseFloor = this.noiseFloor * (1 - noiseAlpha) + Math.max(0.0005, smoothVolume) * noiseAlpha;

    // 4. Dynamic Thresholding (Adaptive Schmidt Trigger)
    const dynamicHeadroom = 1.5 + (this.noiseFloor * 20); // More headroom in noisy environments
    const START_THRESHOLD = this.noiseFloor * (2.5 * dynamicHeadroom) + 0.008; 
    const STOP_THRESHOLD = this.noiseFloor * (1.2 * dynamicHeadroom) + 0.004;
    
    // 5. VAD State Machine
    if (!this.isSpeaking && smoothVolume > START_THRESHOLD) {
      this.isSpeaking = true;
      this.silenceFrames = 0;
    } else if (this.isSpeaking) {
      if (smoothVolume < STOP_THRESHOLD) {
        this.silenceFrames++;
        if (this.silenceFrames > 40) { // ~1 second of silence to end turn
          this.isSpeaking = false;
        }
      } else {
        this.silenceFrames = 0;
      }
    }

    // 6. Proportional Automatic Gain Control (AGC)
    const TARGET_LEVEL = 0.5;
    const MAX_BOOST = 15.0; 
    
    if (this.isSpeaking) {
      // Target a specific RMS level
      const neededBoost = TARGET_LEVEL / Math.max(0.001, smoothVolume);
      this.targetGain = Math.min(MAX_BOOST, Math.max(0.5, neededBoost));
    } else {
      // Lower gain during silence to reduce background noise amplification
      this.targetGain = 0.05; 
    }

    // 7. Non-Linear Gain Smoothing
    const gainAlpha = this.targetGain > this.currentGain ? 0.35 : 0.08;
    this.currentGain = this.currentGain * (1 - gainAlpha) + this.targetGain * gainAlpha;
    
    // 8. Refined Asymmetric Ducking
    const isDucking = this.targetVolumeMultiplier < this.volumeMultiplier;
    const duckingAlpha = isDucking ? 0.5 : 0.04; // Instant ducking, slow recovery
    this.volumeMultiplier = this.volumeMultiplier * (1 - duckingAlpha) + this.targetVolumeMultiplier * duckingAlpha;

    const finalGain = this.currentGain * this.volumeMultiplier;

    if (this.recordingWorklet) {
      this.recordingWorklet.port.postMessage({ gain: finalGain });
    }
  }

  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Could not request user media');
    }

    this.starting = new Promise(async (resolve, reject) => {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false, 
            channelCount: 1,
            sampleRate: this.sampleRate
          } 
        });
        
        this.audioContext = await audioContext({ sampleRate: this.sampleRate });
        this.source = this.audioContext.createMediaStreamSource(this.stream);

        const workletName = 'audio-recorder-worklet';
        const src = createWorketFromSrc(workletName, AudioRecordingWorklet);

        await this.audioContext.audioWorklet.addModule(src);
        this.recordingWorklet = new AudioWorkletNode(
          this.audioContext,
          workletName
        );

        this.recordingWorklet.port.onmessage = async (ev: MessageEvent) => {
          const arrayBuffer = ev.data.data.int16arrayBuffer;
          if (arrayBuffer) {
            const arrayBufferString = arrayBufferToBase64(arrayBuffer);
            this.emitter.emit('data', arrayBufferString);
          }
        };
        this.source.connect(this.recordingWorklet);

        const vuWorkletName = 'vu-meter';
        await this.audioContext.audioWorklet.addModule(
          createWorketFromSrc(vuWorkletName, VolMeterWorket)
        );
        this.vuWorklet = new AudioWorkletNode(this.audioContext, vuWorkletName);
        this.vuWorklet.port.onmessage = (ev: MessageEvent) => {
          const volume = ev.data.volume;
          this.emitter.emit('volume', volume);
          this.updateSensitivity(volume);
        };

        this.source.connect(this.vuWorklet);
        this.recording = true;
        this.calibrationFrames = 30; 
        resolve();
        this.starting = null;
      } catch (err) {
        reject(err);
      }
    });
  }

  stop() {
    const handleStop = () => {
      this.source?.disconnect();
      this.stream?.getTracks().forEach(track => track.stop());
      this.stream = undefined;
      this.recordingWorklet = undefined;
      this.vuWorklet = undefined;
      this.recording = false;
      this.currentGain = 1.0;
      this.targetGain = 1.0;
      this.volumeMultiplier = 1.0;
      this.targetVolumeMultiplier = 1.0;
      this.isSpeaking = false;
      this.silenceFrames = 0;
      this.volumeHistory = [];
    };
    if (this.starting) {
      this.starting.then(handleStop).catch(handleStop);
      return;
    }
    handleStop();
  }
}
