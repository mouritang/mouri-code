export type PtyOutput =
  | { type: 'Data'; data: string } // base64-encoded
  | {
      type: 'Exit';
      data: { exit_code: number | null; signal: string | null; last_output: string[] };
    };

export interface AgentDef {
  id: string;
  name: string;
  command: string;
  args: string[];
  resume_args?: string[];
  skip_permissions_args?: string[];
  description: string;
}

export type GlobalMonitorStatus = 'disabled' | 'idle' | 'running' | 'error';
export type GlobalMonitorSeverity = 'high' | 'medium' | 'low';
export type GlobalMonitorTaskStatus = 'coding' | 'blocked' | 'waiting' | 'done' | 'idle';

export interface GlobalMonitorAlert {
  taskId: string;
  taskName: string;
  severity: GlobalMonitorSeverity;
  issue: string;
  action: string;
}

export interface GlobalMonitorTaskInsight {
  taskId: string;
  taskName: string;
  status: GlobalMonitorTaskStatus;
  detail: string;
}

export interface GlobalMonitorCommand {
  taskId: string;
  taskName: string;
  prompt: string;
  rationale: string;
}

export interface GlobalMonitorSnapshot {
  enabled: boolean;
  hasApiKey: boolean;
  endpoint: string;
  model: string;
  intervalSec: number;
  status: GlobalMonitorStatus;
  lastRunAt: string | null;
  lastSummary: string | null;
  lastError: string | null;
  activeTaskCount: number;
  alerts: GlobalMonitorAlert[];
  taskInsights: GlobalMonitorTaskInsight[];
  commands: GlobalMonitorCommand[];
}

export interface CreateTaskResult {
  id: string;
  branch_name: string;
  worktree_path: string;
}

export interface TaskInfo {
  id: string;
  name: string;
  branch_name: string;
  worktree_path: string;
  agent_ids: string[];
  status: 'Active' | 'Closed';
}

export interface ChangedFile {
  path: string;
  lines_added: number;
  lines_removed: number;
  status: string;
  committed: boolean;
}

export interface WorktreeStatus {
  has_committed_changes: boolean;
  has_uncommitted_changes: boolean;
}

export interface MergeStatus {
  main_ahead_count: number;
  conflicting_files: string[];
}

export interface MergeResult {
  main_branch: string;
  lines_added: number;
  lines_removed: number;
}

export interface BranchInfo {
  name: string;
  current: boolean;
}

export interface BranchOperationResult {
  current_branch: string;
}

export interface CommitResult {
  commit_hash: string;
  branch_name: string;
}

export interface FileDataUrl {
  mime: string;
  bytes: number;
  data_url: string;
}

export type SaveClipboardImageResult =
  | { ok: true; filePath: string; bytes: number; mime: string }
  | { ok: false; reason?: string };
