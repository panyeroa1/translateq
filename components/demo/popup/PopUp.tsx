
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import './PopUp.css';

interface PopUpProps {
  onClose: () => void;
}

const PopUp: React.FC<PopUpProps> = ({ onClose }) => {
  return (
    <div className="popup-overlay">
      <div className="popup-content onboarding-card">
        <div className="onboarding-header">
          <span className="material-symbols-outlined brand-icon">auto_awesome</span>
          <h2>Super Translator</h2>
          <p className="subtitle">Real-time Linguistic Intelligence</p>
        </div>
        
        <div className="onboarding-steps">
          <div className="step-item">
            <div className="step-icon">
              <span className="material-symbols-outlined">language</span>
            </div>
            <div className="step-text">
              <h3>Select Target</h3>
              <p>Choose your destination language or dialect from the library of 100+ native profiles.</p>
            </div>
          </div>

          <div className="step-item">
            <div className="step-icon accent">
              <span className="material-symbols-outlined">bolt</span>
            </div>
            <div className="step-text">
              <h3>Ignite Flow</h3>
              <p>Press the bolt icon to connect to the neural engine. Your microphone will activate.</p>
            </div>
          </div>

          <div className="step-item">
            <div className="step-icon">
              <span className="material-symbols-outlined">graphic_eq</span>
            </div>
            <div className="step-text">
              <h3>Speak Naturally</h3>
              <p>No buttons required. The AI detects your speech, translates, and speaks back in a high-fidelity voice.</p>
            </div>
          </div>

          <div className="step-item">
            <div className="step-icon">
              <span className="material-symbols-outlined">center_focus_strong</span>
            </div>
            <div className="step-text">
              <h3>Voice Focus</h3>
              <p>Enable Neural Sensitivity in noisy environments to isolate the primary speaker from background noise.</p>
            </div>
          </div>
        </div>

        <div className="onboarding-footer">
          <button className="primary-onboarding-btn" onClick={onClose}>
            Get Started
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PopUp;
