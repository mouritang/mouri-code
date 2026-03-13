import { Show, createSignal, createEffect, onCleanup } from 'solid-js';
import { Dialog } from './Dialog';
import { invoke } from '../lib/ipc';
import { IPC } from '../../electron/ipc/channels';
import { DiffView, DiffModeEnum } from '@git-diff-view/solid';
import '@git-diff-view/solid/styles/diff-view.css';
import { theme } from '../lib/theme';
import { isBinaryDiff } from '../lib/diff-parser';
import { getStatusColor } from '../lib/status-colors';
import type { ChangedFile, FileDataUrl } from '../ipc/types';

interface DiffViewerDialogProps {
  file: ChangedFile | null;
  worktreePath: string;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  M: '已修改',
  A: '已新增',
  D: '已删除',
  '?': '未跟踪',
};

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  rs: 'rust',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'xml',
  xml: 'xml',
  svg: 'xml',
  md: 'markdown',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  dockerfile: 'dockerfile',
  lua: 'lua',
  cpp: 'cpp',
  c: 'c',
  h: 'c',
  hpp: 'cpp',
};

function detectLang(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const basename = filePath.split('/').pop()?.toLowerCase() ?? '';
  if (basename === 'dockerfile') return 'dockerfile';
  if (basename === 'makefile') return 'makefile';
  return EXT_TO_LANG[ext] ?? 'plaintext';
}

function isPreviewableImage(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp';
}

function joinPosix(base: string, rel: string): string {
  if (!base) return rel;
  if (base.endsWith('/')) return base + rel;
  return `${base}/${rel}`;
}

export function DiffViewerDialog(props: DiffViewerDialogProps) {
  const [rawDiff, setRawDiff] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');
  const [binary, setBinary] = createSignal(false);
  const [previewLoading, setPreviewLoading] = createSignal(false);
  const [previewError, setPreviewError] = createSignal('');
  const [preview, setPreview] = createSignal<FileDataUrl | null>(null);
  const [viewMode, setViewMode] = createSignal(DiffModeEnum.Split);

  createEffect(() => {
    const file = props.file;
    if (!file) return;

    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });

    setLoading(true);
    setError('');
    setBinary(false);
    setRawDiff('');
    setPreviewLoading(false);
    setPreviewError('');
    setPreview(null);

    invoke<string>(IPC.GetFileDiff, {
      worktreePath: props.worktreePath,
      filePath: file.path,
    })
      .then((raw) => {
        if (cancelled) return;
        if (isBinaryDiff(raw)) {
          setBinary(true);
          if (file.status !== 'D' && isPreviewableImage(file.path)) {
            setPreviewLoading(true);
            const fullPath = joinPosix(props.worktreePath, file.path);
            void invoke<FileDataUrl>(IPC.ReadFileAsDataUrl, { filePath: fullPath })
              .then((result) => {
                if (cancelled) return;
                setPreview(result);
              })
              .catch((e) => {
                if (cancelled) return;
                setPreviewError(e instanceof Error ? e.message : String(e));
              })
              .finally(() => {
                if (cancelled) return;
                setPreviewLoading(false);
              });
          }
        } else {
          setRawDiff(raw);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
  });

  return (
    <Dialog
      open={props.file !== null}
      onClose={props.onClose}
      width="90vw"
      panelStyle={{
        height: '85vh',
        'max-width': '1400px',
        overflow: 'hidden',
        padding: '0',
        gap: '0',
      }}
    >
      <Show when={props.file}>
        {(file) => (
          <>
            {/* Header */}
            <div
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '10px',
                padding: '16px 20px',
                'border-bottom': `1px solid ${theme.border}`,
                'flex-shrink': '0',
              }}
            >
              <span
                style={{
                  'font-size': '11px',
                  'font-weight': '600',
                  padding: '2px 8px',
                  'border-radius': '4px',
                  color: getStatusColor(file().status),
                  background: 'rgba(255,255,255,0.06)',
                }}
              >
                {STATUS_LABELS[file().status] ?? file().status}
              </span>
              <span
                style={{
                  flex: '1',
                  'font-size': '13px',
                  'font-family': "'JetBrains Mono', monospace",
                  color: theme.fg,
                  overflow: 'hidden',
                  'text-overflow': 'ellipsis',
                  'white-space': 'nowrap',
                }}
              >
                {file().path}
              </span>

              {/* Split / Unified toggle */}
              <div
                style={{
                  display: 'flex',
                  gap: '2px',
                  background: 'rgba(255,255,255,0.04)',
                  'border-radius': '6px',
                  padding: '2px',
                }}
              >
                <button
                  onClick={() => setViewMode(DiffModeEnum.Split)}
                  style={{
                    background:
                      viewMode() === DiffModeEnum.Split ? 'rgba(255,255,255,0.10)' : 'transparent',
                    border: 'none',
                    color: viewMode() === DiffModeEnum.Split ? theme.fg : theme.fgMuted,
                    'font-size': '11px',
                    padding: '3px 10px',
                    'border-radius': '4px',
                    cursor: 'pointer',
                    'font-family': 'inherit',
                  }}
                >
                  分栏
                </button>
                <button
                  onClick={() => setViewMode(DiffModeEnum.Unified)}
                  style={{
                    background:
                      viewMode() === DiffModeEnum.Unified
                        ? 'rgba(255,255,255,0.10)'
                        : 'transparent',
                    border: 'none',
                    color: viewMode() === DiffModeEnum.Unified ? theme.fg : theme.fgMuted,
                    'font-size': '11px',
                    padding: '3px 10px',
                    'border-radius': '4px',
                    cursor: 'pointer',
                    'font-family': 'inherit',
                  }}
                >
                  统一
                </button>
              </div>

              <button
                onClick={() => props.onClose()}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: theme.fgMuted,
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  'align-items': 'center',
                  'border-radius': '4px',
                }}
                title="关闭"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div
              style={{
                flex: '1',
                overflow: 'auto',
              }}
            >
              <Show when={loading()}>
                <div style={{ padding: '40px', 'text-align': 'center', color: theme.fgMuted }}>
                  正在加载差异...
                </div>
              </Show>

              <Show when={error()}>
                <div style={{ padding: '40px', 'text-align': 'center', color: theme.error }}>
                  {error()}
                </div>
              </Show>

              <Show when={binary()}>
                <Show
                  when={props.file && isPreviewableImage(props.file.path)}
                  fallback={
                    <div style={{ padding: '40px', 'text-align': 'center', color: theme.fgMuted }}>
                      二进制文件，无法显示差异
                    </div>
                  }
                >
                  <div style={{ padding: '18px 20px' }}>
                    <Show when={props.file?.status === 'D'}>
                      <div style={{ 'text-align': 'center', color: theme.fgMuted }}>
                        文件已删除，无法预览
                      </div>
                    </Show>
                    <Show when={props.file?.status !== 'D'}>
                      <Show when={previewLoading()}>
                        <div style={{ 'text-align': 'center', color: theme.fgMuted }}>
                          正在加载图片...
                        </div>
                      </Show>
                      <Show when={previewError()}>
                        <div style={{ 'text-align': 'center', color: theme.error }}>
                          {previewError()}
                        </div>
                      </Show>
                      <Show when={!previewLoading() && !previewError() && preview()}>
                        {(p) => (
                          <div
                            style={{
                              display: 'flex',
                              'justify-content': 'center',
                              'align-items': 'center',
                              padding: '10px',
                              border: `1px solid ${theme.border}`,
                              'border-radius': '12px',
                              background: theme.bgInput,
                            }}
                          >
                            <img
                              src={p().data_url}
                              alt={props.file?.path ?? 'image'}
                              style={{
                                display: 'block',
                                'max-width': '100%',
                                'max-height': 'calc(85vh - 160px)',
                                'object-fit': 'contain',
                                'border-radius': '8px',
                              }}
                            />
                          </div>
                        )}
                      </Show>
                    </Show>
                  </div>
                </Show>
              </Show>

              <Show when={!loading() && !error() && !binary() && !rawDiff()}>
                <div style={{ padding: '40px', 'text-align': 'center', color: theme.fgMuted }}>
                  无改动
                </div>
              </Show>

              <Show when={!loading() && !error() && !binary() && rawDiff()}>
                <DiffView
                  data={{
                    oldFile: { fileName: file().path, fileLang: detectLang(file().path) },
                    newFile: { fileName: file().path, fileLang: detectLang(file().path) },
                    hunks: [rawDiff()],
                  }}
                  diffViewMode={viewMode()}
                  diffViewTheme="dark"
                  diffViewHighlight
                  diffViewWrap={false}
                  diffViewFontSize={12}
                />
              </Show>
            </div>
          </>
        )}
      </Show>
    </Dialog>
  );
}
