# Two-Theme System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the existing 6 color themes with exactly 2 — `light` (warm paper/antigravity style) and `dark` (Kiro purple + deep gray).

**Architecture:** All theme data lives in three files: `src/lib/look.ts` (preset type + metadata), `src/styles.css` (CSS variables per preset), and `src/lib/theme.ts` (terminal background map). The `LookPreset` union type flows through store, persistence, and UI — changing it requires updating all references. No tests exist for themes; verification is visual + typecheck.

**Tech Stack:** SolidJS, TypeScript (strict), CSS custom properties, Electron, node-pty/xterm

---

### Task 1: Update `LookPreset` type and metadata in `look.ts`

**Files:**

- Modify: `src/lib/look.ts`

**Step 1: Replace the entire file content**

```typescript
export type LookPreset = 'light' | 'dark';

export interface LookPresetOption {
  id: LookPreset;
  label: string;
  description: string;
}

export const LOOK_PRESETS: LookPresetOption[] = [
  {
    id: 'light',
    label: '亮色',
    description: '纸张质感，温暖奶油底色',
  },
  {
    id: 'dark',
    label: '暗色',
    description: '深灰底色，紫调强调',
  },
];

const LOOK_PRESET_IDS = new Set<string>(LOOK_PRESETS.map((p) => p.id));

export function isLookPreset(value: unknown): value is LookPreset {
  return typeof value === 'string' && LOOK_PRESET_IDS.has(value);
}
```

**Step 2: Run typecheck to see all broken references**

```bash
npm run typecheck 2>&1 | head -60
```

Expected: errors in `theme.ts`, `store/core.ts`, `store/persistence.ts`, possibly `SettingsDialog.tsx`

**Step 3: Commit**

```bash
git add src/lib/look.ts
git commit -m "refactor: replace 6 look presets with light/dark only"
```

---

### Task 2: Update terminal background map in `theme.ts`

**Files:**

- Modify: `src/lib/theme.ts`

**Step 1: Replace the `terminalBackground` record and `getTerminalTheme` function**

The `theme` const at the top (CSS variable references) stays unchanged. Only update lines 43–57:

```typescript
/** Opaque terminal background per preset — matches --task-panel-bg */
const terminalBackground: Record<LookPreset, string> = {
  light: '#f0ebe2',
  dark: '#16161f',
};

/** Returns an xterm-compatible theme object for the given preset */
export function getTerminalTheme(preset: LookPreset) {
  return {
    background: terminalBackground[preset],
  };
}
```

**Step 2: Run typecheck**

```bash
npm run typecheck 2>&1 | grep theme
```

Expected: no errors in `theme.ts`

**Step 3: Commit**

```bash
git add src/lib/theme.ts
git commit -m "refactor: update terminal background map for light/dark presets"
```

---

### Task 3: Update default theme and persistence fallback in store

**Files:**

- Modify: `src/store/core.ts` — change default `themePreset` from `'minimal'` to `'dark'`
- Modify: `src/store/persistence.ts` — update fallback value if hardcoded to old preset name

**Step 1: In `src/store/core.ts`, find the line with `themePreset: 'minimal'` and change it**

```typescript
themePreset: 'dark',
```

**Step 2: In `src/store/persistence.ts`, find any fallback like `?? 'minimal'` or `?? 'classic'` and update**

Change any old preset fallback to:

```typescript
?? 'dark'
```

**Step 3: Run typecheck**

```bash
npm run typecheck 2>&1 | grep -E "store|persist"
```

Expected: no errors

**Step 4: Commit**

```bash
git add src/store/core.ts src/store/persistence.ts
git commit -m "refactor: update default and fallback theme preset to dark"
```

---

### Task 4: Replace all 6 theme CSS blocks in `styles.css` with `light` and `dark`

**Files:**

- Modify: `src/styles.css`

**Step 1: Remove all 6 existing `html[data-look='...']` blocks and their associated `.app-shell[data-look='...']` overrides**

The blocks to remove (lines ~113–294):

- `html[data-look='classic']` + `.app-shell[data-look='classic']::before` + `.app-shell[data-look='classic'] .task-column.active`
- `html[data-look='graphite']`
- `html[data-look='indigo']`
- `html[data-look='ember']`
- `html[data-look='glacier']`
- `html[data-look='minimal']` + `.app-shell[data-look='minimal']::before` + `.app-shell[data-look='minimal'] .task-column.active`

**Step 2: Add the `dark` theme block (Kiro purple + deep gray)**

Insert after the `:root` block (around line 50):

```css
html[data-look='dark'] {
  --bg: radial-gradient(130% 120% at 18% 0%, #1a1828 0%, #13131c 58%, #0f0f17 100%);
  --bg-elevated: #16161f;
  --bg-input: #13131c;
  --bg-hover: #1e1e2e;
  --bg-selected: #2a2040;
  --bg-selected-subtle: rgba(42, 32, 64, 0.4);

  --border: #2e2a45;
  --border-subtle: #1e1a30;
  --border-focus: #9d7fe8;

  --fg: #e2dff5;
  --fg-muted: #a89ec8;
  --fg-subtle: #6e6490;

  --accent: #9d7fe8;
  --accent-hover: #b49af0;
  --accent-text: #0a0814;
  --link: #b49af0;

  --success: #5ecfa0;
  --error: #f07070;
  --warning: #e8c06a;

  --island-bg: #12121a;
  --island-border: #2e2a45;
  --island-radius: 12px;
  --task-container-bg: #0c0c14;
  --task-panel-bg: #16161f;

  --shadow-soft: 0 16px 32px rgba(0, 0, 0, 0.5);
  --shadow-pop:
    0 0 0 1.5px color-mix(in srgb, var(--accent) 30%, transparent),
    0 16px 40px color-mix(in srgb, var(--accent) 20%, transparent);
}
```

**Step 3: Add the `light` theme block (paper/antigravity warm cream)**

Insert after the `dark` block:

```css
html[data-look='light'] {
  --font-ui: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-display: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  --bg: #f7f3ec;
  --bg-elevated: #ede8df;
  --bg-input: #f0ebe2;
  --bg-hover: #e8e2d8;
  --bg-selected: #d4c9b2;
  --bg-selected-subtle: rgba(180, 160, 120, 0.18);

  --border: #d0c8b8;
  --border-subtle: #e0d8cc;
  --border-focus: #7a5c1e;

  --fg: #1e1a14;
  --fg-muted: #5c5040;
  --fg-subtle: #8c7c68;

  --accent: #7a5c1e;
  --accent-hover: #9a7428;
  --accent-text: #faf7f0;
  --link: #6b4e18;

  --success: #3d7a50;
  --error: #a03030;
  --warning: #8a6010;

  --island-bg: #f0ebe0;
  --island-border: #d0c8b8;
  --island-radius: 10px;
  --task-container-bg: #ede8df;
  --task-panel-bg: #f0ebe2;

  --shadow-soft: 0 2px 8px rgba(60, 40, 20, 0.12);
  --shadow-pop: 0 4px 16px rgba(120, 80, 20, 0.2);
}

.app-shell[data-look='light']::before {
  opacity: 0 !important;
  background: none !important;
}

.app-shell[data-look='light'] .task-column.active {
  box-shadow: none;
  border-color: color-mix(in srgb, var(--border) 85%, transparent) !important;
}
```

**Step 4: Update the `html, body, #root` fallback background color**

Find:

```css
background: #050608;
```

Change to:

```css
background: #0f0f17;
```

**Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors

**Step 6: Commit**

```bash
git add src/styles.css
git commit -m "feat: add light (paper) and dark (kiro purple) theme CSS"
```

---

### Task 5: Update `SettingsDialog` theme selector UI

**Files:**

- Modify: `src/components/SettingsDialog.tsx`

**Step 1: Read the file to understand the current theme card rendering**

The theme selector renders a grid of `LOOK_PRESETS` cards. With only 2 presets, the grid may look sparse — consider changing the grid layout to a 2-column or horizontal row.

Find the grid container for theme cards and update its style if needed:

- If it uses `grid-template-columns: repeat(3, 1fr)` or similar, change to `repeat(2, 1fr)` or a flex row.

**Step 2: No logic changes needed** — `LOOK_PRESETS` is imported and iterated, so the UI auto-updates from Task 1.

**Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: clean

**Step 4: Commit**

```bash
git add src/components/SettingsDialog.tsx
git commit -m "fix: adjust theme selector grid layout for 2-theme system"
```

---

### Task 6: Final verification

**Step 1: Full typecheck**

```bash
npm run typecheck
```

Expected: zero errors

**Step 2: Visual check in dev mode**

```
npm run dev
```

- Open Settings → verify only 亮色 and 暗色 appear
- Switch to 亮色 → verify warm cream paper look
- Switch to 暗色 → verify deep gray + purple accent
- Check terminal background matches each theme
- Check hover states, borders, selected items

**Step 3: Final commit if any tweaks were made**

```bash
git add -p
git commit -m "fix: theme visual tweaks after review"
```
