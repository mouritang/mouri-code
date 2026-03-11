import { createSignal, createEffect, For, Show, onCleanup } from 'solid-js';
import { Dialog } from './Dialog';
import { invoke } from '../lib/ipc';
import { IPC } from '../../electron/ipc/channels';
import {
  store,
  createTask,
  createDirectTask,
  toggleNewTaskDialog,
  loadAgents,
  getProjectPath,
  getProject,
  getProjectBranchPrefix,
  updateProject,
  getGitHubDropDefaults,
} from '../store/store';
import { toBranchName, sanitizeBranchPrefix } from '../lib/branch-name';
import { theme } from '../lib/theme';
import type { AgentDef } from '../ipc/types';

interface NewTaskDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewTaskDialog(props: NewTaskDialogProps) {
  const [name, setName] = createSignal('');
  const [selectedAgent, setSelectedAgent] = createSignal<AgentDef | null>(null);
  const [selectedProjectId, setSelectedProjectId] = createSignal<string | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = createSignal(false);
  const [highlightedProjectIndex, setHighlightedProjectIndex] = createSignal(-1);
  const [error, setError] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [ignoredDirs, setIgnoredDirs] = createSignal<string[]>([]);
  const [selectedDirs, setSelectedDirs] = createSignal<Set<string>>(new Set());
  const [directMode, setDirectMode] = createSignal(true);
  const [skipPermissions, setSkipPermissions] = createSignal(false);
  const [branchPrefix, setBranchPrefix] = createSignal('');
  let projectMenuRef!: HTMLDivElement;
  let nameRef!: HTMLInputElement;
  let formRef!: HTMLFormElement;

  const handleProjectMenuKeyDown = (e: KeyboardEvent) => {
    const projects = store.projects;
    if (!projects.length) return;

    if (!projectMenuOpen()) {
      // Open on ArrowDown/ArrowUp/Enter/Space
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const currentIdx = projects.findIndex((p) => p.id === selectedProjectId());
        setHighlightedProjectIndex(currentIdx >= 0 ? currentIdx : 0);
        setProjectMenuOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        setHighlightedProjectIndex((i) => (i < projects.length - 1 ? i + 1 : 0));
        scrollHighlightedIntoView();
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setHighlightedProjectIndex((i) => (i > 0 ? i - 1 : projects.length - 1));
        scrollHighlightedIntoView();
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const idx = highlightedProjectIndex();
        if (idx >= 0 && idx < projects.length) {
          setSelectedProjectId(projects[idx].id);
        }
        setProjectMenuOpen(false);
        break;
      }
      case 'Escape': {
        e.preventDefault();
        setProjectMenuOpen(false);
        break;
      }
      case 'Home': {
        e.preventDefault();
        setHighlightedProjectIndex(0);
        scrollHighlightedIntoView();
        break;
      }
      case 'End': {
        e.preventDefault();
        setHighlightedProjectIndex(projects.length - 1);
        scrollHighlightedIntoView();
        break;
      }
    }
  };

  function scrollHighlightedIntoView() {
    requestAnimationFrame(() => {
      projectMenuRef
        ?.querySelector('.new-task-project-option.highlighted')
        ?.scrollIntoView({ block: 'nearest' });
    });
  }

  const focusableSelector =
    'textarea:not(:disabled), input:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"])';

  function navigateDialogFields(direction: 'up' | 'down'): void {
    if (!formRef) return;
    const sections = Array.from(formRef.querySelectorAll<HTMLElement>('[data-nav-field]'));
    if (sections.length === 0) return;

    const active = document.activeElement as HTMLElement | null;
    const currentIdx = active ? sections.findIndex((s) => s.contains(active)) : -1;

    let nextIdx: number;
    if (currentIdx === -1) {
      nextIdx = direction === 'down' ? 0 : sections.length - 1;
    } else if (direction === 'down') {
      nextIdx = (currentIdx + 1) % sections.length;
    } else {
      nextIdx = (currentIdx - 1 + sections.length) % sections.length;
    }

    const target = sections[nextIdx];
    const focusable = target.querySelector<HTMLElement>(focusableSelector);
    focusable?.focus();
  }

  function navigateWithinField(direction: 'left' | 'right'): void {
    if (!formRef) return;
    const active = document.activeElement as HTMLElement | null;
    if (!active) return;

    const section = active.closest<HTMLElement>('[data-nav-field]');
    if (!section) return;

    const focusables = Array.from(section.querySelectorAll<HTMLElement>(focusableSelector));
    if (focusables.length <= 1) return;

    const idx = focusables.indexOf(active);
    if (idx === -1) return;

    let nextIdx: number;
    if (direction === 'right') {
      nextIdx = (idx + 1) % focusables.length;
    } else {
      nextIdx = (idx - 1 + focusables.length) % focusables.length;
    }
    focusables[nextIdx].focus();
  }

  // Initialize state each time the dialog opens
  createEffect(() => {
    if (!props.open) return;

    // Reset signals for a fresh dialog
    setName('');
    setError('');
    setLoading(false);
    setProjectMenuOpen(false);
    setDirectMode(true);
    setSkipPermissions(false);

    void (async () => {
      await loadAgents();
      const lastAgent = store.lastAgentId
        ? (store.availableAgents.find((a) => a.id === store.lastAgentId) ?? null)
        : null;
      setSelectedAgent(lastAgent ?? store.availableAgents[0] ?? null);

      // Pre-fill from drop data if present
      const dropUrl = store.newTaskDropUrl;
      const fallbackProjectId = store.lastProjectId ?? store.projects[0]?.id ?? null;
      const defaults = dropUrl ? getGitHubDropDefaults(dropUrl) : null;

      if (defaults) setName(defaults.name);
      setSelectedProjectId(defaults?.projectId ?? fallbackProjectId);

      nameRef?.focus();
    })();

    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (!projectMenuRef) return;
      if (!projectMenuRef.contains(event.target as Node)) {
        setProjectMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleOutsidePointerDown);

    // Capture-phase handler for Alt+Arrow to navigate form sections / within fields
    const handleAltArrow = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopImmediatePropagation();
        navigateDialogFields(e.key === 'ArrowDown' ? 'down' : 'up');
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // Preserve native word-jump (Alt+Arrow) in text inputs
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        e.stopImmediatePropagation();
        navigateWithinField(e.key === 'ArrowRight' ? 'right' : 'left');
      }
    };
    window.addEventListener('keydown', handleAltArrow, true);

    onCleanup(() => {
      window.removeEventListener('pointerdown', handleOutsidePointerDown);
      window.removeEventListener('keydown', handleAltArrow, true);
    });
  });

  // Fetch gitignored dirs when project changes
  createEffect(() => {
    const pid = selectedProjectId();
    const path = pid ? getProjectPath(pid) : undefined;
    let cancelled = false;

    if (!path) {
      setIgnoredDirs([]);
      setSelectedDirs(new Set<string>());
      return;
    }

    void (async () => {
      try {
        const dirs = await invoke<string[]>(IPC.GetGitignoredDirs, { projectRoot: path });
        if (cancelled) return;
        setIgnoredDirs(dirs);
        setSelectedDirs(new Set(dirs)); // all checked by default
      } catch {
        if (cancelled) return;
        setIgnoredDirs([]);
        setSelectedDirs(new Set<string>());
      }
    })();

    onCleanup(() => {
      cancelled = true;
    });
  });

  // Sync branch prefix when project changes
  createEffect(() => {
    const pid = selectedProjectId();
    setBranchPrefix(pid ? getProjectBranchPrefix(pid) : 'task');
  });

  const effectiveName = () => {
    return name().trim();
  };

  const branchPreview = () => {
    const n = effectiveName();
    const prefix = sanitizeBranchPrefix(branchPrefix());
    if (!n) return '';
    return `${prefix}/${toBranchName(n) || 'task-auto'}`;
  };

  const selectedProjectPath = () => {
    const pid = selectedProjectId();
    return pid ? getProjectPath(pid) : undefined;
  };

  const selectedProject = () => {
    const pid = selectedProjectId();
    return pid ? getProject(pid) : undefined;
  };

  const agentSupportsSkipPermissions = () => {
    const agent = selectedAgent();
    return !!agent?.skip_permissions_args?.length;
  };

  const canSubmit = () => {
    const hasContent = !!effectiveName();
    return hasContent && !!selectedProjectId() && !loading();
  };

  async function handleSubmit(e: Event) {
    e.preventDefault();
    const n = effectiveName();
    if (!n) return;

    const agent = selectedAgent();
    if (!agent) {
      setError('请选择智能体');
      return;
    }

    const projectId = selectedProjectId();
    if (!projectId) {
      setError('请选择项目');
      return;
    }

    setLoading(true);
    setError('');

    const prefix = sanitizeBranchPrefix(branchPrefix());
    const ghUrl = store.newTaskDropUrl ?? undefined;
    try {
      // Persist the branch prefix to the project for next time
      updateProject(projectId, { branchPrefix: prefix });

      if (directMode()) {
        const projectPath = getProjectPath(projectId);
        if (!projectPath) {
          setError('未找到项目路径');
          return;
        }
        const currentBranch = await invoke<string>(IPC.GetCurrentBranch, {
          projectRoot: projectPath,
        });
        await createDirectTask(
          n,
          agent,
          projectId,
          currentBranch,
          undefined,
          ghUrl,
          agentSupportsSkipPermissions() && skipPermissions(),
        );
      } else {
        await createTask(
          n,
          agent,
          projectId,
          [...selectedDirs()],
          undefined,
          prefix,
          ghUrl,
          agentSupportsSkipPermissions() && skipPermissions(),
        );
      }
      toggleNewTaskDialog(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={props.open} onClose={props.onClose} width="420px" panelStyle={{ gap: '20px' }}>
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          'flex-direction': 'column',
          gap: '20px',
        }}
      >
        <div>
          <h2
            style={{
              margin: '0 0 6px',
              'font-size': '16px',
              color: theme.fg,
              'font-weight': '600',
            }}
          >
            新建任务
          </h2>
          <Show when={directMode()}>
            <p
              style={{
                margin: '0',
                'font-size': '12px',
                color: theme.fgMuted,
                'line-height': '1.5',
              }}
            >
              智能体会在项目根目录直接操作你当前所在分支。
            </p>
          </Show>
        </div>

        <div
          data-nav-field="task-name"
          style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}
        >
          <label
            style={{
              'font-size': '11px',
              color: theme.fgMuted,
              'text-transform': 'uppercase',
              'letter-spacing': '0.05em',
            }}
          >
            任务名称
          </label>
          <input
            ref={nameRef}
            class="input-field"
            type="text"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder={
              store.newTaskDropUrl ? '任务名称（已从链接自动填充）' : '例如：添加用户认证'
            }
            style={{
              background: theme.bgInput,
              border: `1px solid ${theme.border}`,
              'border-radius': '8px',
              padding: '10px 14px',
              color: theme.fg,
              'font-size': '13px',
              outline: 'none',
            }}
          />
          <Show when={directMode() && selectedProjectPath()}>
            <div
              style={{
                'font-size': '11px',
                'font-family': "'JetBrains Mono', monospace",
                color: theme.fgSubtle,
                display: 'flex',
                'flex-direction': 'column',
                gap: '2px',
                padding: '4px 2px 0',
              }}
            >
              <span style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  style={{ 'flex-shrink': '0' }}
                >
                  <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm6.25 7.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 7.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm0 0h5.5a2.5 2.5 0 0 0 2.5-2.5v-.5a.75.75 0 0 0-1.5 0v.5a1 1 0 0 1-1 1H5a3.25 3.25 0 1 0 0 6.5h6.25a.75.75 0 0 0 0-1.5H5a1.75 1.75 0 1 1 0-3.5Z" />
                </svg>
                当前分支（创建时检测）
              </span>
              <span style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  style={{ 'flex-shrink': '0' }}
                >
                  <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z" />
                </svg>
                {selectedProjectPath()}
              </span>
            </div>
          </Show>
        </div>

        <Show when={!directMode()}>
          <div
            data-nav-field="branch-prefix"
            style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}
          >
            <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
              <label
                style={{ 'font-size': '11px', color: theme.fgSubtle, 'white-space': 'nowrap' }}
              >
                分支前缀
              </label>
              <input
                class="input-field"
                type="text"
                value={branchPrefix()}
                onInput={(e) => setBranchPrefix(e.currentTarget.value)}
                placeholder="task"
                style={{
                  background: theme.bgInput,
                  border: `1px solid ${theme.border}`,
                  'border-radius': '6px',
                  padding: '4px 8px',
                  color: theme.fg,
                  'font-size': '12px',
                  'font-family': "'JetBrains Mono', monospace",
                  outline: 'none',
                  width: '120px',
                }}
              />
            </div>
            <Show when={branchPreview() && selectedProjectPath()}>
              <div
                style={{
                  'font-size': '11px',
                  'font-family': "'JetBrains Mono', monospace",
                  color: theme.fgSubtle,
                  display: 'flex',
                  'flex-direction': 'column',
                  gap: '2px',
                  padding: '4px 2px 0',
                }}
              >
                <span style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    style={{ 'flex-shrink': '0' }}
                  >
                    <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm6.25 7.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 7.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm0 0h5.5a2.5 2.5 0 0 0 2.5-2.5v-.5a.75.75 0 0 0-1.5 0v.5a1 1 0 0 1-1 1H5a3.25 3.25 0 1 0 0 6.5h6.25a.75.75 0 0 0 0-1.5H5a1.75 1.75 0 1 1 0-3.5Z" />
                  </svg>
                  {branchPreview()}
                </span>
                <span style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    style={{ 'flex-shrink': '0' }}
                  >
                    <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z" />
                  </svg>
                  {selectedProjectPath()}/.worktrees/{branchPreview()}
                </span>
              </div>
            </Show>
          </div>
        </Show>

        {/* Project selector */}
        <div
          data-nav-field="project"
          style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}
        >
          <label
            style={{
              'font-size': '11px',
              color: theme.fgMuted,
              'text-transform': 'uppercase',
              'letter-spacing': '0.05em',
            }}
          >
            项目
          </label>
          <div
            ref={projectMenuRef}
            style={{ position: 'relative', display: 'flex', 'align-items': 'center' }}
          >
            <button
              type="button"
              class="new-task-project-trigger"
              role="combobox"
              aria-expanded={projectMenuOpen()}
              aria-haspopup="listbox"
              onClick={() => setProjectMenuOpen((open) => !open)}
              onKeyDown={handleProjectMenuKeyDown}
              style={{
                width: '100%',
                background: 'transparent',
                border: `1px solid ${theme.border}`,
                'border-radius': '8px',
                padding: '10px 34px 10px 12px',
                color: theme.fg,
                'font-size': '13px',
                outline: 'none',
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'space-between',
                gap: '10px',
                cursor: 'pointer',
                'text-align': 'left',
              }}
            >
              <span
                style={{
                  display: 'flex',
                  'align-items': 'center',
                  gap: '8px',
                  overflow: 'hidden',
                  'min-width': '0',
                }}
              >
                <Show when={selectedProject()}>
                  {(project) => (
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        'border-radius': '50%',
                        background: project().color,
                        'flex-shrink': '0',
                      }}
                    />
                  )}
                </Show>
                <span
                  style={{
                    overflow: 'hidden',
                    'text-overflow': 'ellipsis',
                    'white-space': 'nowrap',
                  }}
                >
                  {(() => {
                    const p = selectedProject();
                    return p ? `${p.name} — ${p.path}` : '选择项目';
                  })()}
                </span>
              </span>
              <svg
                width="10"
                height="10"
                viewBox="0 0 16 16"
                fill="none"
                style={{
                  color: theme.fgMuted,
                  'flex-shrink': '0',
                  transform: projectMenuOpen() ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.14s ease',
                }}
                aria-hidden="true"
              >
                <path
                  d="M3.5 6.5 8 11l4.5-4.5"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>

            <Show when={projectMenuOpen()}>
              <div
                role="listbox"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: '0',
                  right: '0',
                  background: theme.bgElevated,
                  border: `1px solid ${theme.border}`,
                  'border-radius': '8px',
                  'box-shadow': '0 12px 30px rgba(0,0,0,0.4)',
                  padding: '4px',
                  'z-index': '20',
                  'max-height': '180px',
                  overflow: 'auto',
                }}
              >
                <For each={store.projects}>
                  {(project, index) => {
                    const isSelected = () => selectedProjectId() === project.id;
                    const isHighlighted = () => highlightedProjectIndex() === index();
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected()}
                        class={`new-task-project-option${isSelected() ? ' selected' : ''}${isHighlighted() ? ' highlighted' : ''}`}
                        onClick={() => {
                          setSelectedProjectId(project.id);
                          setProjectMenuOpen(false);
                        }}
                        onPointerEnter={() => setHighlightedProjectIndex(index())}
                        style={{
                          width: '100%',
                          border: `1px solid ${isSelected() ? 'color-mix(in srgb, var(--accent) 70%, transparent)' : 'transparent'}`,
                          'border-radius': '6px',
                          padding: '8px 10px',
                          display: 'flex',
                          'align-items': 'center',
                          gap: '8px',
                          background: isHighlighted()
                            ? isSelected()
                              ? 'color-mix(in srgb, var(--accent) 16%, transparent)'
                              : 'color-mix(in srgb, var(--accent) 8%, transparent)'
                            : isSelected()
                              ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                              : 'transparent',
                          color: theme.fg,
                          cursor: 'pointer',
                          'text-align': 'left',
                          'font-size': '12px',
                        }}
                      >
                        <span
                          style={{
                            width: '9px',
                            height: '9px',
                            'border-radius': '50%',
                            background: project.color,
                            'flex-shrink': '0',
                          }}
                        />
                        <span
                          style={{
                            overflow: 'hidden',
                            'text-overflow': 'ellipsis',
                            'white-space': 'nowrap',
                          }}
                        >
                          {project.name} — {project.path}
                        </span>
                      </button>
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>
        </div>

        <div
          data-nav-field="agent"
          style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}
        >
          <label
            style={{
              'font-size': '11px',
              color: theme.fgMuted,
              'text-transform': 'uppercase',
              'letter-spacing': '0.05em',
            }}
          >
            智能体
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <For each={store.availableAgents}>
              {(agent) => {
                const isSelected = () => selectedAgent()?.id === agent.id;
                return (
                  <button
                    type="button"
                    class={`agent-btn ${isSelected() ? 'selected' : ''}`}
                    onClick={() => setSelectedAgent(agent)}
                    style={{
                      flex: '1',
                      padding: '10px 8px',
                      background: isSelected() ? theme.bgSelected : theme.bgInput,
                      border: isSelected()
                        ? `1px solid ${theme.accent}`
                        : `1px solid ${theme.border}`,
                      'border-radius': '8px',
                      color: isSelected()
                        ? store.themePreset === 'dark'
                          ? '#ffffff'
                          : theme.accentText
                        : theme.fg,
                      cursor: 'pointer',
                      'font-size': '12px',
                      'font-weight': isSelected() ? '500' : '400',
                      'text-align': 'center',
                    }}
                  >
                    {agent.name}
                  </button>
                );
              }}
            </For>
          </div>
        </div>

        {/* Direct mode toggle */}
        <div
          data-nav-field="direct-mode"
          style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}
        >
          <label
            style={{
              display: 'flex',
              'align-items': 'center',
              gap: '8px',
              'font-size': '12px',
              color: theme.fg,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={directMode()}
              onChange={(e) => setDirectMode(e.currentTarget.checked)}
              style={{ 'accent-color': theme.accent, cursor: 'inherit' }}
            />
            直接在当前分支上工作
          </label>
          <Show when={directMode()}>
            <div
              style={{
                'font-size': '12px',
                color: theme.warning,
                background: `color-mix(in srgb, ${theme.warning} 8%, transparent)`,
                padding: '8px 12px',
                'border-radius': '8px',
                border: `1px solid color-mix(in srgb, ${theme.warning} 20%, transparent)`,
              }}
            >
              改动将直接作用于当前分支，不会使用工作树隔离。
            </div>
          </Show>
        </div>

        {/* Skip permissions toggle */}
        <Show when={agentSupportsSkipPermissions()}>
          <div
            data-nav-field="skip-permissions"
            style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}
          >
            <label
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '8px',
                'font-size': '12px',
                color: theme.fg,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={skipPermissions()}
                onChange={(e) => setSkipPermissions(e.currentTarget.checked)}
                style={{ 'accent-color': theme.accent, cursor: 'inherit' }}
              />
              危险模式：跳过所有确认
            </label>
            <Show when={skipPermissions()}>
              <div
                style={{
                  'font-size': '12px',
                  color: theme.warning,
                  background: `color-mix(in srgb, ${theme.warning} 8%, transparent)`,
                  padding: '8px 12px',
                  'border-radius': '8px',
                  border: `1px solid color-mix(in srgb, ${theme.warning} 20%, transparent)`,
                }}
              >
                智能体将不再请求确认。它可以在未经你批准的情况下读取、写入、删除文件并执行命令。
              </div>
            </Show>
          </div>
        </Show>

        <Show when={ignoredDirs().length > 0 && !directMode()}>
          <div
            data-nav-field="symlink-dirs"
            style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}
          >
            <label
              style={{
                'font-size': '11px',
                color: theme.fgMuted,
                'text-transform': 'uppercase',
                'letter-spacing': '0.05em',
              }}
            >
              链接到工作树
            </label>
            <div
              style={{
                display: 'flex',
                'flex-direction': 'column',
                gap: '4px',
                padding: '8px 10px',
                background: theme.bgElevated,
                'border-radius': '6px',
                border: `1px solid ${theme.border}`,
              }}
            >
              <For each={ignoredDirs()}>
                {(dir) => {
                  const checked = () => selectedDirs().has(dir);
                  const toggle = () => {
                    const next = new Set(selectedDirs());
                    if (next.has(dir)) next.delete(dir);
                    else next.add(dir);
                    setSelectedDirs(next);
                  };
                  return (
                    <label
                      style={{
                        display: 'flex',
                        'align-items': 'center',
                        gap: '8px',
                        'font-size': '12px',
                        'font-family': "'JetBrains Mono', monospace",
                        color: theme.fg,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked()}
                        onChange={toggle}
                        style={{ 'accent-color': theme.accent }}
                      />
                      {dir}/
                    </label>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>

        <Show when={error()}>
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
            {error()}
          </div>
        </Show>

        <div
          data-nav-field="footer"
          style={{
            display: 'flex',
            gap: '8px',
            'justify-content': 'flex-end',
            'padding-top': '4px',
          }}
        >
          <button
            type="button"
            class="btn-secondary"
            onClick={() => props.onClose()}
            style={{
              padding: '9px 18px',
              background: theme.bgInput,
              border: `1px solid ${theme.border}`,
              'border-radius': '8px',
              color: theme.fgMuted,
              cursor: 'pointer',
              'font-size': '13px',
            }}
          >
            取消
          </button>
          <button
            type="submit"
            class="btn-primary"
            disabled={!canSubmit()}
            style={{
              padding: '9px 20px',
              background: theme.accent,
              border: 'none',
              'border-radius': '8px',
              color: theme.accentText,
              cursor: 'pointer',
              'font-size': '13px',
              'font-weight': '500',
              opacity: !canSubmit() ? '0.4' : '1',
              display: 'inline-flex',
              'align-items': 'center',
              gap: '8px',
            }}
          >
            <Show when={loading()}>
              <span class="inline-spinner" aria-hidden="true" />
            </Show>
            {loading() ? '创建中...' : '创建任务'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
