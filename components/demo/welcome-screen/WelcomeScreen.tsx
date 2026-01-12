
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import './WelcomeScreen.css';
import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';

interface WelcomeScreenProps {
  onLaunch?: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onLaunch }) => {
  const { connect, connected } = useLiveAPIContext();

  const handleLaunch = async () => {
    if (onLaunch) {
      onLaunch();
    }
    if (!connected) {
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await window.aistudio.openSelectKey();
        }
      }
      connect().catch(console.error);
    }
  };

  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <div className="title-container">
          <span className="welcome-icon">description</span>
          <div className="title-text">
            <h2>Neural Scribe</h2>
            <p className="subtitle">High-Fidelity Verbatim Transcription</p>
          </div>
        </div>
        <p className="welcome-description">
          Experience ultra-low latency transcription powered by Gemini Live. 
          Perfect for meetings, interviews, and capturing pure verbal stream of consciousness.
        </p>
        
        <button className="launch-button" onClick={handleLaunch}>
          <span className="material-symbols-outlined filled">bolt</span>
          <span>Launch Transcription</span>
        </button>

        <div className="example-prompts-section">
          <h5 className="prompts-title">Capabilities</h5>
          <div className="example-prompts">
            <div className="prompt-card">
              Verbatim accuracy across 100+ global languages.
            </div>
            <div className="prompt-card">
              Real-time multi-user session binding.
            </div>
            <div className="prompt-card">
              Neural Voice Focus for noisy environments.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
