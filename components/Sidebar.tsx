
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useSettings, useUI } from '../lib/state';
import c from 'classnames';
import { useLiveAPIContext } from '../contexts/LiveAPIContext';
import { useState } from 'react';

export default function Sidebar() {
  const { isSidebarOpen, toggleSidebar } = useUI();
  const { 
    voiceFocus, 
    supabaseEnabled, 
    webhookEnabled,
    webhookUrl,
    meetingId, 
    transcriptionMode, 
    setVoiceFocus, 
    setSupabaseEnabled, 
    setWebhookEnabled,
    setWebhookUrl,
    setMeetingId, 
    setTranscriptionMode 
  } = useSettings();
  const { connected } = useLiveAPIContext();
  
  const [copied, setCopied] = useState(false);

  const handleGenerateMeetingId = () => {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    setMeetingId(id);
  };

  const handleCopyMeetingId = () => {
    if (!meetingId) return;
    navigator.clipboard.writeText(meetingId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClearId = () => {
    setMeetingId('');
  };

  return (
    <aside className={c('sidebar', { open: isSidebarOpen })}>
      <div className="sidebar-header">
        <div className="sidebar-title-group">
          <span className="material-symbols-outlined sidebar-icon">settings</span>
          <h3>Control Center</h3>
        </div>
        <button onClick={toggleSidebar} className="sidebar-close-btn" aria-label="Close">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="sidebar-scroll">
        <div className="sidebar-section">
          <header className="section-header">
            <span className="material-symbols-outlined">hub</span>
            <h4>Session Binding</h4>
          </header>
          
          <div className="settings-card">
            <div className="setting-row vertical">
              <div className="setting-info">
                <label className="setting-label">Meeting Host ID</label>
                <p className="setting-desc">Broadcasting transcriptions via WebSocket</p>
              </div>
              <div className="meeting-id-controls">
                <input 
                  type="text"
                  className="meeting-id-input"
                  value={meetingId}
                  onChange={(e) => setMeetingId(e.target.value.toUpperCase())}
                  placeholder="AUTO-GENERATE OR TYPE ID"
                  spellCheck={false}
                />
                <div className="meeting-id-actions">
                  <button className="id-btn" onClick={handleGenerateMeetingId} title="Generate New ID">
                    <span className="material-symbols-outlined">refresh</span>
                  </button>
                  <button className="id-btn" onClick={handleCopyMeetingId} disabled={!meetingId} title="Copy ID">
                    <span className="material-symbols-outlined">{copied ? 'check' : 'content_copy'}</span>
                  </button>
                  <button className="id-btn danger" onClick={handleClearId} disabled={!meetingId} title="End Session">
                    <span className="material-symbols-outlined">power_settings_new</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sidebar-section">
          <header className="section-header">
            <span className="material-symbols-outlined">link</span>
            <h4>External Integrations</h4>
          </header>
          
          <div className="settings-card">
            <div className="setting-row vertical">
              <div className="setting-info">
                <label className="setting-label">Webhook URL</label>
                <p className="setting-desc">POST verbatim JSON to external endpoints</p>
              </div>
              <input 
                type="url"
                className="meeting-id-input"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-api.com/webhook"
                spellCheck={false}
              />
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <label className="setting-label">Enable Webhook</label>
                <p className="setting-desc">Fire on transcription finalization</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={webhookEnabled}
                  onChange={(e) => setWebhookEnabled(e.target.checked)}
                />
                <span className="slider round"></span>
              </label>
            </div>
          </div>
        </div>

        <div className="sidebar-section">
          <header className="section-header">
            <span className="material-symbols-outlined">speech_to_text</span>
            <h4>Transcription Engine</h4>
          </header>
          <div className="settings-card">
             <div className="setting-row">
              <div className="setting-info">
                <label className="setting-label">Engine Selector</label>
                <p className="setting-desc">{transcriptionMode === 'neural' ? 'Gemini Live' : 'Native Browser API'}</p>
              </div>
              <select 
                value={transcriptionMode} 
                onChange={(e) => setTranscriptionMode(e.target.value as any)}
                className="minimal-select"
              >
                <option value="neural">Neural (Gemini)</option>
                <option value="native">Native (WebSpeech)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="sidebar-section">
          <header className="section-header">
            <span className="material-symbols-outlined">analytics</span>
            <h4>Scribe Sensitivity</h4>
          </header>
          
          <div className="settings-card">
            <div className="setting-row">
              <div className="setting-info">
                <label className="setting-label">Voice Focus</label>
                <p className="setting-desc">Speaker Isolation</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={voiceFocus}
                  onChange={(e) => setVoiceFocus(e.target.checked)}
                />
                <span className="slider round"></span>
              </label>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <label className="setting-label">Supabase Sync</label>
                <p className="setting-desc">Log Transcripts</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={supabaseEnabled}
                  onChange={(e) => setSupabaseEnabled(e.target.checked)}
                />
                <span className="slider round"></span>
              </label>
            </div>
          </div>
        </div>
      </div>
      
      <div className="sidebar-footer">
        <div className="footer-status">
          <div className="status-label-group">
            <div className={c('status-light', { connected })} />
            <span className="status-indicator">
              {connected ? 'CONNECTED' : 'STANDBY'}
            </span>
          </div>
          <div className="status-meeting">
            {meetingId ? `BINDED: ${meetingId}` : 'ISOLATED'}
          </div>
          <span className="version-text">v4.2.0 [EBURON.AI]</span>
        </div>
      </div>
    </aside>
  );
}
