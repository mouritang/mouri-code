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
