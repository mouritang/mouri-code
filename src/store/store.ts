// Barrel file — re-exports from domain modules
export { store } from './core';
export {
  getProject,
  addProject,
  removeProject,
  removeProjectWithTasks,
  updateProject,
  getProjectPath,
  getProjectBranchPrefix,
  pickAndAddProject,
  PASTEL_HUES,
} from './projects';
export { loadAgents, addAgentToTask, markAgentExited, restartAgent } from './agents';
export {
  createTask,
  createDirectTask,
  closeTask,
  retryCloseTask,
  mergeTask,
  pushTask,
  listTaskBranches,
  checkoutTaskBranch,
  createTaskBranch,
  commitTaskChanges,
  updateTaskName,
  updateTaskNotes,
  sendPrompt,
  setLastPrompt,
  clearInitialPrompt,
  clearPrefillPrompt,
  setPrefillPrompt,
  reorderTask,
  spawnShellForTask,
  closeShell,
  hasDirectModeTask,
  getGitHubDropDefaults,
  setNewTaskDropUrl,
} from './tasks';
export {
  setActiveTask,
  setActiveAgent,
  navigateTask,
  navigateAgent,
  moveActiveTask,
  toggleNewTaskDialog,
  openNewTaskDialogForProject,
} from './navigation';
export {
  registerFocusFn,
  unregisterFocusFn,
  triggerFocus,
  registerAction,
  unregisterAction,
  triggerAction,
  getTaskFocusedPanel,
  setTaskFocusedPanel,
  focusSidebar,
  unfocusSidebar,
  unfocusPlaceholder,
  navigateRow,
  navigateColumn,
  setPendingAction,
  clearPendingAction,
  toggleHelpDialog,
  toggleSettingsDialog,
  setSidebarFocusedProjectId,
} from './focus';
export type { PanelId, PendingAction } from './types';
export { saveState, loadState } from './persistence';
export {
  getFontScale,
  adjustFontScale,
  resetFontScale,
  getGlobalScale,
  adjustGlobalScale,
  resetGlobalScale,
  getPanelSize,
  setPanelSizes,
  toggleSidebar,
  setTerminalFont,
  setThemePreset,
  setAutoTrustFolders,
  setInactiveColumnOpacity,
  setWindowState,
} from './ui';
export {
  getTaskDotStatus,
  markAgentActive,
  markAgentOutput,
  clearAgentActivity,
  getAgentOutputTail,
  stripAnsi,
  onAgentReady,
  offAgentReady,
  normalizeForComparison,
  looksLikeQuestion,
  isTrustQuestionAutoHandled,
  isAutoTrustSettling,
  isAgentAskingQuestion,
  startTaskStatusPolling,
  stopTaskStatusPolling,
  rescheduleTaskStatusPolling,
} from './taskStatus';
export type { TaskDotStatus } from './taskStatus';
export { showNotification, clearNotification } from './notification';
export { getCompletedTasksTodayCount, getMergedLineTotals } from './completion';
export {
  createTerminal,
  closeTerminal,
  updateTerminalName,
  syncTerminalCounter,
} from './terminals';
export { openImagePreview, closeImagePreview } from './imagePreview';
export { startRemoteAccess, stopRemoteAccess, refreshRemoteStatus } from './remote';
export {
  setVisionEnabled,
  setVisionApiKey,
  setVisionEndpoint,
  setVisionModel,
  describeImages,
} from './vision';
export {
  syncGlobalMonitorConfig,
  refreshGlobalMonitorStatus,
  runGlobalMonitorNow,
  startGlobalMonitorPolling,
  stopGlobalMonitorPolling,
  setGlobalMonitorEnabled,
  setGlobalMonitorApiKey,
  setGlobalMonitorEndpoint,
  setGlobalMonitorModel,
  setGlobalMonitorIntervalSec,
  sendGlobalMonitorCommand,
  sendGlobalMonitorPrompt,
} from './monitor';
