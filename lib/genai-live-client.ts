
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
  private sessionPromise: Promise<any> | null = null;
  private session: any = null;
  private model: string;
  private emitter = new EventEmitter();

  public on = this.emitter.on.bind(this.emitter);
  public off = this.emitter.off.bind(this.emitter);

  constructor(model: string) {
    this.model = model;
  }

  async connect(config: LiveConnectConfig): Promise<boolean> {
    if (this.session || this.sessionPromise) return true;
    
    // CRITICAL: Always use process.env.API_KEY directly.
    const apiKey = process.env.API_KEY;
    if (!apiKey || apiKey === 'undefined' || apiKey.length < 5) {
      console.warn('GenAILiveClient: API Key is missing or invalid. Prompting user.');
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
      }
      return false;
    }

    const ai = new GoogleGenAI({ apiKey });
    console.debug('GenAILiveClient: Attempting connection to model:', this.model);
    
    try {
      this.sessionPromise = ai.live.connect({
        model: this.model,
        config: config,
        callbacks: {
          onopen: () => {
            console.debug('GenAILiveClient: WebSocket Opened');
            this.emitter.emit('open');
          },
          onmessage: async (message: LiveServerMessage) => {
            try {
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
            } catch (msgError) {
              console.error('GenAILiveClient: Error processing message', msgError);
            }
          },
          onerror: (error: any) => {
            console.error('GenAILiveClient: Socket error detected', error);
            const msg = error?.message || '';
            
            // Handle Network errors or entity not found by prompting for key re-selection
            if (msg.includes('Requested entity was not found') || msg.includes('Network error') || !msg) {
               console.warn('Possible Auth/Network failure. Re-opening key selector.');
               if (window.aistudio) {
                 window.aistudio.openSelectKey();
               }
            }

            this.emitter.emit('error', new Error(msg || 'Connection error: Check API key and internet access.'));
            this.session = null;
            this.sessionPromise = null;
          },
          onclose: (e: CloseEvent) => {
            console.debug('GenAILiveClient: WebSocket Closed', e.code, e.reason);
            this.emitter.emit('close');
            this.session = null;
            this.sessionPromise = null;
          },
        },
      });

      this.session = await this.sessionPromise;
      return true;
    } catch (e: any) {
      this.session = null;
      this.sessionPromise = null;
      console.error('GenAILiveClient: Initial connection catch', e);
      this.emitter.emit('error', e);
      return false;
    }
  }

  disconnect() {
    if (this.session) {
      try {
        this.session.close();
      } catch (e) {}
    }
    this.session = null;
    this.sessionPromise = null;
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
