import { Show, createEffect, createSignal } from 'solid-js';
import { Dialog } from './Dialog';
import { invoke } from '../lib/ipc';
import { IPC } from '../../electron/ipc/channels';
import { theme } from '../lib/theme';
import { sf } from '../lib/fontScale';
import { revealItemInDir } from '../lib/shell';
import { store, closeImagePreview } from '../store/store';
import type { FileDataUrl } from '../ipc/types';

export function ImagePreviewDialog() {
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');
  const [dataUrl, setDataUrl] = createSignal<string | null>(null);
  const [bytes, setBytes] = createSignal<number | null>(null);

  createEffect(() => {
    const filePath = store.imagePreview.filePath;
    if (!filePath) return;
    setLoading(true);
    setError('');
    setDataUrl(null);
    setBytes(null);

    invoke<FileDataUrl>(IPC.ReadFileAsDataUrl, { filePath })
      .then((result) => {
        setDataUrl(result.data_url);
        setBytes(result.bytes);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  });

  const title = () => store.imagePreview.title ?? '图片预览';

  return (
    <Dialog
      open={Boolean(store.imagePreview.filePath)}
      onClose={() => closeImagePreview()}
      width="min(92vw, 1100px)"
      panelStyle={{
        height: 'min(86vh, 820px)',
        padding: '14px',
        gap: '12px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: '10px',
          'flex-shrink': '0',
        }}
      >
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px', flex: 1 }}>
          <span style={{ 'font-size': sf(12), color: theme.fg, 'font-weight': '600' }}>
            {title()}
          </span>
          <span
            style={{
              'font-size': sf(10),
              color: theme.fgMuted,
              'font-family': "'JetBrains Mono', monospace",
              overflow: 'hidden',
              'text-overflow': 'ellipsis',
              'white-space': 'nowrap',
            }}
            title={store.imagePreview.filePath ?? ''}
          >
            {store.imagePreview.filePath ?? ''}
            <Show when={typeof bytes() === 'number'}>
              {' '}
              <span style={{ opacity: 0.7 }}>({Math.round((bytes() ?? 0) / 1024)} KB)</span>
            </Show>
          </span>
        </div>

        <Show when={store.imagePreview.filePath}>
          {(p) => (
            <>
              <button
                type="button"
                onClick={() => revealItemInDir(p()).catch(() => {})}
                style={{
                  background: theme.bgElevated,
                  border: `1px solid ${theme.border}`,
                  color: theme.fg,
                  padding: '6px 10px',
                  'border-radius': '8px',
                  cursor: 'pointer',
                  'font-size': sf(11),
                }}
                title="在文件管理器中显示"
              >
                定位文件
              </button>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(p()).catch(() => {})}
                style={{
                  background: theme.bgElevated,
                  border: `1px solid ${theme.border}`,
                  color: theme.fg,
                  padding: '6px 10px',
                  'border-radius': '8px',
                  cursor: 'pointer',
                  'font-size': sf(11),
                }}
                title="复制路径"
              >
                复制路径
              </button>
            </>
          )}
        </Show>

        <button
          type="button"
          onClick={() => closeImagePreview()}
          style={{
            background: 'transparent',
            border: `1px solid ${theme.border}`,
            color: theme.fgMuted,
            padding: '6px 10px',
            'border-radius': '8px',
            cursor: 'pointer',
            'font-size': sf(11),
          }}
          title="关闭 (Esc)"
        >
          关闭
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          'border-radius': '12px',
          border: `1px solid ${theme.border}`,
          background: theme.bgInput,
          padding: '10px',
        }}
      >
        <Show when={loading()}>
          <div style={{ color: theme.fgMuted, 'font-size': sf(12), 'text-align': 'center' }}>
            正在加载图片...
          </div>
        </Show>
        <Show when={error()}>
          <div style={{ color: theme.error, 'font-size': sf(12), 'text-align': 'center' }}>
            {error()}
          </div>
        </Show>
        <Show when={!loading() && !error() && dataUrl()}>
          {(url) => (
            <img
              src={url()}
              alt={title()}
              style={{
                display: 'block',
                'max-width': '100%',
                'max-height': 'calc(86vh - 120px)',
                margin: '0 auto',
                'object-fit': 'contain',
                'border-radius': '8px',
                background: 'rgba(0,0,0,0.15)',
              }}
            />
          )}
        </Show>
      </div>
    </Dialog>
  );
}
