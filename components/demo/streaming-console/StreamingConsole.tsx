
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useRef, useState, useCallback } from 'react';
import cn from 'classnames';
import { Modality, LiveConnectConfig, LiveServerToolCall } from '@google/genai';
import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import { logToSupabase } from '../../../lib/supabase';
import { wsService } from '../../../lib/websocket-service';
import {
  useSettings,
  useLogStore,
  useTools,
} from '../../../lib/state';

export default function StreamingConsole() {
  const { client, setConfig, connected, inputVolume } = useLiveAPIContext();
  const { 
    systemPrompt, 
    supabaseEnabled, 
    webhookEnabled, 
    webhookUrl, 
    transcriptionMode,
    meetingId
  } = useSettings();
  const { tools } = useTools();
  const { turns, addTurn, sessionId } = useLogStore();
  
  const [transcriptionSegments, setTranscriptionSegments] = useState<string[]>([]);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [latencyWarning, setLatencyWarning] = useState(false);
  
  const clearTimeoutsRef = useRef<{ input?: number }>({});
  const lastActivityRef = useRef<number>(Date.now());
  const historyBottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastUserTextRef = useRef<string | null>(null);

  const handleActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const handleTurnComplete = useCallback(() => {
    handleActivity();
    if (lastUserTextRef.current && !isFinalizing) {
      const finalContent = lastUserTextRef.current;
      setIsFinalizing(true);

      // Animation duration (scribeDescent in index.css is 0.6s)
      setTimeout(() => {
        const timestamp = new Date();
        addTurn({ 
           role: 'user', 
           text: finalContent, 
           isFinal: true 
        });

        // Supabase Sync
        if (supabaseEnabled) {
          logToSupabase({
            session_id: sessionId,
            user_text: finalContent,
            agent_text: "[Log Only]",
            language: detectedLanguage || "Unknown"
          });
        }

        // Webhook Integration
        if (webhookEnabled && webhookUrl) {
          fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'transcription_finalized',
              sessionId,
              meetingId,
              text: finalContent,
              language: detectedLanguage || 'en',
              timestamp: timestamp.toISOString()
            })
          }).catch(err => console.error('Webhook Failure:', err));
        }

        setTranscriptionSegments([]);
        setIsFinalizing(false);
        lastUserTextRef.current = null;
      }, 600); 
    }
  }, [addTurn, detectedLanguage, handleActivity, isFinalizing, sessionId, supabaseEnabled, webhookEnabled, webhookUrl, meetingId]);

  const handleTranscriptionInput = useCallback((text: string, isFinal: boolean = false) => {
    handleActivity();
    if (isFinalizing) return;

    setTranscriptionSegments(prev => {
      const last = prev[prev.length - 1];
      if (last && text.startsWith(last)) {
        const iArr = [...prev];
        iArr[iArr.length - 1] = text;
        return iArr;
      }
      return [...prev, text].slice(-2); 
    });
    
    lastUserTextRef.current = text;

    // Check for 2 sentences to auto-finalize
    const sentenceCount = (text.match(/[.!?]/g) || []).length;
    if (sentenceCount >= 2) {
      handleTurnComplete();
      return;
    }

    if (isFinal) {
       handleTurnComplete();
    } else {
      if (clearTimeoutsRef.current.input) window.clearTimeout(clearTimeoutsRef.current.input);
      clearTimeoutsRef.current.input = window.setTimeout(() => {
        if (lastUserTextRef.current === text) {
           handleTurnComplete();
        }
      }, 5000);
    }
  }, [handleActivity, handleTurnComplete, isFinalizing]);

  // Listen for WebSocket messages (including native transcriptions)
  useEffect(() => {
    const handleWSMessage = (data: any) => {
      if (data.type === 'transcription') {
        handleTranscriptionInput(data.text, data.isFinal);
      }
    };
    wsService.on('message', handleWSMessage);
    return () => wsService.off('message', handleWSMessage);
  }, [handleTranscriptionInput]);

  // Auto-Scroll
  useEffect(() => {
    const scrollToBottom = () => {
      if (historyBottomRef.current) {
        historyBottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    };

    const frameId = requestAnimationFrame(scrollToBottom);
    return () => cancelAnimationFrame(frameId);
  }, [turns]);

  // Latency Monitoring
  useEffect(() => {
    if (!connected || transcriptionMode === 'native') {
      setLatencyWarning(false);
      return;
    }

    const interval = setInterval(() => {
      const isSpeaking = inputVolume > 0.08;
      const timeSinceLastActivity = Date.now() - lastActivityRef.current;

      if (isSpeaking && timeSinceLastActivity > 3000) {
        setLatencyWarning(true);
      } else if (timeSinceLastActivity < 1000) {
        setLatencyWarning(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [connected, inputVolume, transcriptionMode]);

  useEffect(() => {
    if (!connected && transcriptionMode === 'neural') {
      setDetectedLanguage(null);
      setTranscriptionSegments([]);
      setIsFinalizing(false);
    }
  }, [connected, transcriptionMode]);

  useEffect(() => {
    if (transcriptionMode !== 'neural') return;
    const activeTools = tools.filter(t => t.isEnabled);
    
    const config: LiveConnectConfig = {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Zephyr' },
        },
      },
      systemInstruction: systemPrompt || 'You are a professional scribe.',
      tools: activeTools.length > 0 ? [{ 
        functionDeclarations: activeTools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters
        })) 
      }] : undefined
    };
    setConfig(config);
  }, [setConfig, systemPrompt, tools, transcriptionMode]);

  const handleToolCall = useCallback((toolCall: LiveServerToolCall) => {
    handleActivity();
    for (const fc of toolCall.functionCalls) {
      if (fc.name === 'report_detected_language') {
        const lang = (fc.args as any).language;
        if (lang) {
          setDetectedLanguage(lang);
        }
      }
    }
  }, [handleActivity]);

  useEffect(() => {
    if (transcriptionMode !== 'neural') return;

    const onInputTrans = (text: string) => handleTranscriptionInput(text, false);

    client.on('inputTranscription', onInputTrans);
    client.on('audio', handleActivity);
    client.on('toolcall', handleToolCall);
    client.on('turncomplete', handleTurnComplete);

    return () => {
      client.off('inputTranscription', onInputTrans);
      client.off('audio', handleActivity);
      client.off('toolcall', handleToolCall);
      client.off('turncomplete', handleTurnComplete);
    };
  }, [client, handleActivity, handleToolCall, handleTranscriptionInput, handleTurnComplete, transcriptionMode]);

  const transcriptionText = transcriptionSegments.join(' ');
  const words = transcriptionText.split(' ').filter(w => w.length > 0);
  
  const sentenceCount = (transcriptionText.match(/[.!?]/g) || []).length;
  // USER REQUIREMENT: Turn green when it reaches 1-2 sentences.
  const hasReachedGoal = sentenceCount >= 1;

  return (
    <div className="streaming-console-v3">
      <section className="console-box live-stage-box">
        <header className="box-header">
          <div className="header-group">
            <span className="material-symbols-outlined box-icon">stream</span>
            <h3>{transcriptionMode === 'neural' ? 'Neural Input' : 'Native Input'}</h3>
          </div>
          <div className="header-status-group">
            {latencyWarning && (
              <div className="latency-warning-pill">
                <span className="material-symbols-outlined">network_check</span>
                <span>SYNC DELAY</span>
              </div>
            )}
            <div className={cn("status-dot", { connected: connected || (transcriptionMode === 'native' && words.length > 0) })}></div>
          </div>
        </header>
        
        <div className="box-content live-input-field-area">
          <div className="live-text-area">
             <div className={cn("live-result transcribe-mode", { 
               "is-finalizing": isFinalizing,
               "sentence-reached": hasReachedGoal,
               "has-content": words.length > 0 
             })}>
                {words.map((word, idx) => (
                  <span 
                    key={`${idx}-${word}`} 
                    className="animate-word"
                    style={{ animationDelay: `${(idx % 12) * 35}ms` }}
                  >
                    {word}{' '}
                  </span>
                ))}
                {!isFinalizing && (connected || transcriptionMode === 'native') && <span className={cn("blinking-cursor", { active: true })}></span>}
                {!transcriptionText && (connected || transcriptionMode === 'native') && !isFinalizing && (
                  <span className="ready-placeholder">Listening for speech...</span>
                )}
                {!connected && transcriptionMode === 'neural' && <span className="ready-placeholder">System Standby</span>}
             </div>
          </div>
        </div>
      </section>

      <section className="console-box history-box">
        <header className="box-header">
          <div className="header-group">
            <span className="material-symbols-outlined box-icon">history</span>
            <h3>Full Transcription History</h3>
          </div>
        </header>

        <div className="box-content archive-scroll" ref={scrollContainerRef}>
          <div className="archive-list">
            {turns.length === 0 ? (
              <div className="archive-empty">Verbatim transcript log will appear here...</div>
            ) : (
              turns.map((turn, i) => (
                <div key={i} className={cn("archive-turn-v2 animate-fall", turn.role)}>
                  <div className="turn-header">
                    <span className="role-badge">VERBATIM</span>
                    <span className="turn-time">{turn.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                  <div className="turn-content">{turn.text}</div>
                </div>
              ))
            )}
            <div ref={historyBottomRef} className="scroll-anchor" />
          </div>
        </div>
      </section>
    </div>
  );
}
