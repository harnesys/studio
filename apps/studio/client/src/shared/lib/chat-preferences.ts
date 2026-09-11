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

export const LIVE_EXPAND_MODES = ['preview', 'expanded', 'collapsed'] as const;
export type LiveExpandMode = (typeof LIVE_EXPAND_MODES)[number];
export const DEFAULT_LIVE_EXPAND: LiveExpandMode = 'preview';

export const LIVE_EXPAND_LABELS: Record<LiveExpandMode, string> = {
  preview: 'Preview',
  expanded: 'Expanded',
  collapsed: 'Collapsed',
};

export function isLiveExpandMode(value: string | null): value is LiveExpandMode {
  return value !== null && (LIVE_EXPAND_MODES as readonly string[]).includes(value);
}

/** Якорь comfort-follow: где паркуется живой край после отката, % от верха. */
export const COMFORT_ANCHOR_MIN = 40;
export const COMFORT_ANCHOR_MAX = 70;
export const DEFAULT_COMFORT_ANCHOR = 55;

/** Триггер низа: откат, когда живой край подходит к низу ближе этого, px. */
export const COMFORT_THRESHOLD_MIN = 32;
export const COMFORT_THRESHOLD_MAX = 160;
export const DEFAULT_COMFORT_THRESHOLD = 96;

/** Длительность плавного отката, мс. 0 — мгновенный прыжок. */
export const COMFORT_DURATION_MIN = 0;
export const COMFORT_DURATION_MAX = 800;
export const DEFAULT_COMFORT_DURATION = 350;

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
  comfortFollow: boolean;
  comfortAnchor: number;
  comfortThreshold: number;
  comfortDuration: number;
  liveExpand: LiveExpandMode;
  setDetailedStats: (enabled: boolean) => void;
  setExpandThinking: (enabled: boolean) => void;
  setExpandTools: (enabled: boolean) => void;
  setChatFontSize: (size: ChatFontSize) => void;
  setComfortFollow: (enabled: boolean) => void;
  setComfortAnchor: (percent: number) => void;
  setComfortThreshold: (px: number) => void;
  setComfortDuration: (ms: number) => void;
  setLiveExpand: (mode: LiveExpandMode) => void;
};

function clampComfortAnchor(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_COMFORT_ANCHOR;
  }
  return Math.min(COMFORT_ANCHOR_MAX, Math.max(COMFORT_ANCHOR_MIN, Math.round(value)));
}

function clampComfortThreshold(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_COMFORT_THRESHOLD;
  }
  return Math.min(COMFORT_THRESHOLD_MAX, Math.max(COMFORT_THRESHOLD_MIN, Math.round(value)));
}

function clampComfortDuration(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_COMFORT_DURATION;
  }
  return Math.min(COMFORT_DURATION_MAX, Math.max(COMFORT_DURATION_MIN, Math.round(value)));
}

export const useChatPreferences = create<ChatPreferences>()(
  persist(
    (set) => ({
      detailedStats: true,
      expandThinking: false,
      expandTools: false,
      chatFontSize: DEFAULT_CHAT_FONT_SIZE,
      comfortFollow: true,
      comfortAnchor: DEFAULT_COMFORT_ANCHOR,
      comfortThreshold: DEFAULT_COMFORT_THRESHOLD,
      comfortDuration: DEFAULT_COMFORT_DURATION,
      liveExpand: DEFAULT_LIVE_EXPAND,
      setDetailedStats: (detailedStats) => set({ detailedStats }),
      setExpandThinking: (expandThinking) => set({ expandThinking }),
      setExpandTools: (expandTools) => set({ expandTools }),
      setChatFontSize: (chatFontSize) => {
        applyChatFont(chatFontSize);
        set({ chatFontSize });
      },
      setComfortFollow: (comfortFollow) => set({ comfortFollow }),
      setComfortAnchor: (comfortAnchor) =>
        set({ comfortAnchor: clampComfortAnchor(comfortAnchor) }),
      setComfortThreshold: (comfortThreshold) =>
        set({ comfortThreshold: clampComfortThreshold(comfortThreshold) }),
      setComfortDuration: (comfortDuration) =>
        set({ comfortDuration: clampComfortDuration(comfortDuration) }),
      setLiveExpand: (liveExpand) => set({ liveExpand }),
    }),
    {
      name: CHAT_PREFERENCES_STORAGE_KEY,
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as Partial<ChatPreferences>;
        if (version === 0 || !state.chatFontSize || !isChatFontSize(state.chatFontSize)) {
          state.chatFontSize = DEFAULT_CHAT_FONT_SIZE;
        }
        if (typeof state.comfortFollow !== 'boolean') {
          state.comfortFollow = true;
        }
        state.comfortAnchor =
          typeof state.comfortAnchor === 'number'
            ? clampComfortAnchor(state.comfortAnchor)
            : DEFAULT_COMFORT_ANCHOR;
        state.comfortThreshold =
          typeof state.comfortThreshold === 'number'
            ? clampComfortThreshold(state.comfortThreshold)
            : DEFAULT_COMFORT_THRESHOLD;
        state.comfortDuration =
          typeof state.comfortDuration === 'number'
            ? clampComfortDuration(state.comfortDuration)
            : DEFAULT_COMFORT_DURATION;
        if (!state.liveExpand || !isLiveExpandMode(state.liveExpand)) {
          state.liveExpand = DEFAULT_LIVE_EXPAND;
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
