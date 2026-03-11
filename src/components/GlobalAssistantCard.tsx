import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';
import {
  store,
  runGlobalMonitorNow,
  sendGlobalMonitorPrompt,
  toggleSettingsDialog,
} from '../store/store';
import { theme } from '../lib/theme';
import { sf } from '../lib/fontScale';

function globalAssistantStatusLabel() {
  if (!store.globalMonitor.enabled) return '已关闭';
  switch (store.globalMonitor.status) {
    case 'running':
      return '汇报中';
    case 'error':
      return '异常';
    case 'idle':
      return '监控中';
    default:
      return '已关闭';
  }
}

function globalAssistantAccent() {
  if (!store.globalMonitor.enabled) return theme.fgMuted;
  switch (store.globalMonitor.status) {
    case 'running':
      return theme.accent;
    case 'error':
      return theme.error;
    default:
      return theme.success;
  }
}

function formatMonitorTime(iso: string | null): string {
  if (!iso) return '尚未汇报';
  return new Date(iso).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function taskStatusLabel(status: string): string {
  switch (status) {
    case 'blocked':
      return '阻塞';
    case 'waiting':
      return '等待中';
    case 'done':
      return '已完成';
    case 'coding':
      return '进行中';
    default:
      return '空闲';
  }
}

export function GlobalAssistantCard() {
  const [collapsed, setCollapsed] = createSignal(false);
  const [selectedTaskId, setSelectedTaskId] = createSignal('');
  const [draftPrompt, setDraftPrompt] = createSignal('');
  const [sending, setSending] = createSignal(false);

  const runningTasks = createMemo(() =>
    store.taskOrder
      .map((taskId) => store.tasks[taskId])
      .filter((task): task is NonNullable<typeof task> =>
        Boolean(task && task.agentIds.some((id) => store.agents[id]?.status === 'running')),
      )
      .map((task) => ({ id: task.id, name: task.name })),
  );

  createEffect(() => {
    const tasks = runningTasks();
    const current = selectedTaskId();
    if (tasks.length === 0) {
      if (current) setSelectedTaskId('');
      return;
    }
    if (!current || !tasks.some((task) => task.id === current)) {
      setSelectedTaskId(
        store.activeTaskId && tasks.some((task) => task.id === store.activeTaskId)
          ? store.activeTaskId
          : tasks[0].id,
      );
    }
  });

  async function handleSend(): Promise<void> {
    const taskId = selectedTaskId();
    const prompt = draftPrompt().trim();
    if (!taskId || !prompt || sending()) return;
    setSending(true);
    try {
      await sendGlobalMonitorPrompt(taskId, prompt);
      setDraftPrompt('');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        'flex-direction': 'column',
        gap: '8px',
        padding: '10px 12px',
        margin: '4px 8px',
        background: theme.bgInput,
        border: `1px solid ${theme.border}`,
        'border-radius': '10px',
        'flex-shrink': '0',
      }}
    >
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px', flex: 1 }}>
          <span style={{ 'font-size': sf(12), color: theme.fg }}>全局助理</span>
          <span style={{ 'font-size': sf(10), color: globalAssistantAccent() }}>
            {globalAssistantStatusLabel()} · {store.globalMonitor.activeTaskCount} 个活跃任务
          </span>
        </div>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '10px', 'flex-shrink': '0' }}>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.fgMuted,
              cursor: 'pointer',
              'font-size': sf(11),
              padding: '0',
            }}
            title={collapsed() ? '展开助理面板' : '折叠助理面板'}
          >
            {collapsed() ? '展开' : '收起'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!store.showSettingsDialog) toggleSettingsDialog(true);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.fgMuted,
              cursor: 'pointer',
              'font-size': sf(11),
              padding: '0',
            }}
            title="打开助理设置"
          >
            设置
          </button>
        </div>
      </div>

      <Show when={!collapsed()}>
        <div
          style={{
            display: 'flex',
            'flex-direction': 'column',
            gap: '10px',
            'max-height': 'min(52vh, 460px)',
            overflow: 'auto',
            'padding-right': '2px',
          }}
        >
          <span style={{ 'font-size': sf(11), color: theme.fgSubtle, 'line-height': '1.5' }}>
            {store.globalMonitor.lastSummary ??
              '点击“立即汇报”后，MiniMax 会汇总所有运行中任务的当前状态。'}
          </span>

          <Show when={store.globalMonitor.lastError}>
            <span style={{ 'font-size': sf(10), color: theme.error, 'line-height': '1.4' }}>
              {store.globalMonitor.lastError}
            </span>
          </Show>

          <Show when={store.globalMonitor.taskInsights.length > 0}>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
              <span
                style={{
                  'font-size': sf(10),
                  color: theme.fgMuted,
                  'text-transform': 'uppercase',
                  'letter-spacing': '0.05em',
                }}
              >
                任务状态
              </span>
              <For each={store.globalMonitor.taskInsights}>
                {(insight) => (
                  <button
                    type="button"
                    onClick={() => setSelectedTaskId(insight.taskId)}
                    style={{
                      padding: '8px',
                      background:
                        selectedTaskId() === insight.taskId ? theme.bgElevated : theme.bgInput,
                      border: `1px solid ${
                        selectedTaskId() === insight.taskId ? theme.accent : theme.border
                      }`,
                      'border-radius': '8px',
                      display: 'flex',
                      'flex-direction': 'column',
                      gap: '4px',
                      cursor: 'pointer',
                      'text-align': 'left',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        'justify-content': 'space-between',
                        gap: '8px',
                        'align-items': 'center',
                      }}
                    >
                      <span style={{ 'font-size': sf(10), color: theme.fg }}>
                        {insight.taskName}
                      </span>
                      <span style={{ 'font-size': sf(10), color: globalAssistantAccent() }}>
                        {taskStatusLabel(insight.status)}
                      </span>
                    </div>
                    <span
                      style={{ 'font-size': sf(10), color: theme.fgSubtle, 'line-height': '1.4' }}
                    >
                      {insight.detail}
                    </span>
                  </button>
                )}
              </For>
            </div>
          </Show>

          <Show when={store.globalMonitor.alerts.length > 0}>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
              <span
                style={{
                  'font-size': sf(10),
                  color: theme.fgMuted,
                  'text-transform': 'uppercase',
                  'letter-spacing': '0.05em',
                }}
              >
                风险提醒
              </span>
              <For each={store.globalMonitor.alerts.slice(0, 3)}>
                {(alert) => (
                  <div
                    style={{
                      padding: '6px 8px',
                      background: theme.bgElevated,
                      border: `1px solid ${theme.border}`,
                      'border-radius': '8px',
                      display: 'flex',
                      'flex-direction': 'column',
                      gap: '2px',
                    }}
                  >
                    <span style={{ 'font-size': sf(10), color: globalAssistantAccent() }}>
                      {alert.taskName}
                    </span>
                    <span style={{ 'font-size': sf(10), color: theme.fgSubtle }}>
                      {alert.issue}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
            <span
              style={{
                'font-size': sf(10),
                color: theme.fgMuted,
                'text-transform': 'uppercase',
                'letter-spacing': '0.05em',
              }}
            >
              发送指令
            </span>
            <select
              value={selectedTaskId()}
              onChange={(event) => setSelectedTaskId(event.currentTarget.value)}
              style={{
                width: '100%',
                background: theme.bgElevated,
                border: `1px solid ${theme.border}`,
                color: theme.fg,
                'border-radius': '8px',
                padding: '8px 10px',
                'font-size': sf(11),
              }}
            >
              <option value="">选择任务</option>
              <For each={runningTasks()}>
                {(task) => <option value={task.id}>{task.name}</option>}
              </For>
            </select>
            <textarea
              value={draftPrompt()}
              onInput={(event) => setDraftPrompt(event.currentTarget.value)}
              placeholder="输入要发送给所选任务终端 CLI 的指令"
              rows={3}
              style={{
                width: '100%',
                resize: 'vertical',
                background: theme.bgElevated,
                border: `1px solid ${theme.border}`,
                color: theme.fg,
                'border-radius': '8px',
                padding: '8px 10px',
                'font-size': sf(11),
                'box-sizing': 'border-box',
              }}
            />
            <div
              style={{
                display: 'flex',
                'justify-content': 'space-between',
                'align-items': 'center',
                gap: '8px',
              }}
            >
              <span style={{ 'font-size': sf(10), color: theme.fgMuted }}>
                上次汇报：{formatMonitorTime(store.globalMonitor.lastRunAt)}
              </span>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!selectedTaskId() || !draftPrompt().trim() || sending()}
                style={{
                  padding: '6px 10px',
                  background:
                    !selectedTaskId() || !draftPrompt().trim() || sending()
                      ? theme.bgElevated
                      : theme.accent,
                  border: `1px solid ${
                    !selectedTaskId() || !draftPrompt().trim() || sending()
                      ? theme.border
                      : theme.accent
                  }`,
                  'border-radius': '8px',
                  color:
                    !selectedTaskId() || !draftPrompt().trim() || sending()
                      ? theme.fgMuted
                      : '#fff',
                  cursor:
                    !selectedTaskId() || !draftPrompt().trim() || sending()
                      ? 'not-allowed'
                      : 'pointer',
                  'font-size': sf(11),
                }}
              >
                {sending() ? '发送中…' : '发送指令'}
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'flex-end',
              gap: '8px',
            }}
          >
            <button
              type="button"
              onClick={() => void runGlobalMonitorNow()}
              disabled={!store.globalMonitor.enabled || store.globalMonitor.status === 'running'}
              style={{
                padding: '6px 10px',
                background:
                  !store.globalMonitor.enabled || store.globalMonitor.status === 'running'
                    ? theme.bgElevated
                    : theme.accent,
                border: `1px solid ${
                  !store.globalMonitor.enabled || store.globalMonitor.status === 'running'
                    ? theme.border
                    : theme.accent
                }`,
                'border-radius': '8px',
                color:
                  !store.globalMonitor.enabled || store.globalMonitor.status === 'running'
                    ? theme.fgMuted
                    : '#fff',
                cursor:
                  !store.globalMonitor.enabled || store.globalMonitor.status === 'running'
                    ? 'not-allowed'
                    : 'pointer',
                'font-size': sf(11),
              }}
            >
              {store.globalMonitor.status === 'running' ? '汇报中…' : '立即汇报'}
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
