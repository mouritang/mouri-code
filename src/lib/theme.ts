import type { LookPreset } from './look';

/** Theme tokens referencing CSS variables defined in styles.css */
export const theme = {
  // Backgrounds (3-tier: black → task columns → panels inside)
  bg: 'var(--bg)',
  bgElevated: 'var(--bg-elevated)',
  bgInput: 'var(--bg-input)',
  bgHover: 'var(--bg-hover)',
  bgSelected: 'var(--bg-selected)',
  bgSelectedSubtle: 'var(--bg-selected-subtle)',

  // Borders
  border: 'var(--border)',
  borderSubtle: 'var(--border-subtle)',
  borderFocus: 'var(--border-focus)',

  // Text
  fg: 'var(--fg)',
  fgMuted: 'var(--fg-muted)',
  fgSubtle: 'var(--fg-subtle)',

  // Accent
  accent: 'var(--accent)',
  accentHover: 'var(--accent-hover)',
  accentText: 'var(--accent-text)',
  link: 'var(--link)',

  // Semantic
  success: 'var(--success)',
  error: 'var(--error)',
  warning: 'var(--warning)',

  // Island containers (task columns, sidebar)
  islandBg: 'var(--island-bg)',
  islandBorder: 'var(--island-border)',
  islandRadius: 'var(--island-radius)',
  taskContainerBg: 'var(--task-container-bg)',
  taskPanelBg: 'var(--task-panel-bg)',
} as const;

/** Opaque terminal background per preset — matches --task-panel-bg */
const terminalBackground: Record<LookPreset, string> = {
  light: '#f0ebe2',
  dark: '#16161f',
};

const terminalForeground: Record<LookPreset, string> = {
  light: '#1e1a14',
  dark: '#e2dff5',
};

/** Returns an xterm-compatible theme object for the given preset */
export function getTerminalTheme(preset: LookPreset) {
  return {
    background: terminalBackground[preset],
    foreground: terminalForeground[preset],
    cursor: preset === 'light' ? '#7a5c1e' : '#9d7fe8',
    selectionBackground: preset === 'light' ? 'rgba(180,160,120,0.35)' : 'rgba(42,32,64,0.6)',
  };
}
