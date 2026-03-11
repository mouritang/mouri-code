import { Show, For, createSignal, createResource, createEffect } from 'solid-js';
import { invoke } from '../lib/ipc';
import { IPC } from '../../electron/ipc/channels';
import {
  store,
  closeTask,
  mergeTask,
  pushTask,
  getProject,
  listTaskBranches,
  checkoutTaskBranch,
  createTaskBranch,
  commitTaskChanges,
} from '../store/store';
import { sendPrompt } from '../store/tasks';
import { ConfirmDialog } from './ConfirmDialog';
import { Dialog } from './Dialog';
import { ChangedFilesList } from './ChangedFilesList';
import { DiffViewerDialog } from './DiffViewerDialog';
import { theme } from '../lib/theme';
import type { Task } from '../store/types';
import type { BranchInfo, ChangedFile, MergeStatus, WorktreeStatus } from '../ipc/types';

interface TaskDialogsProps {
  task: Task;
  showCloseConfirm: boolean;
  onCloseConfirmDone: () => void;
  showMergeConfirm: boolean;
  initialCleanup: boolean;
  onMergeConfirmDone: () => void;
  showPushConfirm: boolean;
  onPushStart: () => void;
  onPushConfirmDone: (success: boolean) => void;
  showBranchDialog: boolean;
  onBranchDialogDone: () => void;
  showCommitDialog: boolean;
  onCommitDialogDone: () => void;
  diffFile: ChangedFile | null;
  onDiffClose: () => void;
  onDiffFileClick: (file: ChangedFile) => void;
}

export function TaskDialogs(props: TaskDialogsProps) {
  // --- Merge state ---
  const [mergeError, setMergeError] = createSignal('');
  const [merging, setMerging] = createSignal(false);
  const [squash, setSquash] = createSignal(false);
  const [cleanupAfterMerge, setCleanupAfterMerge] = createSignal(false);
  const [squashMessage, setSquashMessage] = createSignal('');
  const [rebasing, setRebasing] = createSignal(false);
  const [rebaseError, setRebaseError] = createSignal('');
  const [rebaseSuccess, setRebaseSuccess] = createSignal(false);

  // --- Push state ---
  const [pushError, setPushError] = createSignal('');
  const [pushing, setPushing] = createSignal(false);
  const [branches, setBranches] = createSignal<BranchInfo[]>([]);
  const [loadingBranches, setLoadingBranches] = createSignal(false);
  const [branchError, setBranchError] = createSignal('');
  const [switchingBranch, setSwitchingBranch] = createSignal(false);
  const [creatingBranch, setCreatingBranch] = createSignal(false);
  const [newBranchName, setNewBranchName] = createSignal('');
  const [commitMessage, setCommitMessage] = createSignal('');
  const [pushAfterCommit, setPushAfterCommit] = createSignal(true);
  const [commitError, setCommitError] = createSignal('');
  const [committing, setCommitting] = createSignal(false);

  // --- Resources ---
  const [branchLog] = createResource(
    () => (props.showMergeConfirm ? props.task.worktreePath : null),
    (path) => invoke<string>(IPC.GetBranchLog, { worktreePath: path }),
  );
  const [worktreeStatus] = createResource(
    () =>
      props.showMergeConfirm ||
      props.showCommitDialog ||
      (props.showCloseConfirm && !props.task.directMode)
        ? props.task.worktreePath
        : null,
    (path) => invoke<WorktreeStatus>(IPC.GetWorktreeStatus, { worktreePath: path }),
  );
  const [mergeStatus, { refetch: refetchMergeStatus }] = createResource(
    () => (props.showMergeConfirm ? props.task.worktreePath : null),
    (path) => invoke<MergeStatus>(IPC.CheckMergeStatus, { worktreePath: path }),
  );

  const hasConflicts = () => (mergeStatus()?.conflicting_files.length ?? 0) > 0;
  const hasCommittedChangesToMerge = () => worktreeStatus()?.has_committed_changes ?? false;

  // Reset all merge-related state when the dialog opens
  createEffect(() => {
    if (props.showMergeConfirm) {
      setCleanupAfterMerge(props.initialCleanup);
      setSquash(false);
      setSquashMessage('');
      setMergeError('');
      setRebaseError('');
      setRebaseSuccess(false);
      setMerging(false);
      setRebasing(false);
    }
  });

  function normalizeBranchNameInput(raw: string): string {
    return raw.trim().replace(/\s+/g, '-');
  }

  async function reloadBranches(): Promise<void> {
    setLoadingBranches(true);
    setBranchError('');
    try {
      const result = await listTaskBranches(props.task.id);
      setBranches(result);
    } catch (err) {
      setBranchError(String(err));
    } finally {
      setLoadingBranches(false);
    }
  }

  createEffect(() => {
    if (!props.showBranchDialog) return;
    setBranchError('');
    setSwitchingBranch(false);
    setCreatingBranch(false);
    setNewBranchName('');
    void reloadBranches();
  });

  createEffect(() => {
    if (!props.showCommitDialog) return;
    setCommitMessage('');
    setPushAfterCommit(true);
    setCommitError('');
    setCommitting(false);
  });

  return (
    <>
      {/* Close Task Dialog */}
      <ConfirmDialog
        open={props.showCloseConfirm}
        title="关闭任务"
        message={
          <div>
            <Show when={props.task.directMode}>
              <p style={{ margin: '0' }}>
                这会停止该任务下所有正在运行的智能体和终端，不会执行任何版本控制操作。
              </p>
            </Show>
            <Show when={!props.task.directMode}>
              <Show
                when={
                  worktreeStatus()?.has_uncommitted_changes ||
                  worktreeStatus()?.has_committed_changes
                }
              >
                <div
                  style={{
                    'margin-bottom': '12px',
                    display: 'flex',
                    'flex-direction': 'column',
                    gap: '8px',
                  }}
                >
                  <Show when={worktreeStatus()?.has_uncommitted_changes}>
                    <div
                      style={{
                        'font-size': '12px',
                        color: theme.warning,
                        background: `color-mix(in srgb, ${theme.warning} 8%, transparent)`,
                        padding: '8px 12px',
                        'border-radius': '8px',
                        border: `1px solid color-mix(in srgb, ${theme.warning} 20%, transparent)`,
                        'font-weight': '600',
                      }}
                    >
                      警告：存在未提交改动，关闭后将永久丢失。
                    </div>
                  </Show>
                  <Show when={worktreeStatus()?.has_committed_changes}>
                    <div
                      style={{
                        'font-size': '12px',
                        color: theme.warning,
                        background: `color-mix(in srgb, ${theme.warning} 8%, transparent)`,
                        padding: '8px 12px',
                        'border-radius': '8px',
                        border: `1px solid color-mix(in srgb, ${theme.warning} 20%, transparent)`,
                        'font-weight': '600',
                      }}
                    >
                      警告：该分支有尚未合并到主分支的提交。
                    </div>
                  </Show>
                </div>
              </Show>
              {(() => {
                const project = getProject(props.task.projectId);
                const willDeleteBranch = project?.deleteBranchOnClose ?? true;
                return (
                  <>
                    <p style={{ margin: '0 0 8px' }}>
                      {willDeleteBranch
                        ? '该操作不可撤销。以下内容将被永久删除：'
                        : '将删除工作树，但保留分支：'}
                    </p>
                    <ul
                      style={{
                        margin: '0',
                        'padding-left': '20px',
                        display: 'flex',
                        'flex-direction': 'column',
                        gap: '4px',
                      }}
                    >
                      <Show when={willDeleteBranch}>
                        <li>
                          本地功能分支 <strong>{props.task.branchName}</strong>
                        </li>
                      </Show>
                      <li>
                        工作树路径 <strong>{props.task.worktreePath}</strong>
                      </li>
                      <Show when={!willDeleteBranch}>
                        <li style={{ color: theme.fgMuted }}>
                          将保留分支 <strong>{props.task.branchName}</strong>
                        </li>
                      </Show>
                    </ul>
                  </>
                );
              })()}
            </Show>
          </div>
        }
        confirmLabel={props.task.directMode ? '关闭' : '删除'}
        danger={!props.task.directMode}
        onConfirm={() => {
          props.onCloseConfirmDone();
          closeTask(props.task.id);
        }}
        onCancel={() => props.onCloseConfirmDone()}
      />

      {/* Merge Dialog */}
      <ConfirmDialog
        open={props.showMergeConfirm}
        title="合并到主分支"
        width="520px"
        autoFocusCancel
        message={
          <div>
            <Show when={worktreeStatus()?.has_uncommitted_changes}>
              <div
                style={{
                  'margin-bottom': '12px',
                  'font-size': '12px',
                  color: theme.warning,
                  background: `color-mix(in srgb, ${theme.warning} 8%, transparent)`,
                  padding: '8px 12px',
                  'border-radius': '8px',
                  border: `1px solid color-mix(in srgb, ${theme.warning} 20%, transparent)`,
                  'font-weight': '600',
                }}
              >
                警告：你有未提交改动，这些改动不会包含在本次合并中。
              </div>
            </Show>
            <Show when={!worktreeStatus.loading && !hasCommittedChangesToMerge()}>
              <div
                style={{
                  'margin-bottom': '12px',
                  'font-size': '12px',
                  color: theme.warning,
                  background: `color-mix(in srgb, ${theme.warning} 8%, transparent)`,
                  padding: '8px 12px',
                  'border-radius': '8px',
                  border: `1px solid color-mix(in srgb, ${theme.warning} 20%, transparent)`,
                  'font-weight': '600',
                }}
              >
                无可合并内容：该分支相较主分支没有已提交改动。
              </div>
            </Show>
            <Show when={mergeStatus.loading}>
              <div
                style={{
                  'margin-bottom': '12px',
                  'font-size': '12px',
                  color: theme.fgMuted,
                  padding: '8px 12px',
                  'border-radius': '8px',
                  background: theme.bgInput,
                  border: `1px solid ${theme.border}`,
                }}
              >
                正在检查与主分支的冲突...
              </div>
            </Show>
            <Show when={!mergeStatus.loading && mergeStatus()}>
              {(status) => (
                <Show when={status().main_ahead_count > 0}>
                  <div
                    style={{
                      'margin-bottom': '12px',
                      'font-size': '12px',
                      color: hasConflicts() ? theme.error : theme.warning,
                      background: hasConflicts()
                        ? `color-mix(in srgb, ${theme.error} 8%, transparent)`
                        : `color-mix(in srgb, ${theme.warning} 8%, transparent)`,
                      padding: '8px 12px',
                      'border-radius': '8px',
                      border: hasConflicts()
                        ? `1px solid color-mix(in srgb, ${theme.error} 20%, transparent)`
                        : `1px solid color-mix(in srgb, ${theme.warning} 20%, transparent)`,
                      'font-weight': '600',
                    }}
                  >
                    <Show when={!hasConflicts()}>
                      主分支有 {status().main_ahead_count} 个新提交。请先变基到主分支。
                    </Show>
                    <Show when={hasConflicts()}>
                      <div>
                        检测到与主分支的冲突（{status().conflicting_files.length} 个文件）：
                      </div>
                      <ul
                        style={{ margin: '4px 0 0', 'padding-left': '20px', 'font-weight': '400' }}
                      >
                        <For each={status().conflicting_files}>{(f) => <li>{f}</li>}</For>
                      </ul>
                      <div style={{ 'margin-top': '4px', 'font-weight': '400' }}>
                        请先变基到主分支以解决冲突。
                      </div>
                    </Show>
                  </div>
                  <div
                    style={{
                      'margin-bottom': '12px',
                      display: 'flex',
                      'align-items': 'center',
                      gap: '8px',
                    }}
                  >
                    <button
                      type="button"
                      disabled={rebasing() || worktreeStatus()?.has_uncommitted_changes}
                      onClick={async () => {
                        setRebasing(true);
                        setRebaseError('');
                        setRebaseSuccess(false);
                        try {
                          await invoke(IPC.RebaseTask, { worktreePath: props.task.worktreePath });
                          setRebaseSuccess(true);
                          refetchMergeStatus();
                        } catch (err) {
                          setRebaseError(String(err));
                        } finally {
                          setRebasing(false);
                        }
                      }}
                      title={
                        worktreeStatus()?.has_uncommitted_changes
                          ? '请先提交或暂存改动后再执行变基'
                          : '变基到主分支'
                      }
                      style={{
                        padding: '6px 14px',
                        background: theme.bgInput,
                        border: `1px solid ${theme.border}`,
                        'border-radius': '8px',
                        color: theme.fg,
                        cursor:
                          rebasing() || worktreeStatus()?.has_uncommitted_changes
                            ? 'not-allowed'
                            : 'pointer',
                        'font-size': '12px',
                        opacity:
                          rebasing() || worktreeStatus()?.has_uncommitted_changes ? '0.5' : '1',
                      }}
                    >
                      {rebasing() ? '变基中...' : '变基到主分支'}
                    </button>
                    <Show
                      when={
                        props.task.agentIds.length > 0 &&
                        store.agents[props.task.agentIds[0]]?.status === 'running'
                      }
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const agentId = props.task.agentIds[0];
                          props.onMergeConfirmDone();
                          sendPrompt(
                            props.task.id,
                            agentId,
                            '请把当前分支变基到主分支并解决冲突',
                          ).catch((err) => {
                            console.error('发送变基提示失败:', err);
                          });
                        }}
                        title="关闭对话框并让智能体执行变基"
                        style={{
                          padding: '6px 14px',
                          background: theme.accent,
                          border: 'none',
                          'border-radius': '8px',
                          color: theme.accentText,
                          cursor: 'pointer',
                          'font-size': '12px',
                          'font-weight': '600',
                        }}
                      >
                        由智能体执行变基
                      </button>
                    </Show>
                    <Show when={rebaseSuccess()}>
                      <span style={{ 'font-size': '12px', color: theme.success }}>变基成功</span>
                    </Show>
                    <Show when={rebaseError()}>
                      <span style={{ 'font-size': '12px', color: theme.error }}>
                        {rebaseError()}
                      </span>
                    </Show>
                  </div>
                </Show>
              )}
            </Show>
            <p style={{ margin: '0 0 12px' }}>
              将 <strong>{props.task.branchName}</strong> 合并到主分支：
            </p>
            <Show when={!branchLog.loading && branchLog()}>
              {(log) => {
                const commits = () =>
                  log()
                    .split('\n')
                    .filter((l: string) => l.trim())
                    .map((l: string) => l.replace(/^- /, ''));
                return (
                  <div
                    style={{
                      'margin-bottom': '12px',
                      'max-height': '120px',
                      'overflow-y': 'auto',
                      'font-family': "'JetBrains Mono', monospace",
                      'font-size': '11px',
                      border: `1px solid ${theme.border}`,
                      'border-radius': '8px',
                      overflow: 'hidden',
                      padding: '4px 0',
                    }}
                  >
                    <For each={commits()}>
                      {(msg) => (
                        <div
                          title={msg}
                          style={{
                            display: 'flex',
                            'align-items': 'center',
                            gap: '6px',
                            padding: '2px 8px',
                            'white-space': 'nowrap',
                            overflow: 'hidden',
                            'text-overflow': 'ellipsis',
                            color: theme.fg,
                          }}
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            style={{ 'flex-shrink': '0' }}
                          >
                            <circle
                              cx="5"
                              cy="5"
                              r="3"
                              fill="none"
                              stroke={theme.accent}
                              stroke-width="1.5"
                            />
                          </svg>
                          <span
                            style={{
                              overflow: 'hidden',
                              'text-overflow': 'ellipsis',
                            }}
                          >
                            {msg}
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                );
              }}
            </Show>
            <div
              style={{
                border: `1px solid ${theme.border}`,
                'border-radius': '8px',
                overflow: 'hidden',
                'max-height': '240px',
                display: 'flex',
                'flex-direction': 'column',
              }}
            >
              <ChangedFilesList
                worktreePath={props.task.worktreePath}
                isActive={props.showMergeConfirm}
                onFileClick={props.onDiffFileClick}
              />
            </div>
            <label
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '8px',
                'margin-top': '12px',
                cursor: 'pointer',
                'font-size': '13px',
                color: theme.fg,
              }}
            >
              <input
                type="checkbox"
                checked={cleanupAfterMerge()}
                onChange={(e) => setCleanupAfterMerge(e.currentTarget.checked)}
                style={{ cursor: 'pointer' }}
              />
              合并后删除分支和工作树
            </label>
            <label
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '8px',
                'margin-top': '8px',
                cursor: 'pointer',
                'font-size': '13px',
                color: theme.fg,
              }}
            >
              <input
                type="checkbox"
                checked={squash()}
                onChange={(e) => {
                  const checked = e.currentTarget.checked;
                  setSquash(checked);
                  if (checked && !squashMessage()) {
                    setSquashMessage(branchLog() ?? '');
                  }
                }}
                style={{ cursor: 'pointer' }}
              />
              压缩提交
            </label>
            <Show when={squash()}>
              <textarea
                value={squashMessage()}
                onInput={(e) => setSquashMessage(e.currentTarget.value)}
                placeholder="提交信息..."
                rows={6}
                style={{
                  'margin-top': '8px',
                  width: '100%',
                  background: theme.bgInput,
                  border: `1px solid ${theme.border}`,
                  'border-radius': '8px',
                  padding: '8px 10px',
                  color: theme.fg,
                  'font-size': '12px',
                  'font-family': "'JetBrains Mono', monospace",
                  resize: 'vertical',
                  outline: 'none',
                  'box-sizing': 'border-box',
                }}
              />
            </Show>
            <Show when={mergeError()}>
              <div
                style={{
                  'margin-top': '12px',
                  'font-size': '12px',
                  color: theme.error,
                  background: `color-mix(in srgb, ${theme.error} 8%, transparent)`,
                  padding: '8px 12px',
                  'border-radius': '8px',
                  border: `1px solid color-mix(in srgb, ${theme.error} 20%, transparent)`,
                }}
              >
                {mergeError()}
              </div>
            </Show>
          </div>
        }
        confirmDisabled={merging() || hasConflicts() || !hasCommittedChangesToMerge()}
        confirmLoading={merging()}
        confirmLabel={merging() ? '合并中...' : squash() ? '压缩合并' : '合并'}
        onConfirm={() => {
          const taskId = props.task.id;
          const onDone = props.onMergeConfirmDone;
          setMergeError('');
          setMerging(true);
          void mergeTask(taskId, {
            squash: squash(),
            message: squash() ? squashMessage() || undefined : undefined,
            cleanup: cleanupAfterMerge(),
          })
            .then(() => {
              onDone();
            })
            .catch((err) => {
              setMergeError(String(err));
            })
            .finally(() => {
              setMerging(false);
            });
        }}
        onCancel={() => {
          props.onMergeConfirmDone();
          setMergeError('');
          setSquash(false);
          setCleanupAfterMerge(false);
          setSquashMessage('');
          setRebaseError('');
          setRebaseSuccess(false);
        }}
      />

      {/* Push Dialog */}
      <ConfirmDialog
        open={props.showPushConfirm}
        title="推送到远程仓库"
        message={
          <div>
            <p style={{ margin: '0 0 8px' }}>
              确认将分支 <strong>{props.task.branchName}</strong> 推送到远程仓库？
            </p>
            <Show when={pushError()}>
              <div
                style={{
                  'margin-top': '12px',
                  'font-size': '12px',
                  color: theme.error,
                  background: `color-mix(in srgb, ${theme.error} 8%, transparent)`,
                  padding: '8px 12px',
                  'border-radius': '8px',
                  border: `1px solid color-mix(in srgb, ${theme.error} 20%, transparent)`,
                }}
              >
                {pushError()}
              </div>
            </Show>
          </div>
        }
        confirmLabel={pushing() ? '推送中...' : '推送'}
        onConfirm={() => {
          const taskId = props.task.id;
          const onStart = props.onPushStart;
          const onDone = props.onPushConfirmDone;
          setPushError('');
          setPushing(true);
          onStart();
          void pushTask(taskId)
            .then(() => {
              onDone(true);
            })
            .catch((err) => {
              setPushError(String(err));
              onDone(false);
            })
            .finally(() => {
              setPushing(false);
            });
        }}
        onCancel={() => {
          props.onPushConfirmDone(false);
          setPushError('');
        }}
      />

      {/* Branch Dialog */}
      <Dialog
        open={props.showBranchDialog}
        onClose={() => props.onBranchDialogDone()}
        width="520px"
        panelStyle={{ gap: '14px' }}
      >
        <h2
          style={{
            margin: '0',
            'font-size': '16px',
            color: theme.fg,
            'font-weight': '600',
          }}
        >
          切换或创建分支
        </h2>
        <p style={{ margin: '0', 'font-size': '12px', color: theme.fgMuted }}>
          当前分支：<strong style={{ color: theme.fg }}>{props.task.branchName}</strong>
        </p>
        <Show when={branchError()}>
          <div
            style={{
              'font-size': '12px',
              color: theme.error,
              background: `color-mix(in srgb, ${theme.error} 8%, transparent)`,
              padding: '8px 12px',
              'border-radius': '8px',
              border: `1px solid color-mix(in srgb, ${theme.error} 20%, transparent)`,
            }}
          >
            {branchError()}
          </div>
        </Show>
        <div
          style={{
            border: `1px solid ${theme.border}`,
            'border-radius': '8px',
            overflow: 'hidden',
            'max-height': '220px',
            display: 'flex',
            'flex-direction': 'column',
          }}
        >
          <div
            style={{
              'font-size': '11px',
              color: theme.fgMuted,
              padding: '7px 10px',
              background: theme.bgInput,
              'border-bottom': `1px solid ${theme.border}`,
            }}
          >
            本地分支
          </div>
          <div style={{ overflow: 'auto' }}>
            <Show
              when={!loadingBranches()}
              fallback={
                <div
                  style={{
                    padding: '14px',
                    display: 'flex',
                    'align-items': 'center',
                    gap: '8px',
                    color: theme.fgMuted,
                    'font-size': '12px',
                  }}
                >
                  <span class="inline-spinner" />
                  正在读取分支...
                </div>
              }
            >
              <Show
                when={branches().length > 0}
                fallback={
                  <div style={{ padding: '14px', color: theme.fgMuted, 'font-size': '12px' }}>
                    未读取到分支。
                  </div>
                }
              >
                <For each={branches()}>
                  {(branch) => (
                    <button
                      type="button"
                      disabled={switchingBranch() || creatingBranch() || branch.current}
                      onClick={() => {
                        if (branch.current) return;
                        setSwitchingBranch(true);
                        setBranchError('');
                        void checkoutTaskBranch(props.task.id, branch.name)
                          .then(() => {
                            props.onBranchDialogDone();
                          })
                          .catch((err) => {
                            setBranchError(String(err));
                          })
                          .finally(() => {
                            setSwitchingBranch(false);
                          });
                      }}
                      title={branch.current ? '当前分支' : `切换到 ${branch.name}`}
                      style={{
                        width: '100%',
                        display: 'flex',
                        'align-items': 'center',
                        'justify-content': 'space-between',
                        gap: '8px',
                        padding: '8px 10px',
                        background: branch.current
                          ? `color-mix(in srgb, ${theme.accent} 10%, transparent)`
                          : 'transparent',
                        border: 'none',
                        'border-bottom': `1px solid ${theme.border}`,
                        color: branch.current ? theme.accent : theme.fg,
                        cursor: branch.current ? 'default' : 'pointer',
                        'font-size': '12px',
                        'text-align': 'left',
                      }}
                    >
                      <span
                        style={{
                          overflow: 'hidden',
                          'text-overflow': 'ellipsis',
                          'white-space': 'nowrap',
                        }}
                      >
                        {branch.name}
                      </span>
                      <Show when={branch.current}>
                        <span style={{ 'font-size': '11px', color: theme.accent }}>当前</span>
                      </Show>
                    </button>
                  )}
                </For>
              </Show>
            </Show>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '8px',
          }}
        >
          <input
            value={newBranchName()}
            onInput={(e) => setNewBranchName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const normalized = normalizeBranchNameInput(newBranchName());
              if (!normalized) {
                setBranchError('请输入分支名。');
                return;
              }
              if (switchingBranch() || creatingBranch()) return;
              setCreatingBranch(true);
              setBranchError('');
              void createTaskBranch(props.task.id, normalized)
                .then(() => {
                  props.onBranchDialogDone();
                })
                .catch((err) => {
                  setBranchError(String(err));
                })
                .finally(() => {
                  setCreatingBranch(false);
                });
            }}
            placeholder="新分支名，例如: feat/new-flow"
            style={{
              flex: '1',
              background: theme.bgInput,
              border: `1px solid ${theme.border}`,
              'border-radius': '8px',
              padding: '8px 10px',
              color: theme.fg,
              'font-size': '12px',
              outline: 'none',
            }}
          />
          <button
            type="button"
            disabled={
              switchingBranch() || creatingBranch() || !normalizeBranchNameInput(newBranchName())
            }
            onClick={() => {
              const normalized = normalizeBranchNameInput(newBranchName());
              if (!normalized) {
                setBranchError('请输入分支名。');
                return;
              }
              setCreatingBranch(true);
              setBranchError('');
              void createTaskBranch(props.task.id, normalized)
                .then(() => {
                  props.onBranchDialogDone();
                })
                .catch((err) => {
                  setBranchError(String(err));
                })
                .finally(() => {
                  setCreatingBranch(false);
                });
            }}
            style={{
              padding: '8px 14px',
              background: theme.accent,
              border: 'none',
              'border-radius': '8px',
              color: theme.accentText,
              cursor:
                switchingBranch() || creatingBranch() || !normalizeBranchNameInput(newBranchName())
                  ? 'not-allowed'
                  : 'pointer',
              opacity:
                switchingBranch() || creatingBranch() || !normalizeBranchNameInput(newBranchName())
                  ? '0.55'
                  : '1',
              'font-size': '12px',
              'font-weight': '600',
              display: 'inline-flex',
              'align-items': 'center',
              gap: '8px',
            }}
          >
            <Show when={creatingBranch()}>
              <span class="inline-spinner" />
            </Show>
            创建并切换
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            'justify-content': 'flex-end',
            gap: '8px',
            'padding-top': '2px',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setBranchError('');
              props.onBranchDialogDone();
            }}
            style={{
              padding: '8px 14px',
              background: theme.bgInput,
              border: `1px solid ${theme.border}`,
              'border-radius': '8px',
              color: theme.fgMuted,
              cursor: 'pointer',
              'font-size': '12px',
            }}
          >
            关闭
          </button>
          <button
            type="button"
            disabled={loadingBranches() || switchingBranch() || creatingBranch()}
            onClick={() => {
              void reloadBranches();
            }}
            style={{
              padding: '8px 14px',
              background: theme.bgInput,
              border: `1px solid ${theme.border}`,
              'border-radius': '8px',
              color: theme.fg,
              cursor:
                loadingBranches() || switchingBranch() || creatingBranch()
                  ? 'not-allowed'
                  : 'pointer',
              opacity: loadingBranches() || switchingBranch() || creatingBranch() ? '0.55' : '1',
              'font-size': '12px',
            }}
          >
            刷新分支
          </button>
        </div>
      </Dialog>

      {/* Commit Dialog */}
      <ConfirmDialog
        open={props.showCommitDialog}
        title="提交改动"
        width="560px"
        message={
          <div>
            <p style={{ margin: '0 0 8px' }}>
              将当前分支 <strong>{props.task.branchName}</strong> 的未提交改动写入新提交。
            </p>
            <Show when={!worktreeStatus.loading && !worktreeStatus()?.has_uncommitted_changes}>
              <div
                style={{
                  'margin-bottom': '12px',
                  'font-size': '12px',
                  color: theme.warning,
                  background: `color-mix(in srgb, ${theme.warning} 8%, transparent)`,
                  padding: '8px 12px',
                  'border-radius': '8px',
                  border: `1px solid color-mix(in srgb, ${theme.warning} 20%, transparent)`,
                  'font-weight': '600',
                }}
              >
                当前没有可提交的改动。
              </div>
            </Show>
            <textarea
              value={commitMessage()}
              onInput={(e) => setCommitMessage(e.currentTarget.value)}
              placeholder="提交信息..."
              rows={4}
              style={{
                width: '100%',
                background: theme.bgInput,
                border: `1px solid ${theme.border}`,
                'border-radius': '8px',
                padding: '8px 10px',
                color: theme.fg,
                'font-size': '12px',
                'font-family': "'JetBrains Mono', monospace",
                resize: 'vertical',
                outline: 'none',
                'box-sizing': 'border-box',
                'margin-bottom': '10px',
              }}
            />
            <label
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '8px',
                'margin-bottom': '12px',
                cursor: 'pointer',
                'font-size': '13px',
                color: theme.fg,
              }}
            >
              <input
                type="checkbox"
                checked={pushAfterCommit()}
                onChange={(e) => setPushAfterCommit(e.currentTarget.checked)}
                style={{ cursor: 'pointer' }}
              />
              提交后立即推送到远程
            </label>
            <div
              style={{
                border: `1px solid ${theme.border}`,
                'border-radius': '8px',
                overflow: 'hidden',
                'max-height': '220px',
                display: 'flex',
                'flex-direction': 'column',
              }}
            >
              <ChangedFilesList
                worktreePath={props.task.worktreePath}
                isActive={props.showCommitDialog}
                onFileClick={props.onDiffFileClick}
              />
            </div>
            <Show when={commitError()}>
              <div
                style={{
                  'margin-top': '12px',
                  'font-size': '12px',
                  color: theme.error,
                  background: `color-mix(in srgb, ${theme.error} 8%, transparent)`,
                  padding: '8px 12px',
                  'border-radius': '8px',
                  border: `1px solid color-mix(in srgb, ${theme.error} 20%, transparent)`,
                }}
              >
                {commitError()}
              </div>
            </Show>
          </div>
        }
        confirmDisabled={
          committing() ||
          !worktreeStatus()?.has_uncommitted_changes ||
          !commitMessage().trim().length
        }
        confirmLoading={committing()}
        confirmLabel={
          committing()
            ? pushAfterCommit()
              ? '提交并推送中...'
              : '提交中...'
            : pushAfterCommit()
              ? '提交并推送'
              : '提交'
        }
        onConfirm={() => {
          const taskId = props.task.id;
          const shouldPush = pushAfterCommit();
          setCommitError('');
          setCommitting(true);
          void commitTaskChanges(taskId, commitMessage().trim())
            .then(async (commitHash) => {
              if (!shouldPush) {
                props.onCommitDialogDone();
                return;
              }
              props.onPushStart();
              try {
                await pushTask(taskId);
                props.onPushConfirmDone(true);
                props.onCommitDialogDone();
              } catch (err) {
                props.onPushConfirmDone(false);
                setCommitError(`提交 ${commitHash} 已完成，但推送失败：${err}`);
              }
            })
            .catch((err) => {
              setCommitError(String(err));
            })
            .finally(() => {
              setCommitting(false);
            });
        }}
        onCancel={() => {
          props.onCommitDialogDone();
          setCommitError('');
          setCommitMessage('');
        }}
      />

      {/* Diff Viewer */}
      <DiffViewerDialog
        file={props.diffFile}
        worktreePath={props.task.worktreePath}
        onClose={props.onDiffClose}
      />
    </>
  );
}
