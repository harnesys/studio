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
export type FeedFollowMode = 'anchor' | 'pin';
export const FEED_FOLLOW_MODES: readonly FeedFollowMode[] = ['anchor', 'pin'];
export const FEED_FOLLOW_LABELS: Record<FeedFollowMode, string> = {
  anchor: 'Anchor',
  pin: 'Pin',
};
export const DEFAULT_FEED_FOLLOW: FeedFollowMode = 'anchor';
export type FeedDetailMode = 'quiet' | 'full';
export const FEED_DETAIL_MODES: readonly FeedDetailMode[] = ['quiet', 'full'];
export const FEED_DETAIL_LABELS: Record<FeedDetailMode, string> = {
  quiet: 'Quiet',
  full: 'Full',
};
export const DEFAULT_FEED_DETAIL: FeedDetailMode = 'quiet';
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
    const parsed = JSON.parse(raw) as {
      state?: {
        chatFontSize?: string;
      };
    };
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
  chatFontSize: ChatFontSize;
  feedFollow: FeedFollowMode;
  feedDetail: FeedDetailMode;
  setDetailedStats: (enabled: boolean) => void;
  setChatFontSize: (size: ChatFontSize) => void;
  setFeedFollow: (mode: FeedFollowMode) => void;
  setFeedDetail: (mode: FeedDetailMode) => void;
};
export const useChatPreferences = create<ChatPreferences>()(
  persist(
    (set) => ({
      detailedStats: true,
      chatFontSize: DEFAULT_CHAT_FONT_SIZE,
      feedFollow: DEFAULT_FEED_FOLLOW,
      feedDetail: DEFAULT_FEED_DETAIL,
      setDetailedStats: (detailedStats) => set({ detailedStats }),
      setChatFontSize: (chatFontSize) => {
        applyChatFont(chatFontSize);
        set({ chatFontSize });
      },
      setFeedFollow: (feedFollow) => set({ feedFollow }),
      setFeedDetail: (feedDetail) => set({ feedDetail }),
    }),
    {
      name: CHAT_PREFERENCES_STORAGE_KEY,
      version: 3,
      migrate: (persisted) => {
        const prev = persisted as Record<string, unknown>;
        const state = {
          detailedStats: typeof prev.detailedStats === 'boolean' ? prev.detailedStats : true,
          chatFontSize: isChatFontSize(
            typeof prev.chatFontSize === 'string' ? prev.chatFontSize : null,
          )
            ? (prev.chatFontSize as ChatFontSize)
            : DEFAULT_CHAT_FONT_SIZE,
          feedFollow: prev.comfortFollow === false ? 'pin' : DEFAULT_FEED_FOLLOW,
          feedDetail: prev.expandTools === true ? 'full' : DEFAULT_FEED_DETAIL,
        };
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
