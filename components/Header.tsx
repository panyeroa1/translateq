
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import { useSettings } from '../lib/state';
import cn from 'classnames';

export default function Header() {
  const { meetingId } = useSettings();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!meetingId) return;
    navigator.clipboard.writeText(meetingId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="header-glass sticky-header header-minimal">
      <div className="header-brand">
        <span className="material-symbols-outlined brand-icon">description</span>
        <h2 className="brand-title">Neural Scribe</h2>
      </div>
      
      <div className="header-host-info">
        <div className={cn("host-pill", { "has-id": !!meetingId })}>
          <span className="material-symbols-outlined host-icon">
            {meetingId ? 'hub' : 'record_voice_over'}
          </span>
          <div className="host-text-group">
            <span className="host-label">HOST SPEAKER</span>
            <span className="host-id">{meetingId || 'ISOLATED SESSION'}</span>
          </div>
          
          {meetingId && (
            <button 
              className={cn("header-copy-btn", { copied })} 
              onClick={handleCopy}
              title="Copy Meeting ID"
            >
              <span className="material-symbols-outlined">
                {copied ? 'check_circle' : 'content_copy'}
              </span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
