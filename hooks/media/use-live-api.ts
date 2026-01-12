
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GenAILiveClient } from '../../lib/genai-live-client';
import { LiveConnectConfig, Modality, LiveServerToolCall } from '@google/genai';
import { AudioStreamer } from '../../lib/audio-streamer';
import { audioContext } from '../../lib/utils';
import VolMeterWorket from '../../lib/worklets/vol-meter';
import { useSettings } from '../../lib/state';
import { wsService } from '../../lib/websocket-service';

export type UseLiveApiResults = {
  client: GenAILiveClient;
  setConfig: (config: LiveConnectConfig) => void;
  config: LiveConnectConfig;
  connect: () => Promise<void>;
  disconnect: () => void;
  connected: boolean;
  isAiSpeaking: boolean;
  volume: number; 
  outputVolume: number;
  inputVolume: number;
  setInputVolume: (v: number) => void;
};

export function useLiveApi(): UseLiveApiResults {
  const { model, transcriptionMode } = useSettings();
  
  const client = useMemo(() => {
    return new GenAILiveClient(model);
  }, [model]);

  const audioStreamerRef = useRef<AudioStreamer | null>(null);

  const [outputVolume, setOutputVolume] = useState(0);
  const [inputVolume, setInputVolume] = useState(0);
  const [connected, setConnected] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  
  // FIX: Initialize with Modality.AUDIO to prevent 'Operation not supported' errors on first connect
  const [config, setConfig] = useState<LiveConnectConfig>({
    responseModalities: [Modality.AUDIO],
    inputAudioTranscription: {},
  });

  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: 'audio-out' }).then((audioCtx: AudioContext) => {
        const streamer = new AudioStreamer(audioCtx);
        audioStreamerRef.current = streamer;
        streamer.onPlay = () => setIsAiSpeaking(true);
        streamer.onStop = () => setIsAiSpeaking(false);

        streamer.addWorklet<any>('vumeter-out', VolMeterWorket, (ev: any) => {
          setOutputVolume(ev.data.volume);
        }).catch(console.error);
      });
    }
  }, []);

  useEffect(() => {
    const onOpen = () => setConnected(true);
    const onClose = () => {
      setConnected(false);
      setInputVolume(0);
      setOutputVolume(0);
    };
    const onError = () => {
      setConnected(false);
      setInputVolume(0);
      setOutputVolume(0);
    };
    
    // MUTE: The user only wants transcription. We intentionally ignore the audio modality output.
    const onAudio = (data: ArrayBuffer) => {
      // Logic removed to satisfy 'mute speaking function' request.
      // Modality.AUDIO is still used to satisfy Gemini Live API requirements, 
      // but we simply do not play the bytes.
      console.debug('Audio chunk received and suppressed (transcription-only mode).');
    };

    const onToolCall = (toolCall: LiveServerToolCall) => {
      for (const fc of toolCall.functionCalls) {
        if (fc.name === 'broadcast_to_websocket') {
          const text = (fc.args as any).text;
          wsService.sendPrompt(text);
          // Following guideline exactly: send response for the specific ID. 
          // Fix: functionResponses must be an array.
          client.sendToolResponse({ 
            functionResponses: [{ 
              id: fc.id, 
              name: fc.name, 
              response: { result: 'ok' } 
            }] 
          });
        } else {
          // Fix: functionResponses must be an array.
          client.sendToolResponse({ 
            functionResponses: [{ 
              id: fc.id, 
              name: fc.name, 
              response: { result: 'ok' } 
            }] 
          });
        }
      }
    };

    client.on('open', onOpen);
    client.on('close', onClose);
    client.on('error', onError);
    client.on('audio', onAudio);
    client.on('toolcall', onToolCall);

    return () => {
      client.off('open', onOpen);
      client.off('close', onClose);
      client.off('error', onError);
      client.off('audio', onAudio);
      client.off('toolcall', onToolCall);
    };
  }, [client]);

  const connect = useCallback(async () => {
    if (connected) return;
    return client.connect(config).then(() => {});
  }, [client, config, connected]);

  const disconnect = useCallback(() => {
    client.disconnect();
    setConnected(false);
    setInputVolume(0);
    setOutputVolume(0);
  }, [client]);

  return { 
    client, 
    config, 
    setConfig, 
    connect, 
    connected, 
    disconnect, 
    isAiSpeaking, 
    volume: outputVolume,
    outputVolume, 
    inputVolume,
    setInputVolume
  };
}
