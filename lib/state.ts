
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FunctionResponseScheduling } from '@google/genai';
import { DEFAULT_LIVE_API_MODEL, DEFAULT_VOICE } from './constants';
import { AVAILABLE_TOOLS } from './tools';

const transcriptionPromptTemplate = `You are a professional transcriptionist.
Your task is to transcribe everything the user says accurately.
Call the "broadcast_to_websocket" tool for every phrase you hear to keep the session in sync.
Keep your output verbatim. {VOICE_FOCUS_INSTRUCTION}`;

const voiceFocusActiveSnippet = `Use high neural sensitivity to isolate the primary speaker.`;

const generatePrompt = (voiceFocus: boolean) => {
  return transcriptionPromptTemplate.replace('{VOICE_FOCUS_INSTRUCTION}', voiceFocus ? voiceFocusActiveSnippet : '');
};

interface SettingsState {
  systemPrompt: string;
  model: string;
  voice: string;
  voiceFocus: boolean;
  supabaseEnabled: boolean;
  webhookEnabled: boolean;
  webhookUrl: string;
  meetingId: string;
  transcriptionMode: 'neural' | 'native';
  setSystemPrompt: (prompt: string) => void;
  setModel: (model: string) => void;
  setVoice: (voice: string) => void;
  setVoiceFocus: (focus: boolean) => void;
  setSupabaseEnabled: (enabled: boolean) => void;
  setWebhookEnabled: (enabled: boolean) => void;
  setWebhookUrl: (url: string) => void;
  setMeetingId: (id: string) => void;
  setTranscriptionMode: (mode: 'neural' | 'native') => void;
  refreshSystemPrompt: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      systemPrompt: generatePrompt(false),
      model: DEFAULT_LIVE_API_MODEL,
      voice: DEFAULT_VOICE,
      voiceFocus: false,
      supabaseEnabled: false,
      webhookEnabled: false,
      webhookUrl: '',
      meetingId: '',
      transcriptionMode: 'neural',
      setSystemPrompt: prompt => set({ systemPrompt: prompt }),
      setModel: model => set({ model }),
      setVoice: voice => set({ voice }),
      setVoiceFocus: focus => set(state => ({ voiceFocus: focus, systemPrompt: generatePrompt(focus) })),
      setSupabaseEnabled: enabled => set({ supabaseEnabled: enabled }),
      setWebhookEnabled: enabled => set({ webhookEnabled: enabled }),
      setWebhookUrl: webhookUrl => set({ webhookUrl }),
      setMeetingId: meetingId => set({ meetingId }),
      setTranscriptionMode: transcriptionMode => set({ transcriptionMode }),
      refreshSystemPrompt: () => set(state => ({ systemPrompt: generatePrompt(state.voiceFocus) }))
    }),
    {
      name: 'tcaller-settings-transcribe-v3',
      partialize: (state) => ({ 
        meetingId: state.meetingId,
        voice: state.voice,
        voiceFocus: state.voiceFocus,
        supabaseEnabled: state.supabaseEnabled,
        webhookEnabled: state.webhookEnabled,
        webhookUrl: state.webhookUrl,
        transcriptionMode: state.transcriptionMode
      }),
    }
  )
);

export const useUI = create<{
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}>(set => ({
  isSidebarOpen: false,
  toggleSidebar: () => set(state => ({ isSidebarOpen: !state.isSidebarOpen })),
}));

export interface FunctionCall {
  name: string;
  description?: string;
  parameters?: any;
  isEnabled: boolean;
  scheduling?: FunctionResponseScheduling;
}

export const useTools = create<{
  tools: FunctionCall[];
  toggleTool: (name: string) => void;
  updateTool: (name: string, updated: Partial<FunctionCall>) => void;
}>(set => ({
  tools: AVAILABLE_TOOLS,
  toggleTool: name => set(state => ({
    tools: state.tools.map(t => t.name === name ? { ...t, isEnabled: !t.isEnabled } : t)
  })),
  updateTool: (name, updated) => set(state => ({
    tools: state.tools.map(t => t.name === name ? { ...t, ...updated } : t)
  }))
}));

export interface LogTurn {
  role: 'user' | 'agent' | 'system';
  text: string;
  isFinal: boolean;
  timestamp: Date;
  audioData?: Uint8Array;
}

export const useLogStore = create<{
  turns: LogTurn[];
  sessionId: string;
  addTurn: (turn: Omit<LogTurn, 'timestamp'>) => void;
  updateLastTurn: (update: Partial<LogTurn>) => void;
  clear: () => void;
  initSession: () => void;
}>(set => ({
  turns: [],
  sessionId: crypto.randomUUID(),
  addTurn: turn => set(state => ({
    turns: [...state.turns, { ...turn, timestamp: new Date() }]
  })),
  updateLastTurn: update => set(state => {
    const turns = [...state.turns];
    if (turns.length > 0) {
      turns[turns.length - 1] = { ...turns[turns.length - 1], ...update };
    }
    return { turns };
  }),
  clear: () => set({ turns: [], sessionId: crypto.randomUUID() }),
  initSession: () => set({ sessionId: crypto.randomUUID() }),
}));
