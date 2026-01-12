
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import EventEmitter from 'eventemitter3';
import { useSettings } from './state';

export interface WebSocketEvents {
  message: (data: { type: string; text: string; mode?: string; timestamp?: number; meetingId?: string }) => void;
  status: (status: 'connected' | 'disconnected' | 'connecting') => void;
}

export class WebSocketService {
  private ws: WebSocket | null = null;
  private emitter = new EventEmitter<WebSocketEvents>();
  private _status: 'connected' | 'disconnected' | 'connecting' = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 0; // Disable auto-reconnect by default for local WS
  private channel: BroadcastChannel;

  public on = this.emitter.on.bind(this.emitter);
  public off = this.emitter.off.bind(this.emitter);

  constructor(private url: string = 'ws://localhost:8080/prompts') {
    this.channel = new BroadcastChannel('super-translator-sync');
    this.channel.onmessage = (event) => {
      const data = event.data;
      const localMeetingId = useSettings.getState().meetingId;
      
      // BINDING LOGIC: Only emit if both IDs match or both are empty
      if (!localMeetingId || !data.meetingId || data.meetingId === localMeetingId) {
        this.emitter.emit('message', data);
      }
    };
  }

  public get status() { return this._status; }

  private setStatus(newStatus: 'connected' | 'disconnected' | 'connecting') {
    this._status = newStatus;
    this.emitter.emit('status', newStatus);
  }

  public connect() {
    if (this.ws || this._status === 'connecting') return;

    // Strictly only allow localhost for local WebSocket server
    const isLocal = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (!isLocal) {
      return;
    }

    this.setStatus('connecting');
    try {
      this.ws = new WebSocket(this.url);

      const connectionTimeout = setTimeout(() => {
        if (this._status === 'connecting') {
          try { this.ws?.close(); } catch(e) {}
          this.setStatus('disconnected');
          this.ws = null;
        }
      }, 1000);

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        this.setStatus('connected');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const localMeetingId = useSettings.getState().meetingId;
          
          if (!localMeetingId || !data.meetingId || data.meetingId === localMeetingId) {
            this.emitter.emit('message', data);
          }
        } catch {
          this.emitter.emit('message', { type: 'chat', text: event.data });
        }
      };

      this.ws.onerror = () => {
        clearTimeout(connectionTimeout);
        this.setStatus('disconnected');
        this.ws = null;
      };

      this.ws.onclose = () => {
        clearTimeout(connectionTimeout);
        this.setStatus('disconnected');
        this.ws = null;
      };
    } catch (err) {
      this.setStatus('disconnected');
      this.ws = null;
    }
  }

  public sendPrompt(data: any) {
    const localMeetingId = useSettings.getState().meetingId;
    const payload = typeof data === 'string' 
      ? { type: 'chat', text: data, timestamp: Date.now(), meetingId: localMeetingId } 
      : { ...data, meetingId: data.meetingId || localMeetingId };
    
    // Always use BroadcastChannel for local cross-tab sync
    try {
      this.channel.postMessage(payload);
    } catch (e) {}

    // Optionally send to real WebSocket if connected
    if (this.ws && this._status === 'connected') {
      try {
        this.ws.send(JSON.stringify(payload));
        return true;
      } catch (e) {
        return false;
      }
    }
    return true; 
  }
}

export const wsService = new WebSocketService();
