import { For } from 'solid-js';
import { Dialog } from './Dialog';
import { theme } from '../lib/theme';
import { alt, mod } from '../lib/platform';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

const SECTIONS = [
  {
    title: '导航',
    shortcuts: [
      [`${alt} + Up/Down`, '在面板或侧边栏任务之间切换'],
      [`${alt} + Left/Right`, '在同一行或跨任务切换'],
      [`${alt} + Left（从第一个任务）`, '聚焦侧边栏'],
      [`${alt} + Right（从侧边栏）`, '聚焦当前任务'],
      ['Enter（在侧边栏）', '跳转到当前任务面板'],
    ],
  },
  {
    title: '任务操作',
    shortcuts: [
      [`${mod} + W`, '关闭当前聚焦终端'],
      [`${mod} + Shift + W`, '关闭当前任务/终端'],
      [`${mod} + Shift + M`, '合并当前任务'],
      [`${mod} + Shift + P`, '推送到远程仓库'],
      [`${mod} + Shift + T`, '新建任务终端'],
      [`${mod} + Shift + Left/Right`, '调整任务/终端顺序'],
    ],
  },
  {
    title: '应用',
    shortcuts: [
      [`${mod} + N`, '新建任务'],
      [`${mod} + Shift + D`, '新建独立终端'],
      [`${mod} + Shift + A`, '新建任务'],
      [`${mod} + B`, '切换侧边栏'],
      [`${mod} + ,`, '打开设置'],
      [`${mod} + 0`, '重置缩放'],
      ['Ctrl + Shift + 滚轮', '调整所有面板宽度'],
      [`${mod} + / 或 F1`, '打开/关闭本帮助'],
      ['Escape', '关闭对话框'],
    ],
  },
];

export function HelpDialog(props: HelpDialogProps) {
  return (
    <Dialog open={props.open} onClose={props.onClose} width="480px" panelStyle={{ gap: '20px' }}>
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
        }}
      >
        <h2 style={{ margin: '0', 'font-size': '16px', color: theme.fg, 'font-weight': '600' }}>
          快捷键
        </h2>
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

      <For each={SECTIONS}>
        {(section) => (
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
            <div
              style={{
                'font-size': '11px',
                color: theme.fgMuted,
                'text-transform': 'uppercase',
                'letter-spacing': '0.05em',
                'font-weight': '600',
              }}
            >
              {section.title}
            </div>
            <For each={section.shortcuts}>
              {([key, desc]) => (
                <div
                  style={{
                    display: 'flex',
                    'justify-content': 'space-between',
                    'align-items': 'center',
                    padding: '4px 0',
                  }}
                >
                  <span style={{ color: theme.fgMuted, 'font-size': '12px' }}>{desc}</span>
                  <kbd
                    style={{
                      background: theme.bgInput,
                      border: `1px solid ${theme.border}`,
                      'border-radius': '4px',
                      padding: '2px 8px',
                      'font-size': '11px',
                      color: theme.fg,
                      'font-family': "'JetBrains Mono', monospace",
                      'white-space': 'nowrap',
                    }}
                  >
                    {key}
                  </kbd>
                </div>
              )}
            </For>
          </div>
        )}
      </For>
    </Dialog>
  );
}
