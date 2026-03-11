import { IPC } from '../../electron/ipc/channels';
import type { GlobalMonitorCommand, GlobalMonitorSnapshot } from '../ipc/types';
import { invoke } from '../lib/ipc';
import { setStore, store } from './core';
import {
  clampGlobalMonitorIntervalSec,
  DEFAULT_GLOBAL_MONITOR_ENDPOINT,
  DEFAULT_GLOBAL_MONITOR_INTERVAL_SEC,
  DEFAULT_GLOBAL_MONITOR_MODEL,
} from './monitorDefaults';
import { showNotification } from './notification';
import { setActiveTask } from './navigation';
import { sendPrompt } from './tasks';

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function applySnapshot(snapshot: GlobalMonitorSnapshot): void {
  setStore('globalMonitor', 'enabled', snapshot.enabled);
  setStore(
    'globalMonitor',
    'hasApiKey',
    snapshot.hasApiKey || store.globalMonitor.apiKey.trim().length > 0,
  );
  setStore('globalMonitor', 'endpoint', snapshot.endpoint || DEFAULT_GLOBAL_MONITOR_ENDPOINT);
  setStore('globalMonitor', 'model', snapshot.model || DEFAULT_GLOBAL_MONITOR_MODEL);
  setStore(
    'globalMonitor',
    'intervalSec',
    clampGlobalMonitorIntervalSec(snapshot.intervalSec ?? DEFAULT_GLOBAL_MONITOR_INTERVAL_SEC),
  );
  setStore('globalMonitor', 'status', snapshot.status);
  setStore('globalMonitor', 'lastRunAt', snapshot.lastRunAt);
  setStore('globalMonitor', 'lastSummary', snapshot.lastSummary);
  setStore('globalMonitor', 'lastError', snapshot.lastError);
  setStore('globalMonitor', 'activeTaskCount', snapshot.activeTaskCount);
  setStore('globalMonitor', 'alerts', snapshot.alerts);
  setStore('globalMonitor', 'taskInsights', snapshot.taskInsights);
  setStore('globalMonitor', 'commands', snapshot.commands);
}

function configPayload() {
  return {
    enabled: store.globalMonitor.enabled,
    apiKey: store.globalMonitor.apiKey,
    endpoint: store.globalMonitor.endpoint.trim() || DEFAULT_GLOBAL_MONITOR_ENDPOINT,
    model: store.globalMonitor.model.trim() || DEFAULT_GLOBAL_MONITOR_MODEL,
    intervalSec: clampGlobalMonitorIntervalSec(store.globalMonitor.intervalSec),
  };
}

function scheduleSync(): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void syncGlobalMonitorConfig();
  }, 250);
}

function handleSyncFailure(error: unknown): void {
  setStore('globalMonitor', 'status', 'error');
  setStore('globalMonitor', 'lastError', error instanceof Error ? error.message : String(error));
}

export async function syncGlobalMonitorConfig(): Promise<void> {
  try {
    const snapshot = await invoke<GlobalMonitorSnapshot>(
      IPC.UpdateGlobalMonitorConfig,
      configPayload(),
    );
    applySnapshot(snapshot);
  } catch (error) {
    handleSyncFailure(error);
  }
}

export async function refreshGlobalMonitorStatus(): Promise<void> {
  try {
    const snapshot = await invoke<GlobalMonitorSnapshot>(IPC.GetGlobalMonitorStatus);
    applySnapshot(snapshot);
  } catch (error) {
    handleSyncFailure(error);
  }
}

export async function runGlobalMonitorNow(): Promise<void> {
  try {
    const snapshot = await invoke<GlobalMonitorSnapshot>(IPC.RunGlobalMonitorNow);
    applySnapshot(snapshot);
  } catch (error) {
    handleSyncFailure(error);
  }
}

export function startGlobalMonitorPolling(): void {
  stopGlobalMonitorPolling();
  pollTimer = setInterval(() => {
    void refreshGlobalMonitorStatus();
  }, 5_000);
}

export function stopGlobalMonitorPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

export function setGlobalMonitorEnabled(enabled: boolean): void {
  setStore('globalMonitor', 'enabled', enabled);
  scheduleSync();
}

export function setGlobalMonitorApiKey(apiKey: string): void {
  setStore('globalMonitor', 'apiKey', apiKey);
  setStore('globalMonitor', 'hasApiKey', apiKey.trim().length > 0);
  scheduleSync();
}

export function setGlobalMonitorEndpoint(endpoint: string): void {
  setStore('globalMonitor', 'endpoint', endpoint || DEFAULT_GLOBAL_MONITOR_ENDPOINT);
  scheduleSync();
}

export function setGlobalMonitorModel(model: string): void {
  setStore('globalMonitor', 'model', model || DEFAULT_GLOBAL_MONITOR_MODEL);
  scheduleSync();
}

export function setGlobalMonitorIntervalSec(intervalSec: number): void {
  setStore('globalMonitor', 'intervalSec', clampGlobalMonitorIntervalSec(intervalSec));
  scheduleSync();
}

export async function sendGlobalMonitorCommand(command: GlobalMonitorCommand): Promise<void> {
  const task = store.tasks[command.taskId];
  if (!task) {
    showNotification('助理建议对应的任务已不存在');
    return;
  }

  const agentId = task.agentIds.find((id) => store.agents[id]?.status === 'running');
  if (!agentId) {
    showNotification(`无法发送：${task.name} 当前没有运行中的智能体`);
    return;
  }

  try {
    setActiveTask(task.id);
    await sendPrompt(task.id, agentId, command.prompt);
    showNotification(`已将助理指令发送到 ${task.name}`);
  } catch (error) {
    showNotification(error instanceof Error ? error.message : String(error));
  }
}

export async function sendGlobalMonitorPrompt(taskId: string, prompt: string): Promise<void> {
  const task = store.tasks[taskId];
  if (!task) {
    showNotification('目标任务不存在');
    return;
  }

  const agentId = task.agentIds.find((id) => store.agents[id]?.status === 'running');
  if (!agentId) {
    showNotification(`无法发送：${task.name} 当前没有运行中的智能体`);
    return;
  }

  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    showNotification('请输入要发送的指令');
    return;
  }

  try {
    setActiveTask(task.id);
    await sendPrompt(task.id, agentId, trimmedPrompt);
    showNotification(`已将指令发送到 ${task.name}`);
  } catch (error) {
    showNotification(error instanceof Error ? error.message : String(error));
  }
}
