import { For, Show, createMemo } from 'solid-js';
import { Dialog } from './Dialog';
import { getAvailableTerminalFonts, getTerminalFontFamily, LIGATURE_FONTS } from '../lib/fonts';
import { LOOK_PRESETS } from '../lib/look';
import { theme } from '../lib/theme';
import {
  store,
  runGlobalMonitorNow,
  setGlobalMonitorApiKey,
  setGlobalMonitorEnabled,
  setGlobalMonitorEndpoint,
  setGlobalMonitorIntervalSec,
  setGlobalMonitorModel,
  setTerminalFont,
  setThemePreset,
  setAutoTrustFolders,
  setInactiveColumnOpacity,
  setVisionApiKey,
  setVisionEnabled,
  setVisionEndpoint,
  setVisionModel,
} from '../store/store';
import { mod } from '../lib/platform';
import type { TerminalFont } from '../lib/fonts';
import {
  MAX_GLOBAL_MONITOR_INTERVAL_SEC,
  MIN_GLOBAL_MONITOR_INTERVAL_SEC,
} from '../store/monitorDefaults';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog(props: SettingsDialogProps) {
  const fonts = createMemo<TerminalFont[]>(() => {
    const available = getAvailableTerminalFonts();
    // Always include the currently selected font so it stays visible even if detection misses it
    if (available.includes(store.terminalFont)) return available;
    return [store.terminalFont, ...available];
  });

  const monitorStatusLabel = createMemo(() => {
    switch (store.globalMonitor.status) {
      case 'running':
        return '汇报中';
      case 'error':
        return '异常';
      case 'idle':
        return store.globalMonitor.enabled ? '运行中' : '已关闭';
      default:
        return '已关闭';
    }
  });

  const monitorStatusColor = createMemo(() => {
    switch (store.globalMonitor.status) {
      case 'running':
        return theme.accent;
      case 'error':
        return theme.error;
      case 'idle':
        return store.globalMonitor.enabled ? theme.success : theme.fgMuted;
      default:
        return theme.fgMuted;
    }
  });

  const lastRunLabel = createMemo(() => {
    if (!store.globalMonitor.lastRunAt) return '尚未分析';
    return new Date(store.globalMonitor.lastRunAt).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  });

  const inputStyle = {
    width: '100%',
    background: theme.bgInput,
    border: `1px solid ${theme.border}`,
    'border-radius': '8px',
    color: theme.fg,
    padding: '8px 10px',
    'font-size': '12px',
    'box-sizing': 'border-box' as const,
  };

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      width="640px"
      zIndex={1100}
      panelStyle={{ 'max-width': 'calc(100vw - 32px)', padding: '24px', gap: '18px' }}
    >
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
        }}
      >
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
          <h2
            style={{
              margin: '0',
              'font-size': '16px',
              color: theme.fg,
              'font-weight': '600',
            }}
          >
            设置
          </h2>
          <span style={{ 'font-size': '12px', color: theme.fgSubtle }}>
            自定义你的工作区。快捷键：{' '}
            <kbd
              style={{
                background: theme.bgInput,
                border: `1px solid ${theme.border}`,
                'border-radius': '4px',
                padding: '1px 6px',
                'font-family': "'JetBrains Mono', monospace",
                color: theme.fgMuted,
              }}
            >
              {mod}+,
            </kbd>
          </span>
        </div>
        <button
          onClick={() => props.onClose()}
          style={{
            background: 'transparent',
            border: 'none',
            color: theme.fgMuted,
            cursor: 'pointer',
            'font-size': '18px',
            padding: '0 4px',
            'line-height': '1',
          }}
        >
          &times;
        </button>
      </div>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
        <div
          style={{
            'font-size': '11px',
            color: theme.fgMuted,
            'text-transform': 'uppercase',
            'letter-spacing': '0.05em',
            'font-weight': '600',
          }}
        >
          主题
        </div>
        <div class="settings-theme-grid">
          <For each={LOOK_PRESETS}>
            {(preset) => (
              <button
                type="button"
                class={`settings-theme-card${store.themePreset === preset.id ? ' active' : ''}`}
                onClick={() => setThemePreset(preset.id)}
              >
                <span class="settings-theme-title">{preset.label}</span>
                <span class="settings-theme-desc">{preset.description}</span>
              </button>
            )}
          </For>
        </div>
      </div>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
        <div
          style={{
            'font-size': '11px',
            color: theme.fgMuted,
            'text-transform': 'uppercase',
            'letter-spacing': '0.05em',
            'font-weight': '600',
          }}
        >
          图片（Vision）
        </div>

        <label
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '10px',
            cursor: 'pointer',
            padding: '8px 12px',
            'border-radius': '8px',
            background: theme.bgInput,
            border: `1px solid ${theme.border}`,
          }}
        >
          <input
            type="checkbox"
            checked={store.vision.enabled}
            onChange={(e) => setVisionEnabled(e.currentTarget.checked)}
            style={{ 'accent-color': theme.accent, cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px', flex: 1 }}>
            <span style={{ 'font-size': '13px', color: theme.fg }}>启用图片解析并转成文字</span>
            <span style={{ 'font-size': '11px', color: theme.fgSubtle }}>
              用于在“全局助理 →
              发送指令”里附加图片时，先用视觉模型把图片内容转成可复制文本，再发送到任务终端的 CLI。
            </span>
          </div>
        </label>

        <div
          style={{
            display: 'grid',
            'grid-template-columns': '1fr',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
            <span style={{ 'font-size': '12px', color: theme.fg }}>OpenAI API Key</span>
            <input
              type="password"
              value={store.vision.apiKey}
              onInput={(e) => setVisionApiKey(e.currentTarget.value)}
              placeholder="sk-..."
              style={inputStyle}
            />
            <span style={{ 'font-size': '11px', color: theme.fgSubtle }}>
              仅保存在本机应用状态中，也支持通过环境变量 `OPENAI_API_KEY`
              提供（未填写时会尝试读取）。
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            'grid-template-columns': '1fr 1fr',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
            <span style={{ 'font-size': '12px', color: theme.fg }}>模型</span>
            <input
              type="text"
              value={store.vision.model}
              onInput={(e) => setVisionModel(e.currentTarget.value)}
              placeholder="gpt-4o-mini"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
            <span style={{ 'font-size': '12px', color: theme.fg }}>API Endpoint</span>
            <input
              type="text"
              value={store.vision.endpoint}
              onInput={(e) => setVisionEndpoint(e.currentTarget.value)}
              placeholder="https://api.openai.com/v1/chat/completions"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
        <div
          style={{
            'font-size': '11px',
            color: theme.fgMuted,
            'text-transform': 'uppercase',
            'letter-spacing': '0.05em',
            'font-weight': '600',
          }}
        >
          全局助理
        </div>

        <label
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '10px',
            cursor: 'pointer',
            padding: '8px 12px',
            'border-radius': '8px',
            background: theme.bgInput,
            border: `1px solid ${theme.border}`,
          }}
        >
          <input
            type="checkbox"
            checked={store.globalMonitor.enabled}
            onChange={(e) => setGlobalMonitorEnabled(e.currentTarget.checked)}
            style={{ 'accent-color': theme.accent, cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px', flex: 1 }}>
            <span style={{ 'font-size': '13px', color: theme.fg }}>启用 MiniMax 全局助理</span>
            <span style={{ 'font-size': '11px', color: theme.fgSubtle }}>
              持续监控所有正在运行的 AI 代码任务状态；点击立即汇报时，再汇总当前所有任务的最新进展。
            </span>
          </div>
          <span style={{ 'font-size': '11px', color: monitorStatusColor() }}>
            {monitorStatusLabel()}
          </span>
        </label>

        <div
          style={{
            display: 'grid',
            'grid-template-columns': '1fr 140px',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
            <span style={{ 'font-size': '12px', color: theme.fg }}>MiniMax API Key</span>
            <input
              type="password"
              value={store.globalMonitor.apiKey}
              onInput={(e) => setGlobalMonitorApiKey(e.currentTarget.value)}
              placeholder="sk-..."
              style={inputStyle}
            />
            <span style={{ 'font-size': '11px', color: theme.fgSubtle }}>
              仅保存在本机应用状态中，也支持通过环境变量 `MINIMAX_API_KEY` 提供。
              <Show when={store.globalMonitor.hasApiKey && !store.globalMonitor.apiKey.trim()}>
                {' '}
                当前已检测到环境变量中的 Key。
              </Show>
            </span>
          </div>

          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
            <span style={{ 'font-size': '12px', color: theme.fg }}>状态轮询间隔（秒）</span>
            <input
              type="number"
              min={MIN_GLOBAL_MONITOR_INTERVAL_SEC}
              max={MAX_GLOBAL_MONITOR_INTERVAL_SEC}
              step="10"
              value={store.globalMonitor.intervalSec}
              onChange={(e) => setGlobalMonitorIntervalSec(Number(e.currentTarget.value))}
              style={inputStyle}
            />
            <span style={{ 'font-size': '11px', color: theme.fgSubtle }}>
              用于刷新活跃任务计数与状态显示，不会自动触发 AI 汇报。
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            'grid-template-columns': '1fr 1fr',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
            <span style={{ 'font-size': '12px', color: theme.fg }}>模型</span>
            <input
              type="text"
              value={store.globalMonitor.model}
              onInput={(e) => setGlobalMonitorModel(e.currentTarget.value)}
              placeholder="MiniMax-M2.5"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
            <span style={{ 'font-size': '12px', color: theme.fg }}>API Endpoint</span>
            <input
              type="text"
              value={store.globalMonitor.endpoint}
              onInput={(e) => setGlobalMonitorEndpoint(e.currentTarget.value)}
              placeholder="https://api.minimaxi.com/v1/text/chatcompletion_v2"
              style={inputStyle}
            />
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            'justify-content': 'space-between',
            'align-items': 'center',
            gap: '10px',
            padding: '10px 12px',
            'border-radius': '8px',
            background: theme.bgInput,
            border: `1px solid ${theme.border}`,
          }}
        >
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
            <span style={{ 'font-size': '12px', color: theme.fg }}>
              上次汇报：{lastRunLabel()} · 活跃任务 {store.globalMonitor.activeTaskCount}
            </span>
            <Show when={store.globalMonitor.lastSummary}>
              <span style={{ 'font-size': '11px', color: theme.fgSubtle }}>
                {store.globalMonitor.lastSummary}
              </span>
            </Show>
            <Show when={store.globalMonitor.lastError}>
              <span style={{ 'font-size': '11px', color: theme.error }}>
                {store.globalMonitor.lastError}
              </span>
            </Show>
          </div>
          <button
            type="button"
            onClick={() => void runGlobalMonitorNow()}
            disabled={!store.globalMonitor.enabled || store.globalMonitor.status === 'running'}
            style={{
              padding: '8px 12px',
              background:
                !store.globalMonitor.enabled || store.globalMonitor.status === 'running'
                  ? theme.bgElevated
                  : theme.accent,
              color:
                !store.globalMonitor.enabled || store.globalMonitor.status === 'running'
                  ? theme.fgMuted
                  : '#fff',
              border: `1px solid ${
                !store.globalMonitor.enabled || store.globalMonitor.status === 'running'
                  ? theme.border
                  : theme.accent
              }`,
              'border-radius': '8px',
              cursor:
                !store.globalMonitor.enabled || store.globalMonitor.status === 'running'
                  ? 'not-allowed'
                  : 'pointer',
              'font-size': '12px',
            }}
          >
            {store.globalMonitor.status === 'running' ? '汇报中…' : '立即汇报'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
        <div
          style={{
            'font-size': '11px',
            color: theme.fgMuted,
            'text-transform': 'uppercase',
            'letter-spacing': '0.05em',
            'font-weight': '600',
          }}
        >
          行为
        </div>
        <label
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '10px',
            cursor: 'pointer',
            padding: '8px 12px',
            'border-radius': '8px',
            background: theme.bgInput,
            border: `1px solid ${theme.border}`,
          }}
        >
          <input
            type="checkbox"
            checked={store.autoTrustFolders}
            onChange={(e) => setAutoTrustFolders(e.currentTarget.checked)}
            style={{ 'accent-color': theme.accent, cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
            <span style={{ 'font-size': '13px', color: theme.fg }}>自动信任文件夹</span>
            <span style={{ 'font-size': '11px', color: theme.fgSubtle }}>
              自动接受智能体弹出的信任与权限确认
            </span>
          </div>
        </label>
      </div>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
        <div
          style={{
            'font-size': '11px',
            color: theme.fgMuted,
            'text-transform': 'uppercase',
            'letter-spacing': '0.05em',
            'font-weight': '600',
          }}
        >
          聚焦弱化
        </div>
        <div
          style={{
            display: 'flex',
            'flex-direction': 'column',
            gap: '8px',
            padding: '8px 12px',
            'border-radius': '8px',
            background: theme.bgInput,
            border: `1px solid ${theme.border}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'space-between',
            }}
          >
            <span style={{ 'font-size': '13px', color: theme.fg }}>非活动列透明度</span>
            <span
              style={{
                'font-size': '12px',
                color: theme.fgMuted,
                'font-family': "'JetBrains Mono', monospace",
                'min-width': '36px',
                'text-align': 'right',
              }}
            >
              {Math.round(store.inactiveColumnOpacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="30"
            max="100"
            step="5"
            value={store.inactiveColumnOpacity * 100}
            onInput={(e) => setInactiveColumnOpacity(Number(e.currentTarget.value) / 100)}
            style={{
              width: '100%',
              'accent-color': theme.accent,
              cursor: 'pointer',
            }}
          />
          <div
            style={{
              display: 'flex',
              'justify-content': 'space-between',
              'font-size': '10px',
              color: theme.fgSubtle,
            }}
          >
            <span>更暗</span>
            <span>不弱化</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
        <div
          style={{
            'font-size': '11px',
            color: theme.fgMuted,
            'text-transform': 'uppercase',
            'letter-spacing': '0.05em',
            'font-weight': '600',
          }}
        >
          终端字体
        </div>
        <div class="settings-font-grid">
          <For each={fonts()}>
            {(font) => (
              <button
                type="button"
                class={`settings-font-card${store.terminalFont === font ? ' active' : ''}`}
                onClick={() => setTerminalFont(font)}
              >
                <span class="settings-font-name">{font}</span>
                <span
                  class="settings-font-preview"
                  style={{ 'font-family': getTerminalFontFamily(font) }}
                >
                  AaBb 0Oo1Il →
                </span>
              </button>
            )}
          </For>
        </div>
        <Show when={LIGATURE_FONTS.has(store.terminalFont)}>
          <span style={{ 'font-size': '11px', color: theme.fgSubtle }}>
            该字体包含连字，可能会影响渲染性能。
          </span>
        </Show>
      </div>
    </Dialog>
  );
}
