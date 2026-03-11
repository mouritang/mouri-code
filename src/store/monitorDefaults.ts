export const DEFAULT_GLOBAL_MONITOR_ENDPOINT = 'https://api.minimaxi.com/v1/text/chatcompletion_v2';
export const DEFAULT_GLOBAL_MONITOR_MODEL = 'MiniMax-M2.5';
export const DEFAULT_GLOBAL_MONITOR_INTERVAL_SEC = 90;
export const MIN_GLOBAL_MONITOR_INTERVAL_SEC = 30;
export const MAX_GLOBAL_MONITOR_INTERVAL_SEC = 600;

export function clampGlobalMonitorIntervalSec(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GLOBAL_MONITOR_INTERVAL_SEC;
  return Math.max(
    MIN_GLOBAL_MONITOR_INTERVAL_SEC,
    Math.min(MAX_GLOBAL_MONITOR_INTERVAL_SEC, Math.round(value)),
  );
}
