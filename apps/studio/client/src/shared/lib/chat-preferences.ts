import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const CHAT_FONT_SIZES = ['small', 'medium', 'large', 'xl'] as const;
export type ChatFontSize = (typeof CHAT_FONT_SIZES)[number];
export const DEFAULT_CHAT_FONT_SIZE: ChatFontSize = 'medium';

export const CHAT_FONT_SIZE_LABELS: Record<ChatFontSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  xl: 'XL',
};

export const CHAT_PREFERENCES_STORAGE_KEY = 'studio-chat-preferences';

export function isChatFontSize(value: string | null): value is ChatFontSize {
  return value !== null && (CHAT_FONT_SIZES as readonly string[]).includes(value);
}

function applyChatFont(size: ChatFontSize) {
  document.documentElement.dataset.chatFont = size;
}

function readStoredChatFont(): ChatFontSize {
  try {
    const raw = localStorage.getItem(CHAT_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_CHAT_FONT_SIZE;
    }
    const parsed = JSON.parse(raw) as { state?: { chatFontSize?: string } };
    const value = parsed.state?.chatFontSize;
    if (typeof value === 'string' && isChatFontSize(value)) {
      return value;
    }
  } catch {
    return DEFAULT_CHAT_FONT_SIZE;
  }
  return DEFAULT_CHAT_FONT_SIZE;
}

applyChatFont(readStoredChatFont());

export type ChatPreferences = {
  detailedStats: boolean;
  expandThinking: boolean;
  expandTools: boolean;
  chatFontSize: ChatFontSize;
  setDetailedStats: (enabled: boolean) => void;
  setExpandThinking: (enabled: boolean) => void;
  setExpandTools: (enabled: boolean) => void;
  setChatFontSize: (size: ChatFontSize) => void;
};

export const useChatPreferences = create<ChatPreferences>()(
  persist(
    (set) => ({
      detailedStats: true,
      expandThinking: false,
      expandTools: false,
      chatFontSize: DEFAULT_CHAT_FONT_SIZE,
      setDetailedStats: (detailedStats) => set({ detailedStats }),
      setExpandThinking: (expandThinking) => set({ expandThinking }),
      setExpandTools: (expandTools) => set({ expandTools }),
      setChatFontSize: (chatFontSize) => {
        applyChatFont(chatFontSize);
        set({ chatFontSize });
      },
    }),
    {
      name: CHAT_PREFERENCES_STORAGE_KEY,
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as Partial<ChatPreferences>;
        if (version === 0 || !state.chatFontSize || !isChatFontSize(state.chatFontSize)) {
          state.chatFontSize = DEFAULT_CHAT_FONT_SIZE;
        }
        return state as ChatPreferences;
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyChatFont(state.chatFontSize);
        }
      },
    },
  ),
);
