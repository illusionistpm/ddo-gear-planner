/** One row of the keyboard shortcuts sheet: the keys (any one of the combos works) and what they do. */
export interface KeyboardShortcut {
  /** Each combo is its keys in order, e.g. ['Mod', 'Shift', 'Z']; 'Mod' is Ctrl, or ⌘ on a Mac. */
  combos: string[][];
  action: string;
}

export interface KeyboardShortcutGroup {
  heading: string;
  shortcuts: KeyboardShortcut[];
}

/**
 * Every shortcut the app answers, for the sheet "?" opens. The handlers live
 * beside what they act on (MainComponent, the toolbar, build actions, the
 * suggestions drawer); keep this list in step with them.
 */
export const KEYBOARD_SHORTCUTS: ReadonlyArray<KeyboardShortcutGroup> = [
  {
    heading: 'Planner',
    shortcuts: [
      { combos: [['/']], action: 'Search all gear' },
      { combos: [['G']], action: 'Open or close build goals' },
      { combos: [['F']], action: 'Open or close filters' },
      { combos: [['1'], ['2']], action: 'Show the gear or the build goals (one view at a time)' },
      { combos: [['Mod', 'Z']], action: 'Undo the last change' },
      { combos: [['Mod', 'Y'], ['Mod', 'Shift', 'Z']], action: 'Redo' },
      { combos: [['Mod', 'S']], action: 'Save the build (signed in)' },
      { combos: [['?']], action: 'Show these shortcuts' }
    ]
  },
  {
    heading: 'Item choices',
    shortcuts: [
      { combos: [['↓'], ['J']], action: 'Next item' },
      { combos: [['↑'], ['K']], action: 'Previous item' },
      { combos: [['Enter']], action: 'Equip the selected item' },
      { combos: [['Esc']], action: 'Close' }
    ]
  }
];

export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
}

/** Whether a key went to something being typed in, where a bare-letter shortcut must stand aside. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName ?? ''));
}
