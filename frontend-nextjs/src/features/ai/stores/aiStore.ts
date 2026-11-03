import { create } from 'zustand';
import {
  ActionResolutionState,
  AssistantSessionResponse,
  ChatMessage,
  PendingActionItem,
} from '../types';

interface AiState {
  session: AssistantSessionResponse | null;
  sessionId: string | null;
  sessionExpiry: string | null;
  availableTools: string[];
  disclaimer: string | null;
  messages: ChatMessage[];
  pendingActions: PendingActionItem[];
  isThinking: boolean;
  activeTool: string | null;
  errorMessage: string | null;
  currentAgentId: string | null; // Currently selected agent for chat

  setSession: (session: AssistantSessionResponse | null) => void;
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setThinking: (status: boolean, tool?: string | null) => void;
  setErrorMessage: (msg: string | null) => void;
  setPendingActions: (actions: PendingActionItem[]) => void;
  updateMessageResolution: (
    pendingId: string,
    resolution: ActionResolutionState,
  ) => void;
  resetSession: () => void;
  setCurrentAgent: (agentId: string | null) => void;
}

const STORAGE_KEY = 'ws_ai_assistant_session';

function getStoredSession(): AssistantSessionResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AssistantSessionResponse;
    if (parsed.expires_at && new Date(parsed.expires_at) > new Date()) {
      return parsed;
    }
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

function persistSession(session: AssistantSessionResponse | null) {
  if (typeof window === 'undefined') return;
  try {
    if (session) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

const initialSession = getStoredSession();

export const useAiStore = create<AiState>((set) => ({
  session: initialSession,
  sessionId: initialSession?.session_id || null,
  sessionExpiry: initialSession?.expires_at || null,
  availableTools: initialSession?.tools || [],
  disclaimer: initialSession?.disclaimer || null,
  messages: [],
  pendingActions: [],
  isThinking: false,
  activeTool: null,
  errorMessage: null,
  currentAgentId: null,

  setSession: (session) => {
    persistSession(session);
    set({
      session,
      sessionId: session?.session_id || null,
      sessionExpiry: session?.expires_at || null,
      availableTools: session?.tools || [],
      disclaimer: session?.disclaimer || null,
    });
  },

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  setMessages: (messages) => set({ messages }),

  setThinking: (status, tool = null) =>
    set({ isThinking: status, activeTool: tool }),

  setErrorMessage: (msg) => set({ errorMessage: msg }),

  setPendingActions: (actions) => set({ pendingActions: actions }),

  updateMessageResolution: (pendingId, resolution) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.pendingAction && m.pendingAction.id === pendingId) {
          return { ...m, resolution };
        }
        return m;
      }),
    })),

  resetSession: () => {
    persistSession(null);
    set({
      session: null,
      sessionId: null,
      sessionExpiry: null,
      availableTools: [],
      disclaimer: null,
      messages: [],
      errorMessage: null,
      currentAgentId: null,
    });
  },
  setCurrentAgent: (agentId: string | null) => set({ currentAgentId: agentId }),
}));