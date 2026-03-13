import { produce } from 'solid-js/store';
import { invoke } from '../lib/ipc';
import { IPC } from '../../electron/ipc/channels';
import { store, setStore } from './core';
import { randomPastelColor } from './projects';
import { markAgentSpawned } from './taskStatus';
import { getLocalDateKey } from '../lib/date';
import type {
  Agent,
  Task,
  PersistedState,
  PersistedTask,
  PersistedWindowState,
  PersistedGlobalMonitorConfig,
  PersistedVisionConfig,
  Project,
} from './types';
import { DEFAULT_TERMINAL_FONT, isTerminalFont } from '../lib/fonts';
import { isLookPreset } from '../lib/look';
import { syncTerminalCounter } from './terminals';
import {
  clampGlobalMonitorIntervalSec,
  DEFAULT_GLOBAL_MONITOR_ENDPOINT,
  DEFAULT_GLOBAL_MONITOR_INTERVAL_SEC,
  DEFAULT_GLOBAL_MONITOR_MODEL,
} from './monitorDefaults';
import { DEFAULT_VISION_ENDPOINT, DEFAULT_VISION_MODEL } from './visionDefaults';

export async function saveState(): Promise<void> {
  const persisted: PersistedState = {
    projects: store.projects.map((p) => ({ ...p })),
    lastProjectId: store.lastProjectId,
    lastAgentId: store.lastAgentId,
    taskOrder: [...store.taskOrder],
    tasks: {},
    activeTaskId: store.activeTaskId,
    sidebarVisible: store.sidebarVisible,
    fontScales: { ...store.fontScales },
    panelSizes: { ...store.panelSizes },
    globalScale: store.globalScale,
    globalMonitor: {
      enabled: store.globalMonitor.enabled,
      apiKey: store.globalMonitor.apiKey,
      endpoint: store.globalMonitor.endpoint,
      model: store.globalMonitor.model,
      intervalSec: store.globalMonitor.intervalSec,
    },
    vision: {
      enabled: store.vision.enabled,
      apiKey: store.vision.apiKey,
      endpoint: store.vision.endpoint,
      model: store.vision.model,
    },
    completedTaskDate: store.completedTaskDate,
    completedTaskCount: store.completedTaskCount,
    mergedLinesAdded: store.mergedLinesAdded,
    mergedLinesRemoved: store.mergedLinesRemoved,
    terminalFont: store.terminalFont,
    themePreset: store.themePreset,
    windowState: store.windowState ? { ...store.windowState } : undefined,
    autoTrustFolders: store.autoTrustFolders,
    inactiveColumnOpacity: store.inactiveColumnOpacity,
  };

  for (const taskId of store.taskOrder) {
    const task = store.tasks[taskId];
    if (!task) continue;

    const firstAgent = task.agentIds[0] ? store.agents[task.agentIds[0]] : null;

    persisted.tasks[taskId] = {
      id: task.id,
      name: task.name,
      projectId: task.projectId,
      branchName: task.branchName,
      worktreePath: task.worktreePath,
      notes: task.notes,
      lastPrompt: task.lastPrompt,
      shellCount: task.shellAgentIds.length,
      agentDef: firstAgent?.def ?? null,
      agentStatus: firstAgent?.status,
      directMode: task.directMode,
      skipPermissions: task.skipPermissions,
      githubUrl: task.githubUrl,
      savedInitialPrompt: task.savedInitialPrompt,
    };
  }

  for (const id of store.taskOrder) {
    const terminal = store.terminals[id];
    if (!terminal) continue;
    if (!persisted.terminals) persisted.terminals = {};
    persisted.terminals[id] = { id: terminal.id, name: terminal.name };
  }

  await invoke(IPC.SaveAppState, { json: JSON.stringify(persisted) }).catch((e) =>
    console.warn('Failed to save state:', e),
  );
}

function isStringNumberRecord(v: unknown): v is Record<string, number> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every(
    (val) => typeof val === 'number' && Number.isFinite(val),
  );
}

function parsePersistedWindowState(v: unknown): PersistedWindowState | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;

  const raw = v as Record<string, unknown>;
  const x = raw.x;
  const y = raw.y;
  const width = raw.width;
  const height = raw.height;
  const maximized = raw.maximized;

  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    typeof y !== 'number' ||
    !Number.isFinite(y) ||
    typeof width !== 'number' ||
    !Number.isFinite(width) ||
    width <= 0 ||
    typeof height !== 'number' ||
    !Number.isFinite(height) ||
    height <= 0 ||
    typeof maximized !== 'boolean'
  ) {
    return null;
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    maximized,
  };
}

function parsePersistedGlobalMonitor(v: unknown): PersistedGlobalMonitorConfig {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return {
      enabled: false,
      apiKey: '',
      endpoint: DEFAULT_GLOBAL_MONITOR_ENDPOINT,
      model: DEFAULT_GLOBAL_MONITOR_MODEL,
      intervalSec: DEFAULT_GLOBAL_MONITOR_INTERVAL_SEC,
    };
  }

  const raw = v as Record<string, unknown>;
  return {
    enabled: raw.enabled === true,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
    endpoint:
      typeof raw.endpoint === 'string' && raw.endpoint.trim().length > 0
        ? raw.endpoint.trim()
        : DEFAULT_GLOBAL_MONITOR_ENDPOINT,
    model:
      typeof raw.model === 'string' && raw.model.trim().length > 0
        ? raw.model.trim()
        : DEFAULT_GLOBAL_MONITOR_MODEL,
    intervalSec: clampGlobalMonitorIntervalSec(Number(raw.intervalSec)),
  };
}

function parsePersistedVision(v: unknown): PersistedVisionConfig {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return {
      enabled: false,
      apiKey: '',
      endpoint: DEFAULT_VISION_ENDPOINT,
      model: DEFAULT_VISION_MODEL,
    };
  }

  const raw = v as Record<string, unknown>;
  return {
    enabled: raw.enabled === true,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
    endpoint:
      typeof raw.endpoint === 'string' && raw.endpoint.trim().length > 0
        ? raw.endpoint.trim()
        : DEFAULT_VISION_ENDPOINT,
    model:
      typeof raw.model === 'string' && raw.model.trim().length > 0
        ? raw.model.trim()
        : DEFAULT_VISION_MODEL,
  };
}

interface LegacyPersistedState {
  projectRoot?: string;
  projects?: Project[];
  lastProjectId?: string | null;
  lastAgentId?: string | null;
  taskOrder: string[];
  tasks: Record<string, PersistedTask & { projectId?: string }>;
  activeTaskId: string | null;
  sidebarVisible: boolean;
}

export async function loadState(): Promise<void> {
  const json = await invoke<string | null>(IPC.LoadAppState).catch(() => null);
  if (!json) return;

  let raw: LegacyPersistedState;
  try {
    raw = JSON.parse(json);
  } catch {
    console.warn('Failed to parse persisted state');
    return;
  }

  // Validate essential structure
  if (
    !raw ||
    typeof raw !== 'object' ||
    !Array.isArray(raw.taskOrder) ||
    typeof raw.tasks !== 'object'
  ) {
    console.warn('Invalid persisted state structure, skipping load');
    return;
  }

  // Migrate from old format if needed
  let projects: Project[] = raw.projects ?? [];
  let lastProjectId: string | null = raw.lastProjectId ?? null;
  const lastAgentId: string | null =
    raw.lastAgentId === 'gemini' ? 'opencode' : (raw.lastAgentId ?? null);

  // Assign colors to projects that don't have one (backward compat)
  for (const p of projects) {
    if (!p.color) p.color = randomPastelColor();
  }

  if (projects.length === 0 && raw.projectRoot) {
    const segments = raw.projectRoot.split('/');
    const name = segments[segments.length - 1] || raw.projectRoot;
    const id = crypto.randomUUID();
    projects = [{ id, name, path: raw.projectRoot, color: randomPastelColor() }];
    lastProjectId = id;

    // Assign this project to all existing tasks
    for (const taskId of raw.taskOrder) {
      const pt = raw.tasks[taskId];
      if (pt && !pt.projectId) {
        pt.projectId = id;
      }
    }
  }

  const restoredRunningAgentIds: string[] = [];
  const today = getLocalDateKey();

  setStore(
    produce((s) => {
      const rawAny = raw as unknown as Record<string, unknown>;
      s.projects = projects;
      s.lastProjectId = lastProjectId;
      s.lastAgentId = lastAgentId;
      s.taskOrder = raw.taskOrder;
      s.activeTaskId = raw.activeTaskId;
      s.sidebarVisible = raw.sidebarVisible;
      s.fontScales = isStringNumberRecord(rawAny.fontScales) ? rawAny.fontScales : {};
      s.panelSizes = isStringNumberRecord(rawAny.panelSizes) ? rawAny.panelSizes : {};
      s.globalScale = typeof rawAny.globalScale === 'number' ? rawAny.globalScale : 1;
      const persistedGlobalMonitor = parsePersistedGlobalMonitor(rawAny.globalMonitor);
      s.globalMonitor.enabled = persistedGlobalMonitor.enabled;
      s.globalMonitor.apiKey = persistedGlobalMonitor.apiKey;
      s.globalMonitor.hasApiKey = persistedGlobalMonitor.apiKey.trim().length > 0;
      s.globalMonitor.endpoint = persistedGlobalMonitor.endpoint;
      s.globalMonitor.model = persistedGlobalMonitor.model;
      s.globalMonitor.intervalSec = persistedGlobalMonitor.intervalSec;
      const persistedVision = parsePersistedVision(rawAny.vision);
      s.vision.enabled = persistedVision.enabled;
      s.vision.apiKey = persistedVision.apiKey;
      s.vision.endpoint = persistedVision.endpoint;
      s.vision.model = persistedVision.model;
      const completedTaskDate =
        typeof rawAny.completedTaskDate === 'string' ? rawAny.completedTaskDate : today;
      const completedTaskCountRaw = rawAny.completedTaskCount;
      const completedTaskCount =
        typeof completedTaskCountRaw === 'number' && Number.isFinite(completedTaskCountRaw)
          ? Math.max(0, Math.floor(completedTaskCountRaw))
          : 0;
      if (completedTaskDate === today) {
        s.completedTaskDate = completedTaskDate;
        s.completedTaskCount = completedTaskCount;
      } else {
        s.completedTaskDate = today;
        s.completedTaskCount = 0;
      }
      const mergedLinesAddedRaw = rawAny.mergedLinesAdded;
      const mergedLinesRemovedRaw = rawAny.mergedLinesRemoved;
      s.mergedLinesAdded =
        typeof mergedLinesAddedRaw === 'number' && Number.isFinite(mergedLinesAddedRaw)
          ? Math.max(0, Math.floor(mergedLinesAddedRaw))
          : 0;
      s.mergedLinesRemoved =
        typeof mergedLinesRemovedRaw === 'number' && Number.isFinite(mergedLinesRemovedRaw)
          ? Math.max(0, Math.floor(mergedLinesRemovedRaw))
          : 0;
      s.terminalFont = isTerminalFont(rawAny.terminalFont)
        ? rawAny.terminalFont
        : DEFAULT_TERMINAL_FONT;
      s.themePreset = isLookPreset(rawAny.themePreset) ? rawAny.themePreset : 'dark';
      s.windowState = parsePersistedWindowState(rawAny.windowState);
      s.autoTrustFolders =
        typeof rawAny.autoTrustFolders === 'boolean' ? rawAny.autoTrustFolders : false;
      const rawOpacity = rawAny.inactiveColumnOpacity;
      s.inactiveColumnOpacity =
        typeof rawOpacity === 'number' &&
        Number.isFinite(rawOpacity) &&
        rawOpacity >= 0.3 &&
        rawOpacity <= 1.0
          ? Math.round(rawOpacity * 100) / 100
          : 0.6;

      for (const taskId of raw.taskOrder) {
        const pt = raw.tasks[taskId];
        if (!pt) continue;

        const agentId = crypto.randomUUID();
        let agentDef = pt.agentDef ? { ...pt.agentDef } : null;

        if (agentDef?.id === 'gemini') {
          const opencodeDef = s.availableAgents.find((a) => a.id === 'opencode');
          agentDef = opencodeDef
            ? { ...opencodeDef }
            : {
                ...agentDef,
                id: 'opencode',
                name: 'OpenCode CLI',
                command: 'opencode',
                resume_args: ['--continue'],
                skip_permissions_args: [],
                description: 'OpenCode CLI agent',
              };
        }

        // Enrich with resume_args/skip_permissions_args from fresh defaults (handles old state files)
        if (agentDef) {
          const fresh = s.availableAgents.find((a) => a.id === agentDef.id);
          if (fresh) {
            if (!agentDef.resume_args) agentDef.resume_args = fresh.resume_args;
            if (!agentDef.skip_permissions_args)
              agentDef.skip_permissions_args = fresh.skip_permissions_args;
          }
        }

        const shellAgentIds: string[] = [];
        for (let i = 0; i < pt.shellCount; i++) {
          shellAgentIds.push(crypto.randomUUID());
        }

        const task: Task = {
          id: pt.id,
          name: pt.name,
          projectId: pt.projectId ?? '',
          branchName: pt.branchName,
          worktreePath: pt.worktreePath,
          agentIds: agentDef ? [agentId] : [],
          shellAgentIds,
          notes: pt.notes,
          lastPrompt: pt.lastPrompt,
          directMode: pt.directMode,
          skipPermissions: pt.skipPermissions === true,
          githubUrl: pt.githubUrl,
          savedInitialPrompt: pt.savedInitialPrompt,
        };

        s.tasks[taskId] = task;

        if (agentDef) {
          const agent: Agent = {
            id: agentId,
            taskId,
            def: agentDef,
            resumed: true,
            status: 'running',
            exitCode: null,
            signal: null,
            lastOutput: [],
            generation: 0,
          };
          s.agents[agentId] = agent;
          restoredRunningAgentIds.push(agentId);
        }
      }

      // Restore terminals
      const rawTerminals = (rawAny.terminals ?? {}) as Record<string, { id: string; name: string }>;
      for (const termId of raw.taskOrder) {
        const pt = rawTerminals[termId];
        if (!pt) continue;
        const agentId = crypto.randomUUID();
        s.terminals[termId] = { id: pt.id, name: pt.name, agentId };
      }

      // Remove orphaned entries from taskOrder
      s.taskOrder = s.taskOrder.filter((id) => s.tasks[id] || s.terminals[id]);

      // Set activeAgentId from the active task
      if (s.activeTaskId && s.tasks[s.activeTaskId]) {
        s.activeAgentId = s.tasks[s.activeTaskId].agentIds[0] ?? null;
      }
    }),
  );

  // Restored agents are considered running; reflect that immediately in task status dots.
  for (const agentId of restoredRunningAgentIds) {
    markAgentSpawned(agentId);
  }

  syncTerminalCounter();
}
