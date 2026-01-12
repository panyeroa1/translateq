
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import cn from 'classnames';
import React, { memo, useEffect, useRef, useState } from 'react';
import { AudioRecorder } from '../../../lib/audio-recorder';
import { useUI, useSettings } from '../../../lib/state';
import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import { wsService } from '../../../lib/websocket-service';
import { playChime } from '../../../lib/utils';

const MiniVisualizer = memo(({ volume, active }: { volume: number; active: boolean }) => {
  const bars = 4;
  if (!active || volume < 0.005) return null;

  return (
    <div className="mini-viz success">
      {Array.from({ length: bars }).map((_, i) => (
        <div 
          key={i} 
          className="mini-bar" 
          style={{ 
            height: `${Math.max(2, volume * 55 * (0.65 + Math.random() * 0.35))}px`,
            transition: 'height 0.04s ease-out'
          }} 
        />
      ))}
    </div>
  );
});

function ControlTray() {
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const { client, connected, connect, disconnect, setInputVolume, inputVolume } = useLiveAPIContext();
  const { toggleSidebar, isSidebarOpen } = useUI();
  // Fix: Destructure setVoiceFocus from useSettings to allow toggling Voice Focus sensitivity.
  const { voiceFocus, transcriptionMode, setVoiceFocus } = useSettings();
  
  // Native Recognition Ref
  const recognitionRef = useRef<any>(null);
  const [isNativeTranscribing, setIsNativeTranscribing] = useState(false);

  // Initialize Native WebSpeech
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition && !recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const transcript = finalTranscript || interimTranscript;
        if (transcript.trim()) {
          // SHIP TO WEBSOCKET
          wsService.sendPrompt({ 
            type: 'transcription', 
            text: transcript, 
            isFinal: !!finalTranscript,
            source: 'native' 
          });
        }
      };

      recognition.onend = () => {
        if (isNativeTranscribing) {
          recognition.start(); // Auto-restart if we intended to stay active
        }
      };

      recognitionRef.current = recognition;
    }
  }, [isNativeTranscribing]);

  // Audio Recording (Neural Mode)
  useEffect(() => {
    if (transcriptionMode !== 'neural') {
       audioRecorder.stop();
       return;
    }

    const onData = (base64: string) => {
      client.sendRealtimeInput([{
        mimeType: 'audio/pcm;rate=16000',
        data: base64,
      }]);
    };

    const onVolume = (v: number) => {
      if (connected && !muted) {
        setInputVolume(v);
      } else {
        setInputVolume(0);
      }
    };

    if (connected && !muted && audioRecorder) {
      audioRecorder.on('data', onData);
      audioRecorder.on('volume', onVolume);
      audioRecorder.start();
    } else {
      audioRecorder.stop();
      setInputVolume(0);
    }
    return () => {
      audioRecorder.off('data', onData);
      audioRecorder.off('volume', onVolume);
    };
  }, [connected, client, muted, audioRecorder, setInputVolume, transcriptionMode]);

  // Play chime when neural session connects
  useEffect(() => {
    if (connected && transcriptionMode === 'neural') {
      playChime();
    }
  }, [connected, transcriptionMode]);

  const handleMicClick = () => {
    if (transcriptionMode === 'native') {
      if (isNativeTranscribing) {
        recognitionRef.current?.stop();
        setIsNativeTranscribing(false);
      } else {
        playChime();
        recognitionRef.current?.start();
        setIsNativeTranscribing(true);
      }
      return;
    }

    // Default Neural Logic
    if (connected) {
      setMuted(!muted);
    } else {
      connect();
    }
  };

  const showMicViz = (transcriptionMode === 'neural' && connected && !muted) || (transcriptionMode === 'native' && isNativeTranscribing);

  return (
    <section className="control-tray-floating">
      <div className="control-tray-content">
        <div className={cn('floating-pill', { 'focus-active': connected || isNativeTranscribing })}>
          <button className={cn('icon-button', { active: isSidebarOpen })} onClick={toggleSidebar}>
            <span className="material-symbols-outlined">settings</span>
          </button>

          <button className={cn('icon-button', { active: voiceFocus })} onClick={() => setVoiceFocus(!voiceFocus)}>
            <span className="material-symbols-outlined">
              {voiceFocus ? 'center_focus_strong' : 'center_focus_weak'}
            </span>
          </button>

          <button 
            className={cn('icon-button relative-btn', { 
              active: showMicViz, 
              muted: (muted && connected) || (!isNativeTranscribing && transcriptionMode === 'native')
            })} 
            onClick={handleMicClick}
          >
            <MiniVisualizer volume={inputVolume || (isNativeTranscribing ? 0.2 : 0)} active={showMicViz} />
            <span className={cn('material-symbols-outlined', { 'filled': showMicViz })}>
              {showMicViz ? 'mic' : 'mic_off'}
            </span>
          </button>

          {transcriptionMode === 'neural' && (
            <button className={cn('icon-button main-action', { connected })} onClick={connected ? disconnect : connect}>
              <span className="material-symbols-outlined filled">
                {connected ? 'stop' : 'play_arrow'}
              </span>
            </button>
          )}
          
          {transcriptionMode === 'native' && (
            <div className="native-indicator">
              <span className="native-label">NATIVE API</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default memo(ControlTray);
