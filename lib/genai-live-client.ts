
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {
  GoogleGenAI,
  LiveConnectConfig,
  LiveServerMessage,
  LiveClientToolResponse,
} from '@google/genai';
import EventEmitter from 'eventemitter3';

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * GenAILiveClient wraps the Gemini Live API session and provides an event-driven interface
 * for handling audio, transcriptions, and tool calls.
 */
export class GenAILiveClient {
  private sessionPromise: any = null;
  private session: any = null;
  private model: string;
  private emitter = new EventEmitter();

  public on = this.emitter.on.bind(this.emitter);
  public off = this.emitter.off.bind(this.emitter);

  constructor(model: string) {
    this.model = model;
  }

  async connect(config: LiveConnectConfig): Promise<boolean> {
    if (this.session) return true;
    
    // CRITICAL: Always use process.env.API_KEY directly and instantiate 
    // right before connection to ensure we have the most up-to-date key from the dialog.
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      const err = new Error('API Key is missing. Please select a key.');
      this.emitter.emit('error', err);
      if (window.aistudio) window.aistudio.openSelectKey();
      return false;
    }

    const ai = new GoogleGenAI({ apiKey });
    
    try {
      this.sessionPromise = ai.live.connect({
        model: this.model,
        config: config,
        callbacks: {
          onopen: () => {
            this.emitter.emit('open');
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent) {
              this.emitter.emit('content', message.serverContent);
              
              const modelTurn = message.serverContent?.modelTurn;
              if (modelTurn?.parts) {
                for (const part of modelTurn.parts) {
                  if (part.inlineData?.data) {
                    const audioBytes = decode(part.inlineData.data);
                    this.emitter.emit('audio', audioBytes.buffer);
                  }
                  if (part.text) {
                    this.emitter.emit('text', part.text);
                  }
                }
              }

              if (message.serverContent.inputTranscription) {
                this.emitter.emit('inputTranscription', message.serverContent.inputTranscription.text);
              }
              if (message.serverContent.outputTranscription) {
                this.emitter.emit('outputTranscription', message.serverContent.outputTranscription.text);
              }
              if (message.serverContent.turnComplete) {
                this.emitter.emit('turncomplete');
              }
              if (message.serverContent.interrupted) {
                this.emitter.emit('interrupted');
              }
            }

            if (message.toolCall) {
              this.emitter.emit('toolcall', message.toolCall);
            }
          },
          onerror: (error: any) => {
            console.error('GenAILiveClient: Socket error', error);
            const msg = error?.message || '';
            
            // If the request fails with "Requested entity was not found", 
            // it often means the API key is invalid or lacks necessary permissions.
            if (msg.includes('Requested entity was not found') || msg.includes('Network error')) {
               console.warn('Network or Entity error detected. Prompting for key selection.');
               if (window.aistudio) {
                 window.aistudio.openSelectKey();
               }
            }

            this.emitter.emit('error', new Error(msg || 'Internal connection error occurred.'));
          },
          onclose: () => {
            this.emitter.emit('close');
            this.session = null;
            this.sessionPromise = null;
          },
        },
      });

      this.session = await this.sessionPromise;
      return true;
    } catch (e) {
      this.session = null;
      this.sessionPromise = null;
      console.debug('GenAILiveClient: Connection failed.', e);
      this.emitter.emit('error', e);
      return false;
    }
  }

  disconnect() {
    if (this.session) {
      try {
        this.session.close();
      } catch (e) {}
      this.session = null;
      this.sessionPromise = null;
    }
  }

  sendRealtimeInput(chunks: any[]) {
    if (this.sessionPromise) {
      this.sessionPromise.then((session: any) => {
        if (session && typeof session.sendRealtimeInput === 'function') {
          for (const chunk of chunks) {
            session.sendRealtimeInput({ media: chunk });
          }
        }
      });
    }
  }

  send(parts: any[], turnComplete: boolean) {
    if (this.sessionPromise) {
      this.sessionPromise.then((session: any) => {
        if (session && typeof session.sendRealtimeInput === 'function') {
          session.sendRealtimeInput({
            clientContent: {
              turns: [{ parts }],
              turnComplete,
            },
          });
        }
      });
    }
  }

  sendToolResponse(toolResponse: LiveClientToolResponse) {
    if (this.sessionPromise) {
      this.sessionPromise.then((session: any) => {
        if (session && typeof session.sendToolResponse === 'function') {
          session.sendToolResponse(toolResponse);
        }
      });
    }
  }
}
