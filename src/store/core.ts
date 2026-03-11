import { createStore } from 'solid-js/store';
import { DEFAULT_TERMINAL_FONT } from '../lib/fonts';
import { getLocalDateKey } from '../lib/date';
import {
  DEFAULT_GLOBAL_MONITOR_ENDPOINT,
  DEFAULT_GLOBAL_MONITOR_INTERVAL_SEC,
  DEFAULT_GLOBAL_MONITOR_MODEL,
} from './monitorDefaults';
import type { AppStore } from './types';

export const [store, setStore] = createStore<AppStore>({
  projects: [],
  lastProjectId: null,
  lastAgentId: null,
  taskOrder: [],
  tasks: {},
  terminals: {},
  agents: {},
  activeTaskId: null,
  activeAgentId: null,
  availableAgents: [],
  showNewTaskDialog: false,
  sidebarVisible: true,
  fontScales: {},
  panelSizes: {},
  globalScale: 1,
  taskGitStatus: {},
  focusedPanel: {},
  sidebarFocused: false,
  sidebarFocusedProjectId: null,
  sidebarFocusedTaskId: null,
  placeholderFocused: false,
  placeholderFocusedButton: 'add-task',
  showHelpDialog: false,
  showSettingsDialog: false,
  pendingAction: null,
  notification: null,
  completedTaskDate: getLocalDateKey(),
  completedTaskCount: 0,
  mergedLinesAdded: 0,
  mergedLinesRemoved: 0,
  terminalFont: DEFAULT_TERMINAL_FONT,
  themePreset: 'dark',
  windowState: null,
  autoTrustFolders: false,
  inactiveColumnOpacity: 0.6,
  newTaskDropUrl: null,
  remoteAccess: {
    enabled: false,
    token: null,
    port: 7777,
    url: null,
    wifiUrl: null,
    tailscaleUrl: null,
    connectedClients: 0,
  },
  globalMonitor: {
    enabled: false,
    apiKey: '',
    hasApiKey: false,
    endpoint: DEFAULT_GLOBAL_MONITOR_ENDPOINT,
    model: DEFAULT_GLOBAL_MONITOR_MODEL,
    intervalSec: DEFAULT_GLOBAL_MONITOR_INTERVAL_SEC,
    status: 'disabled',
    lastRunAt: null,
    lastSummary: null,
    lastError: null,
    activeTaskCount: 0,
    alerts: [],
    taskInsights: [],
    commands: [],
  },
});

export function updateWindowTitle(_taskName?: string): void {
  // Intentionally no-op: window title text is hidden in the custom/native title bars.
}
