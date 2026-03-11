import { createSignal, createEffect, createMemo, onMount, onCleanup, For, Show } from 'solid-js';
import {
  store,
  pickAndAddProject,
  removeProject,
  removeProjectWithTasks,
  openNewTaskDialogForProject,
  setActiveTask,
  toggleSidebar,
  reorderTask,
  getTaskDotStatus,
  registerFocusFn,
  unregisterFocusFn,
  focusSidebar,
  unfocusSidebar,
  setTaskFocusedPanel,
  getTaskFocusedPanel,
  getPanelSize,
  setPanelSizes,
  toggleSettingsDialog,
} from '../store/store';
import type { Project } from '../store/types';
import { ConnectPhoneModal } from './ConnectPhoneModal';
import { stopRemoteAccess } from '../store/remote';
import { ConfirmDialog } from './ConfirmDialog';
import { EditProjectDialog } from './EditProjectDialog';
import { SidebarFooter } from './SidebarFooter';
import { GlobalAssistantCard } from './GlobalAssistantCard';
import { IconButton } from './IconButton';
import { StatusDot } from './StatusDot';
import { theme } from '../lib/theme';
import { sf } from '../lib/fontScale';
import { mod } from '../lib/platform';

const DRAG_THRESHOLD = 5;
const SIDEBAR_DEFAULT_WIDTH = 240;
const SIDEBAR_MIN_WIDTH = 160;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_SIZE_KEY = 'sidebar:width';

function projectMenuButtonStyle() {
  return {
    width: '100%',
    padding: '6px 8px',
    background: 'transparent',
    border: 'none',
    'border-radius': '6px',
    color: theme.fg,
    cursor: 'pointer',
    'text-align': 'left' as const,
    'font-size': sf(11),
  };
}

function projectMenuDangerButtonStyle() {
  return {
    width: '100%',
    padding: '6px 8px',
    background: 'transparent',
    border: 'none',
    'border-radius': '6px',
    color: theme.error,
    cursor: 'pointer',
    'text-align': 'left' as const,
    'font-size': sf(11),
  };
}

export function Sidebar() {
  const [confirmRemove, setConfirmRemove] = createSignal<string | null>(null);
  const [editingProject, setEditingProject] = createSignal<Project | null>(null);
  const [projectMenuId, setProjectMenuId] = createSignal<string | null>(null);
  const [showConnectPhone, setShowConnectPhone] = createSignal(false);
  const [dragFromIndex, setDragFromIndex] = createSignal<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = createSignal<number | null>(null);
  const [resizing, setResizing] = createSignal(false);
  let taskListRef: HTMLDivElement | undefined;

  const sidebarWidth = () => getPanelSize(SIDEBAR_SIZE_KEY) ?? SIDEBAR_DEFAULT_WIDTH;
  const taskIndexById = createMemo(() => {
    const map = new Map<string, number>();
    store.taskOrder.forEach((taskId, idx) => map.set(taskId, idx));
    return map;
  });
  const groupedTasks = createMemo(() => {
    const grouped: Record<string, string[]> = {};
    const orphaned: string[] = [];
    const projectIds = new Set(store.projects.map((p) => p.id));

    for (const taskId of store.taskOrder) {
      const task = store.tasks[taskId];
      if (!task) continue;
      const projectId = task.projectId;
      if (projectId && projectIds.has(projectId)) {
        (grouped[projectId] ??= []).push(taskId);
      } else {
        orphaned.push(taskId);
      }
    }

    return { grouped, orphaned };
  });
  function handleResizeMouseDown(e: MouseEvent) {
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth();

    function onMove(ev: MouseEvent) {
      const newWidth = Math.max(
        SIDEBAR_MIN_WIDTH,
        Math.min(SIDEBAR_MAX_WIDTH, startWidth + ev.clientX - startX),
      );
      setPanelSizes({ [SIDEBAR_SIZE_KEY]: newWidth });
    }

    function onUp() {
      setResizing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  onMount(() => {
    // Attach mousedown on task list container via native listener
    const el = taskListRef;
    if (el) {
      const handler = (e: MouseEvent) => {
        const target = (e.target as HTMLElement).closest<HTMLElement>('[data-task-index]');
        if (!target) return;
        const index = Number(target.dataset.taskIndex);
        const taskId = store.taskOrder[index];
        if (taskId === undefined || taskId === null) return;
        handleTaskMouseDown(e, taskId, index);
      };
      el.addEventListener('mousedown', handler);
      onCleanup(() => el.removeEventListener('mousedown', handler));
    }

    // Register sidebar focus
    registerFocusFn('sidebar', () => taskListRef?.focus());
    onCleanup(() => unregisterFocusFn('sidebar'));
  });

  // When sidebarFocused changes, trigger focus
  createEffect(() => {
    if (store.sidebarFocused) {
      taskListRef?.focus();
    }
  });

  // Scroll the active task into view when it changes
  createEffect(() => {
    const activeId = store.activeTaskId;
    if (!activeId || !taskListRef) return;
    const idx = taskIndexById().get(activeId);
    if (idx === undefined) return;
    const el = taskListRef.querySelector<HTMLElement>(`[data-task-index="${idx}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  });

  // Scroll the focused task into view when navigating via keyboard
  createEffect(() => {
    const focusedId = store.sidebarFocusedTaskId;
    if (!focusedId || !taskListRef) return;
    const idx = taskIndexById().get(focusedId);
    if (idx === undefined) return;
    const el = taskListRef.querySelector<HTMLElement>(`[data-task-index="${idx}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  });

  // Scroll the focused project into view when it changes
  createEffect(() => {
    const projectId = store.sidebarFocusedProjectId;
    if (!projectId) return;
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-project-id="${projectId}"]`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
  });

  createEffect(() => {
    const menuId = projectMenuId();
    if (!menuId) return;

    const handleOutside = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const menuRoot = target?.closest<HTMLElement>('[data-project-menu-id]');
      if (!menuRoot || menuRoot.dataset.projectMenuId !== menuId) {
        setProjectMenuId(null);
      }
    };

    window.addEventListener('pointerdown', handleOutside);
    onCleanup(() => window.removeEventListener('pointerdown', handleOutside));
  });

  async function handleAddProject() {
    await pickAndAddProject();
  }

  function handleRemoveProject(projectId: string) {
    const hasTasks = store.taskOrder.some((tid) => store.tasks[tid]?.projectId === projectId);
    if (hasTasks) {
      setConfirmRemove(projectId);
    } else {
      removeProject(projectId);
    }
  }

  function computeDropIndex(clientY: number, fromIdx: number): number {
    if (!taskListRef) return fromIdx;
    const items = taskListRef.querySelectorAll<HTMLElement>('[data-task-index]');
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (clientY < midY) return i;
    }
    return items.length;
  }

  function handleTaskMouseDown(e: MouseEvent, taskId: string, index: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;

      if (!dragging) {
        dragging = true;
        setDragFromIndex(index);
        document.body.classList.add('dragging-task');
      }

      const dropIdx = computeDropIndex(ev.clientY, index);
      setDropTargetIndex(dropIdx);
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);

      if (dragging) {
        document.body.classList.remove('dragging-task');
        const from = dragFromIndex();
        const to = dropTargetIndex();
        setDragFromIndex(null);
        setDropTargetIndex(null);

        if (from !== null && to !== null && from !== to) {
          const adjustedTo = to > from ? to - 1 : to;
          reorderTask(from, adjustedTo);
        }
      } else {
        setActiveTask(taskId);
        focusSidebar();
      }
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function abbreviatePath(path: string): string {
    const home = '/home/';
    if (path.startsWith(home)) {
      const rest = path.slice(home.length);
      const slashIdx = rest.indexOf('/');
      if (slashIdx !== -1) return '~' + rest.slice(slashIdx);
      return '~';
    }
    return path;
  }

  // Compute the global taskOrder index for a given task
  function globalIndex(taskId: string): number {
    return taskIndexById().get(taskId) ?? -1;
  }

  let sidebarRef!: HTMLDivElement;

  return (
    <div
      ref={sidebarRef}
      style={{
        width: `${sidebarWidth()}px`,
        'min-width': `${SIDEBAR_MIN_WIDTH}px`,
        'max-width': `${SIDEBAR_MAX_WIDTH}px`,
        display: 'flex',
        'flex-shrink': '0',
        'user-select': resizing() ? 'none' : undefined,
      }}
    >
      <div
        style={{
          flex: '1',
          'min-width': '0',
          display: 'flex',
          'flex-direction': 'column',
          padding: '16px',
          gap: '16px',
          'user-select': 'none',
        }}
      >
        <div
          style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between' }}
        >
          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', padding: '0 2px' }}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 56 56"
              fill="none"
              style={{
                'flex-shrink': '0',
                filter: 'drop-shadow(0 0 3px color-mix(in srgb, var(--accent) 60%, transparent))',
              }}
            >
              <defs>
                <linearGradient id="mc-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="var(--accent)" />
                  <stop offset="100%" stop-color="#b05cff" />
                </linearGradient>
              </defs>
              <g stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="14,16 4,28 14,40" stroke="var(--accent)" />
                <polyline points="42,16 52,28 42,40" stroke="#b05cff" />
                <polyline points="18,40 18,16 28,30 38,16 38,40" stroke="url(#mc-grad)" />
              </g>
            </svg>
            <span
              style={{
                'font-size': sf(14),
                'font-weight': '600',
                color: theme.fg,
                'font-family': "'JetBrains Mono', monospace",
              }}
            >
              MouriCode
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <IconButton
              icon={
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 2.25a.75.75 0 0 1 .73.56l.2.72a4.48 4.48 0 0 1 1.04.43l.66-.37a.75.75 0 0 1 .9.13l.75.75a.75.75 0 0 1 .13.9l-.37.66c.17.33.31.68.43 1.04l.72.2a.75.75 0 0 1 .56.73v1.06a.75.75 0 0 1-.56.73l-.72.2a4.48 4.48 0 0 1-.43 1.04l.37.66a.75.75 0 0 1-.13.9l-.75.75a.75.75 0 0 1-.9.13l-.66-.37a4.48 4.48 0 0 1-1.04.43l-.2.72a.75.75 0 0 1-.73.56H6.94a.75.75 0 0 1-.73-.56l-.2-.72a4.48 4.48 0 0 1-1.04-.43l-.66.37a.75.75 0 0 1-.9-.13l-.75-.75a.75.75 0 0 1-.13-.9l.37-.66a4.48 4.48 0 0 1-.43-1.04l-.72-.2a.75.75 0 0 1-.56-.73V7.47a.75.75 0 0 1 .56-.73l.72-.2c.11-.36.26-.71.43-1.04l-.37-.66a.75.75 0 0 1 .13-.9l.75-.75a.75.75 0 0 1 .9-.13l.66.37c.33-.17.68-.31 1.04-.43l.2-.72a.75.75 0 0 1 .73-.56H8Zm-.53 3.22a2.5 2.5 0 1 0 1.06 4.88 2.5 2.5 0 0 0-1.06-4.88Z" />
                </svg>
              }
              onClick={() => toggleSettingsDialog(true)}
              title={`设置 (${mod}+,)`}
            />
            <IconButton
              icon={
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M9.78 12.78a.75.75 0 0 1-1.06 0L4.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L6.06 8l3.72 3.72a.75.75 0 0 1 0 1.06Z" />
                </svg>
              }
              onClick={() => toggleSidebar()}
              title={`收起侧边栏 (${mod}+B)`}
            />
          </div>
        </div>

        {/* Projects section */}
        <div
          style={{
            display: 'flex',
            'flex-direction': 'column',
            gap: '6px',
            flex: '1',
            'min-height': '0',
          }}
        >
          <div
            style={{
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'space-between',
              padding: '0 2px',
            }}
          >
            <label
              style={{
                'font-size': sf(11),
                color: theme.fgMuted,
                'text-transform': 'uppercase',
                'letter-spacing': '0.05em',
              }}
            >
              项目
            </label>
            <IconButton
              icon={
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z" />
                </svg>
              }
              onClick={() => handleAddProject()}
              title="添加项目"
              size="sm"
            />
          </div>
          <div
            ref={taskListRef}
            tabIndex={0}
            onKeyDown={(e) => {
              if (!store.sidebarFocused) return;
              if (e.key === 'Enter') {
                e.preventDefault();
                const focusedProjectId = store.sidebarFocusedProjectId;
                if (focusedProjectId) {
                  const project = store.projects.find((p) => p.id === focusedProjectId);
                  if (project) setEditingProject(project);
                  return;
                }
                const taskId = store.sidebarFocusedTaskId;
                if (taskId) {
                  setActiveTask(taskId);
                  unfocusSidebar();
                  setTaskFocusedPanel(taskId, getTaskFocusedPanel(taskId));
                }
              }
            }}
            style={{
              display: 'flex',
              'flex-direction': 'column',
              gap: '8px',
              flex: '1',
              overflow: 'auto',
              outline: 'none',
              'padding-right': '2px',
            }}
          >
            <For each={store.projects}>
              {(project) => {
                const projectTasks = () => groupedTasks().grouped[project.id] ?? [];
                return (
                  <div
                    data-project-id={project.id}
                    style={{ display: 'flex', 'flex-direction': 'column' }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setEditingProject(project)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setEditingProject(project);
                      }}
                      style={{
                        display: 'flex',
                        'align-items': 'center',
                        gap: '6px',
                        padding: '6px',
                        'border-radius': '6px',
                        background: theme.bgInput,
                        'font-size': sf(11),
                        cursor: 'pointer',
                        border:
                          store.sidebarFocused && store.sidebarFocusedProjectId === project.id
                            ? `1.5px solid var(--border-focus)`
                            : '1.5px solid transparent',
                      }}
                    >
                      <div
                        style={{
                          width: '8px',
                          height: '8px',
                          'border-radius': '50%',
                          background: project.color,
                          'flex-shrink': '0',
                        }}
                      />
                      <div style={{ flex: '1', 'min-width': '0', overflow: 'hidden' }}>
                        <div
                          style={{
                            color: theme.fg,
                            'font-weight': '500',
                            'white-space': 'nowrap',
                            overflow: 'hidden',
                            'text-overflow': 'ellipsis',
                          }}
                        >
                          {project.name}
                        </div>
                        <div
                          style={{
                            color: theme.fgSubtle,
                            'font-size': sf(10),
                            'white-space': 'nowrap',
                            overflow: 'hidden',
                            'text-overflow': 'ellipsis',
                          }}
                        >
                          {abbreviatePath(project.path)}
                        </div>
                      </div>
                      <span
                        style={{
                          'font-size': sf(10),
                          color: theme.fgSubtle,
                          padding: '0 2px',
                          'flex-shrink': '0',
                        }}
                        title={`${projectTasks().length} 个任务`}
                      >
                        {projectTasks().length}
                      </span>
                      <div
                        data-project-menu-id={project.id}
                        style={{ position: 'relative', display: 'inline-flex', 'flex-shrink': '0' }}
                      >
                        <button
                          class="icon-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setProjectMenuId((id) => (id === project.id ? null : project.id));
                          }}
                          title="更多操作"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: theme.fgSubtle,
                            cursor: 'pointer',
                            padding: '2px 4px',
                            'line-height': '1',
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 3.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
                          </svg>
                        </button>
                        <Show when={projectMenuId() === project.id}>
                          <div
                            style={{
                              position: 'absolute',
                              top: 'calc(100% + 4px)',
                              right: '0',
                              background: theme.bgElevated,
                              border: `1px solid ${theme.border}`,
                              'border-radius': '8px',
                              padding: '4px',
                              'min-width': '140px',
                              'z-index': '20',
                              'box-shadow': '0 10px 30px rgba(0,0,0,0.35)',
                              display: 'flex',
                              'flex-direction': 'column',
                              gap: '2px',
                            }}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setProjectMenuId(null);
                                openNewTaskDialogForProject(project.id);
                              }}
                              style={projectMenuButtonStyle()}
                            >
                              新建任务
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setProjectMenuId(null);
                                handleRemoveProject(project.id);
                              }}
                              style={projectMenuDangerButtonStyle()}
                            >
                              关闭项目
                            </button>
                          </div>
                        </Show>
                      </div>
                    </div>
                    <Show
                      when={projectTasks().length > 0}
                      fallback={
                        <span
                          style={{
                            color: theme.fgSubtle,
                            'font-size': sf(10),
                            padding: '4px 10px',
                          }}
                        >
                          暂无任务
                        </span>
                      }
                    >
                      <div
                        style={{
                          display: 'flex',
                          'flex-direction': 'column',
                          gap: '1px',
                          padding: '3px 0 0 10px',
                        }}
                      >
                        <For each={projectTasks()}>
                          {(taskId) => (
                            <TaskRow
                              taskId={taskId}
                              globalIndex={globalIndex}
                              dragFromIndex={dragFromIndex}
                              dropTargetIndex={dropTargetIndex}
                              nested
                            />
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>

            <Show when={store.projects.length === 0}>
              <span style={{ 'font-size': sf(10), color: theme.fgSubtle, padding: '0 2px' }}>
                还没有关联项目。
              </span>
            </Show>

            <Show when={groupedTasks().orphaned.length > 0}>
              <span
                style={{
                  'font-size': sf(10),
                  color: theme.fgSubtle,
                  'text-transform': 'uppercase',
                  'letter-spacing': '0.05em',
                  'margin-top': '8px',
                  'margin-bottom': '2px',
                  padding: '0 2px',
                }}
              >
                其他任务
              </span>
              <For each={groupedTasks().orphaned}>
                {(taskId) => (
                  <TaskRow
                    taskId={taskId}
                    globalIndex={globalIndex}
                    dragFromIndex={dragFromIndex}
                    dropTargetIndex={dropTargetIndex}
                  />
                )}
              </For>
            </Show>

            <Show when={dropTargetIndex() === store.taskOrder.length}>
              <div class="drop-indicator" />
            </Show>
          </div>
        </div>

        {/* Connect / Disconnect Phone button */}
        <GlobalAssistantCard />

        {(() => {
          const connected = () =>
            store.remoteAccess.enabled && store.remoteAccess.connectedClients > 0;
          const accent = () => (connected() ? theme.error : theme.fgMuted);
          return (
            <button
              onClick={() => (connected() ? stopRemoteAccess() : setShowConnectPhone(true))}
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '8px',
                padding: '8px 12px',
                margin: '4px 8px',
                background: 'transparent',
                border: `1px solid ${connected() ? theme.error : theme.border}`,
                'border-radius': '8px',
                color: accent(),
                'font-size': sf(12),
                cursor: 'pointer',
                'flex-shrink': '0',
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={accent()}
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
              {connected() ? '断开手机连接' : '连接手机'}
            </button>
          );
        })()}

        <SidebarFooter />

        <ConnectPhoneModal open={showConnectPhone()} onClose={() => setShowConnectPhone(false)} />

        {/* Edit project dialog */}
        <EditProjectDialog project={editingProject()} onClose={() => setEditingProject(null)} />

        {/* Confirm remove project dialog */}
        <ConfirmDialog
          open={confirmRemove() !== null}
          title="移除项目？"
          message={`该项目当前有 ${
            store.taskOrder.filter((tid) => store.tasks[tid]?.projectId === confirmRemove()).length
          } 个进行中的任务。移除该项目会同时关闭这些任务，并删除对应的工作树和分支。`}
          confirmLabel="全部移除"
          danger
          onConfirm={() => {
            const id = confirmRemove();
            if (id) removeProjectWithTasks(id);
            setConfirmRemove(null);
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      </div>
      {/* Resize handle */}
      <div
        class={`resize-handle resize-handle-h${resizing() ? ' dragging' : ''}`}
        onMouseDown={handleResizeMouseDown}
      />
    </div>
  );
}

interface TaskRowProps {
  taskId: string;
  globalIndex: (taskId: string) => number;
  dragFromIndex: () => number | null;
  dropTargetIndex: () => number | null;
  nested?: boolean;
}

function TaskRow(props: TaskRowProps) {
  const task = () => store.tasks[props.taskId];
  const idx = () => props.globalIndex(props.taskId);
  const taskStatusLabel = () =>
    task()?.agentIds.some((id) => store.agents[id]?.status === 'running') ? '执行中' : '已完成';
  return (
    <Show when={task()}>
      {(t) => (
        <>
          <Show when={props.dropTargetIndex() === idx()}>
            <div class="drop-indicator" />
          </Show>
          <div
            class={`task-item${t().closingStatus === 'removing' ? ' task-item-removing' : ' task-item-appearing'}`}
            data-task-index={idx()}
            onClick={() => {
              setActiveTask(props.taskId);
              focusSidebar();
            }}
            style={{
              padding: props.nested ? '6px 10px' : '7px 10px',
              'border-radius': '6px',
              background:
                store.activeTaskId === props.taskId
                  ? `color-mix(in srgb, ${theme.accent} 10%, transparent)`
                  : 'transparent',
              color: store.activeTaskId === props.taskId ? theme.fg : theme.fgMuted,
              'font-size': sf(12),
              'font-weight': store.activeTaskId === props.taskId ? '500' : '400',
              cursor: props.dragFromIndex() !== null ? 'grabbing' : 'pointer',
              'white-space': 'nowrap',
              overflow: 'hidden',
              'text-overflow': 'ellipsis',
              opacity: props.dragFromIndex() === idx() ? '0.4' : '1',
              display: 'flex',
              'align-items': 'center',
              gap: '6px',
              border:
                store.sidebarFocused && store.sidebarFocusedTaskId === props.taskId
                  ? `1.5px solid var(--border-focus)`
                  : '1.5px solid transparent',
            }}
          >
            <StatusDot status={getTaskDotStatus(props.taskId)} size="sm" />
            <Show when={t().directMode}>
              <span
                style={{
                  'font-size': sf(10),
                  'font-weight': '600',
                  padding: '1px 5px',
                  'border-radius': '3px',
                  background: `color-mix(in srgb, ${theme.warning} 12%, transparent)`,
                  color: theme.warning,
                  'flex-shrink': '0',
                  'line-height': '1.5',
                }}
              >
                {t().branchName}
              </span>
            </Show>
            <span style={{ overflow: 'hidden', 'text-overflow': 'ellipsis' }}>{t().name}</span>
            <span
              style={{
                'margin-left': 'auto',
                'font-size': sf(10),
                'font-weight': '500',
                color: taskStatusLabel() === '执行中' ? theme.accent : theme.fgSubtle,
                'flex-shrink': '0',
              }}
            >
              {taskStatusLabel()}
            </span>
          </div>
        </>
      )}
    </Show>
  );
}
