import * as React from 'react';
import { ACCENT_STORAGE_KEY, SCALE_STORAGE_KEY } from '@/shared/config/constants';
import {
  DEFAULT_UI_ACCENT,
  DEFAULT_UI_SCALE,
  isUiAccent,
  isUiScale,
  type UiAccent,
  type UiScale,
} from '@/shared/lib/appearance';

type Theme = 'dark' | 'light' | 'system';
type ResolvedTheme = 'dark' | 'light';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  disableTransitionOnChange?: boolean;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  scale: UiScale;
  setScale: (scale: UiScale) => void;
  accent: UiAccent;
  setAccent: (accent: UiAccent) => void;
};

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';
const THEME_VALUES: Theme[] = ['dark', 'light', 'system'];

const ThemeProviderContext = React.createContext<ThemeProviderState | undefined>(undefined);

function isTheme(value: string | null): value is Theme {
  if (value === null) {
    return false;
  }

  return THEME_VALUES.includes(value as Theme);
}

function getSystemTheme(): ResolvedTheme {
  if (window.matchMedia(COLOR_SCHEME_QUERY).matches) {
    return 'dark';
  }

  return 'light';
}

function disableTransitionsTemporarily() {
  const style = document.createElement('style');
  style.appendChild(
    document.createTextNode(
      '*,*::before,*::after{-webkit-transition:none!important;transition:none!important}',
    ),
  );
  document.head.appendChild(style);

  return () => {
    window.getComputedStyle(document.body);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove();
      });
    });
  };
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const editableParent = target.closest("input, textarea, select, [contenteditable='true']");
  if (editableParent) {
    return true;
  }

  return false;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'theme',
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    const storedTheme = localStorage.getItem(storageKey);
    if (isTheme(storedTheme)) {
      return storedTheme;
    }

    return defaultTheme;
  });
  const [scale, setScaleState] = React.useState<UiScale>(() => {
    const stored = localStorage.getItem(SCALE_STORAGE_KEY);
    return isUiScale(stored) ? stored : DEFAULT_UI_SCALE;
  });
  const [accent, setAccentState] = React.useState<UiAccent>(() => {
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
    return isUiAccent(stored) ? stored : DEFAULT_UI_ACCENT;
  });

  const setTheme = (nextTheme: Theme) => {
    localStorage.setItem(storageKey, nextTheme);
    setThemeState(nextTheme);
  };

  const setScale = (nextScale: UiScale) => {
    localStorage.setItem(SCALE_STORAGE_KEY, nextScale);
    setScaleState(nextScale);
  };

  const setAccent = (nextAccent: UiAccent) => {
    localStorage.setItem(ACCENT_STORAGE_KEY, nextAccent);
    setAccentState(nextAccent);
  };

  const applyTheme = React.useCallback(
    (nextTheme: Theme) => {
      const root = document.documentElement;
      const resolvedTheme = nextTheme === 'system' ? getSystemTheme() : nextTheme;
      const restoreTransitions = disableTransitionOnChange ? disableTransitionsTemporarily() : null;

      root.classList.remove('light', 'dark');
      root.classList.add(resolvedTheme);

      if (restoreTransitions) {
        restoreTransitions();
      }
    },
    [disableTransitionOnChange],
  );

  React.useEffect(() => {
    const root = document.documentElement;
    root.dataset.scale = scale;
    root.dataset.accent = accent;
  }, [scale, accent]);

  React.useEffect(() => {
    applyTheme(theme);

    if (theme !== 'system') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY);
    const handleChange = () => {
      applyTheme('system');
    };

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [theme, applyTheme]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key.toLowerCase() !== 'd') {
        return;
      }

      setThemeState((currentTheme) => {
        let nextTheme: 'light' | 'dark';
        if (currentTheme === 'dark') {
          nextTheme = 'light';
        } else if (currentTheme === 'light') {
          nextTheme = 'dark';
        } else if (getSystemTheme() === 'dark') {
          nextTheme = 'light';
        } else {
          nextTheme = 'dark';
        }

        localStorage.setItem(storageKey, nextTheme);
        return nextTheme;
      });
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [storageKey]);

  React.useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) {
        return;
      }

      if (event.key === storageKey) {
        if (isTheme(event.newValue)) {
          setThemeState(event.newValue);
          return;
        }
        setThemeState(defaultTheme);
        return;
      }

      if (event.key === SCALE_STORAGE_KEY) {
        setScaleState(isUiScale(event.newValue) ? event.newValue : DEFAULT_UI_SCALE);
        return;
      }

      if (event.key === ACCENT_STORAGE_KEY) {
        setAccentState(isUiAccent(event.newValue) ? event.newValue : DEFAULT_UI_ACCENT);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [defaultTheme, storageKey]);

  const value = {
    theme,
    setTheme,
    scale,
    setScale,
    accent,
    setAccent,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
};
