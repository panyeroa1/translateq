
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ControlTray from './components/console/control-tray/ControlTray';
import ErrorScreen from './components/demo/ErrorScreen';
import StreamingConsole from './components/demo/streaming-console/StreamingConsole';
import { LiveAPIProvider } from './contexts/LiveAPIContext';

/**
 * Main application component. 
 * Features a modern, focused translation interface with floating controls.
 */
function App() {
  return (
    <div className="App">
      <LiveAPIProvider>
        <Header />
        <Sidebar />
        <ErrorScreen />
        <main className="main-content">
          <StreamingConsole />
          <ControlTray />
        </main>
      </LiveAPIProvider>
    </div>
  );
}

export default App;
