import type { KeyboardEvent } from 'react';

import type { SlashCommand } from './slash-commands';

export type SlashKeydownOptions = {
  open: boolean;
  matches: SlashCommand[];
  activeIndex: number;
  streaming: boolean;
  setActiveIndex(update: (index: number) => number): void;
  clearValue(): void;
  fillCommand(name: string): void;
  runCommand(command: SlashCommand): void;
  submit(): void;
};

export function handleComposerKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  options: SlashKeydownOptions,
): void {
  const { open, matches, activeIndex, streaming } = options;
  if (open && matches.length > 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      options.setActiveIndex((index) => (index + 1) % matches.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      options.setActiveIndex((index) => (index - 1 + matches.length) % matches.length);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      options.clearValue();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const active = matches[activeIndex] ?? matches[0];
      if (active) {
        options.fillCommand(active.name);
      }
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const active = matches[activeIndex] ?? matches[0];
      if (active) {
        options.runCommand(active);
      }
      return;
    }
  }
  if (event.key === 'Enter' && !event.shiftKey && !streaming) {
    event.preventDefault();
    options.submit();
  }
}
