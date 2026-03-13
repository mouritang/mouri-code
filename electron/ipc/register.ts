import { ipcMain, dialog, shell, BrowserWindow, clipboard } from 'electron';
import { fileURLToPath } from 'url';
import { IPC } from './channels.js';
import {
  spawnAgent,
  writeToAgent,
  resizeAgent,
  pauseAgent,
  resumeAgent,
  killAgent,
  countRunningAgents,
  killAllAgents,
  getAgentMeta,
} from './pty.js';
import { startRemoteServer } from '../remote/server.js';
import { createGlobalMonitorService } from '../monitor.global-monitor.js';
import { startOpenClawBridge } from '../openclaw.bridge.js';
import {
  getGitIgnoredDirs,
  getMainBranch,
  getCurrentBranch,
  getChangedFiles,
  getFileDiff,
  getWorktreeStatus,
  checkMergeStatus,
  mergeTask,
  getBranchLog,
  pushTask,
  listBranches,
  checkoutBranch,
  createBranch,
  commitChanges,
  rebaseTask,
} from './git.js';
import { createTask, deleteTask } from './tasks.js';
import { listAgents } from './agents.js';
import { saveAppState, loadAppState } from './persistence.js';
import { describeImages } from './vision.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

/** Reject paths that are non-absolute or attempt directory traversal. */
function validatePath(p: unknown, label: string): void {
  if (typeof p !== 'string') throw new Error(`${label} must be a string`);
  if (!path.isAbsolute(p)) throw new Error(`${label} must be absolute`);
  if (p.includes('..')) throw new Error(`${label} must not contain ".."`);
}

/** Reject relative paths that attempt directory traversal. */
function validateRelativePath(p: unknown, label: string): void {
  if (typeof p !== 'string') throw new Error(`${label} must be a string`);
  if (p.includes('..')) throw new Error(`${label} must not contain ".."`);
}

/** Reject branch names that could be misinterpreted as git flags. */
function validateBranchName(name: unknown, label: string): void {
  if (typeof name !== 'string' || !name) throw new Error(`${label} must be a non-empty string`);
  if (name.startsWith('-')) throw new Error(`${label} must not start with "-"`);
}

export function registerAllHandlers(win: BrowserWindow): void {
  // --- Remote access state ---
  let remoteServer: ReturnType<typeof startRemoteServer> | null = null;
  const taskNames = new Map<string, string>();
  const globalMonitor = createGlobalMonitorService({
    getTaskName: (taskId: string) => taskNames.get(taskId) ?? taskId,
  });
  const openClawBridge = startOpenClawBridge({
    getTaskName: (taskId: string) => taskNames.get(taskId) ?? taskId,
    getGlobalMonitorSnapshot: () => globalMonitor.getState(),
    runGlobalMonitorNow: () => globalMonitor.runNow(),
  });

  // --- PTY commands ---
  ipcMain.handle(IPC.SpawnAgent, (_e, args) => {
    if (args.cwd) validatePath(args.cwd, 'cwd');
    return spawnAgent(win, args);
  });
  ipcMain.handle(IPC.WriteToAgent, (_e, args) => writeToAgent(args.agentId, args.data));
  ipcMain.handle(IPC.ResizeAgent, (_e, args) => resizeAgent(args.agentId, args.cols, args.rows));
  ipcMain.handle(IPC.PauseAgent, (_e, args) => pauseAgent(args.agentId));
  ipcMain.handle(IPC.ResumeAgent, (_e, args) => resumeAgent(args.agentId));
  ipcMain.handle(IPC.KillAgent, (_e, args) => killAgent(args.agentId));
  ipcMain.handle(IPC.CountRunningAgents, () => countRunningAgents());
  ipcMain.handle(IPC.KillAllAgents, () => killAllAgents());

  // --- Agent commands ---
  ipcMain.handle(IPC.ListAgents, () => listAgents());
  ipcMain.handle(IPC.UpdateGlobalMonitorConfig, (_e, args) => globalMonitor.updateConfig(args));
  ipcMain.handle(IPC.GetGlobalMonitorStatus, () => globalMonitor.getState());
  ipcMain.handle(IPC.RunGlobalMonitorNow, () => globalMonitor.runNow());
  ipcMain.handle(IPC.VisionDescribeImages, async (_e, args) => {
    const prompt = typeof args?.prompt === 'string' ? args.prompt : '';
    const imagePathsRaw = Array.isArray(args?.imagePaths) ? (args.imagePaths as unknown[]) : [];
    const imagePaths = imagePathsRaw.filter((p): p is string => typeof p === 'string');
    for (const p of imagePaths) validatePath(p, 'imagePath');

    const apiKey = typeof args?.apiKey === 'string' ? args.apiKey : undefined;
    const endpoint = typeof args?.endpoint === 'string' ? args.endpoint : undefined;
    const model = typeof args?.model === 'string' ? args.model : undefined;

    const description = await describeImages({ prompt, imagePaths, apiKey, endpoint, model });
    return { description };
  });
  ipcMain.handle(IPC.SaveClipboardImage, async () => {
    const img = clipboard.readImage();
    if (img.isEmpty()) {
      return { ok: false, reason: '剪贴板没有图片' };
    }

    // Keep this aligned with electron/ipc/vision.ts MAX_IMAGE_BYTES (8MB).
    const MAX_BYTES = 8 * 1024 * 1024;

    let data = img.toPNG();
    let mime = 'image/png';
    let ext = 'png';

    // If screenshot is too big, try JPEG first (usually shrinks dramatically).
    if (data.length > MAX_BYTES) {
      const qualities = [90, 85, 80, 75, 70, 65, 60];
      for (const q of qualities) {
        const jpeg = img.toJPEG(q);
        if (jpeg.length <= MAX_BYTES) {
          data = jpeg;
          mime = 'image/jpeg';
          ext = 'jpg';
          break;
        }
      }
    }

    // Still too big: downscale then JPEG.
    if (data.length > MAX_BYTES) {
      const size = img.getSize();
      let width = size.width;
      // Shrink until it fits or becomes unreasonable.
      for (let i = 0; i < 6 && data.length > MAX_BYTES; i++) {
        width = Math.max(320, Math.round(width * 0.75));
        const resized = img.resize({ width, quality: 'good' });
        const jpeg = resized.toJPEG(80);
        data = jpeg;
        mime = 'image/jpeg';
        ext = 'jpg';
      }
    }

    if (data.length > MAX_BYTES) {
      throw new Error('剪贴板图片太大，无法压缩到 8MB 以内；请截取更小区域或降低分辨率后再试');
    }

    const dir = path.join(os.tmpdir(), 'mouricode', 'clipboard-images');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `mc-clip-${Date.now()}-${crypto.randomUUID()}.${ext}`);
    fs.writeFileSync(filePath, data);

    return { ok: true, filePath, bytes: data.length, mime };
  });

  // --- Task commands ---
  ipcMain.handle(IPC.CreateTask, (_e, args) => {
    validatePath(args.projectRoot, 'projectRoot');
    const result = createTask(args.name, args.projectRoot, args.symlinkDirs, args.branchPrefix);
    result.then((r: { id: string }) => taskNames.set(r.id, args.name)).catch(() => {});
    return result;
  });
  ipcMain.handle(IPC.DeleteTask, (_e, args) => {
    validatePath(args.projectRoot, 'projectRoot');
    validateBranchName(args.branchName, 'branchName');
    if (args.worktreePath !== undefined) validatePath(args.worktreePath, 'worktreePath');
    return deleteTask(
      args.agentIds,
      args.branchName,
      args.deleteBranch,
      args.projectRoot,
      args.worktreePath,
    );
  });

  // --- Git commands ---
  ipcMain.handle(IPC.GetChangedFiles, (_e, args) => {
    validatePath(args.worktreePath, 'worktreePath');
    return getChangedFiles(args.worktreePath);
  });
  ipcMain.handle(IPC.GetFileDiff, (_e, args) => {
    validatePath(args.worktreePath, 'worktreePath');
    validateRelativePath(args.filePath, 'filePath');
    return getFileDiff(args.worktreePath, args.filePath);
  });
  ipcMain.handle(IPC.ReadFileAsDataUrl, async (_e, args) => {
    validatePath(args.filePath, 'filePath');

    // Keep this conservative: only common raster image formats for now.
    const ext = path.extname(args.filePath).toLowerCase();
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.gif'
            ? 'image/gif'
            : ext === '.webp'
              ? 'image/webp'
              : null;
    if (!mime) throw new Error(`Unsupported preview format: ${ext || '(no extension)'}`);

    const stat = await fs.promises.stat(args.filePath);
    if (!stat.isFile()) throw new Error('Path is not a file');

    const MAX_BYTES = 12 * 1024 * 1024; // 12MB
    if (stat.size > MAX_BYTES) throw new Error('File too large to preview');

    const buf = await fs.promises.readFile(args.filePath);
    const base64 = buf.toString('base64');
    return {
      mime,
      bytes: buf.length,
      data_url: `data:${mime};base64,${base64}`,
    };
  });
  ipcMain.handle(IPC.GetGitignoredDirs, (_e, args) => {
    validatePath(args.projectRoot, 'projectRoot');
    return getGitIgnoredDirs(args.projectRoot);
  });
  ipcMain.handle(IPC.GetWorktreeStatus, (_e, args) => {
    validatePath(args.worktreePath, 'worktreePath');
    return getWorktreeStatus(args.worktreePath);
  });
  ipcMain.handle(IPC.CheckMergeStatus, (_e, args) => {
    validatePath(args.worktreePath, 'worktreePath');
    return checkMergeStatus(args.worktreePath);
  });
  ipcMain.handle(IPC.MergeTask, (_e, args) => {
    validatePath(args.projectRoot, 'projectRoot');
    validateBranchName(args.branchName, 'branchName');
    if (args.worktreePath !== undefined) validatePath(args.worktreePath, 'worktreePath');
    return mergeTask(
      args.projectRoot,
      args.branchName,
      args.squash,
      args.message,
      args.cleanup,
      args.worktreePath,
    );
  });
  ipcMain.handle(IPC.GetBranchLog, (_e, args) => {
    validatePath(args.worktreePath, 'worktreePath');
    return getBranchLog(args.worktreePath);
  });
  ipcMain.handle(IPC.PushTask, (_e, args) => {
    validatePath(args.projectRoot, 'projectRoot');
    validateBranchName(args.branchName, 'branchName');
    return pushTask(args.projectRoot, args.branchName);
  });
  ipcMain.handle(IPC.ListBranches, (_e, args) => {
    validatePath(args.worktreePath, 'worktreePath');
    return listBranches(args.worktreePath);
  });
  ipcMain.handle(IPC.CheckoutBranch, (_e, args) => {
    validatePath(args.worktreePath, 'worktreePath');
    validateBranchName(args.branchName, 'branchName');
    return checkoutBranch(args.worktreePath, args.branchName);
  });
  ipcMain.handle(IPC.CreateBranch, (_e, args) => {
    validatePath(args.worktreePath, 'worktreePath');
    validateBranchName(args.branchName, 'branchName');
    return createBranch(args.worktreePath, args.branchName);
  });
  ipcMain.handle(IPC.CommitChanges, (_e, args) => {
    validatePath(args.worktreePath, 'worktreePath');
    if (typeof args.message !== 'string') throw new Error('message must be a string');
    return commitChanges(args.worktreePath, args.message);
  });
  ipcMain.handle(IPC.RebaseTask, (_e, args) => {
    validatePath(args.worktreePath, 'worktreePath');
    return rebaseTask(args.worktreePath);
  });
  ipcMain.handle(IPC.GetMainBranch, (_e, args) => {
    validatePath(args.projectRoot, 'projectRoot');
    return getMainBranch(args.projectRoot);
  });
  ipcMain.handle(IPC.GetCurrentBranch, (_e, args) => {
    validatePath(args.projectRoot, 'projectRoot');
    return getCurrentBranch(args.projectRoot);
  });

  // --- Persistence ---
  // Extract task names from persisted state so the remote server can
  // show them (taskNames is only populated on CreateTask otherwise).
  function syncTaskNamesFromJson(json: string): void {
    try {
      const state = JSON.parse(json) as {
        tasks?: Record<string, { id: string; name: string }>;
        globalMonitor?: {
          enabled?: boolean;
          apiKey?: string;
          endpoint?: string;
          model?: string;
          intervalSec?: number;
        };
      };
      if (state.tasks) {
        for (const t of Object.values(state.tasks)) {
          if (t.id && t.name) taskNames.set(t.id, t.name);
        }
      }
      if (state.globalMonitor) {
        void globalMonitor.updateConfig(state.globalMonitor);
      }
    } catch {
      /* ignore malformed state */
    }
  }
  ipcMain.handle(IPC.SaveAppState, (_e, args) => {
    syncTaskNamesFromJson(args.json);
    return saveAppState(args.json);
  });
  ipcMain.handle(IPC.LoadAppState, () => {
    const json = loadAppState();
    if (json) syncTaskNamesFromJson(json);
    return json;
  });

  // --- Window management ---
  ipcMain.handle(IPC.WindowIsFocused, () => win.isFocused());
  ipcMain.handle(IPC.WindowIsMaximized, () => win.isMaximized());
  ipcMain.handle(IPC.WindowMinimize, () => win.minimize());
  ipcMain.handle(IPC.WindowToggleMaximize, () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle(IPC.WindowClose, () => win.close());
  ipcMain.handle(IPC.WindowForceClose, () => win.destroy());
  ipcMain.handle(IPC.WindowHide, () => win.hide());
  ipcMain.handle(IPC.WindowMaximize, () => win.maximize());
  ipcMain.handle(IPC.WindowUnmaximize, () => win.unmaximize());
  ipcMain.handle(IPC.WindowSetSize, (_e, args) => win.setSize(args.width, args.height));
  ipcMain.handle(IPC.WindowSetPosition, (_e, args) => win.setPosition(args.x, args.y));
  ipcMain.handle(IPC.WindowGetPosition, () => {
    const [x, y] = win.getPosition();
    return { x, y };
  });
  ipcMain.handle(IPC.WindowGetSize, () => {
    const [width, height] = win.getSize();
    return { width, height };
  });

  // --- Dialog ---
  ipcMain.handle(IPC.DialogConfirm, async (_e, args) => {
    const result = await dialog.showMessageBox(win, {
      type: args.kind === 'warning' ? 'warning' : 'question',
      title: args.title || 'Confirm',
      message: args.message,
      buttons: [args.okLabel || 'OK', args.cancelLabel || 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    });
    return result.response === 0;
  });

  ipcMain.handle(IPC.DialogOpen, async (_e, args) => {
    const properties: Array<'openDirectory' | 'openFile' | 'multiSelections'> = [];
    if (args?.directory) properties.push('openDirectory');
    else properties.push('openFile');
    if (args?.multiple) properties.push('multiSelections');
    const result = await dialog.showOpenDialog(win, { properties });
    if (result.canceled) return null;
    return args?.multiple ? result.filePaths : (result.filePaths[0] ?? null);
  });

  // --- Shell/Opener ---
  ipcMain.handle(IPC.ShellReveal, (_e, args) => {
    validatePath(args.filePath, 'filePath');
    shell.showItemInFolder(args.filePath);
  });

  // --- Remote access ---
  ipcMain.handle(IPC.StartRemoteServer, (_e, args: { port?: number }) => {
    if (remoteServer)
      return {
        url: remoteServer.url,
        wifiUrl: remoteServer.wifiUrl,
        tailscaleUrl: remoteServer.tailscaleUrl,
        token: remoteServer.token,
        port: remoteServer.port,
      };

    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    const distRemote = path.join(thisDir, '..', '..', 'dist-remote');
    remoteServer = startRemoteServer({
      port: args.port ?? 7777,
      staticDir: distRemote,
      getTaskName: (taskId: string) => taskNames.get(taskId) ?? taskId,
      getAgentStatus: (agentId: string) => {
        const meta = getAgentMeta(agentId);
        return {
          status: meta ? ('running' as const) : ('exited' as const),
          exitCode: null,
          lastLine: '',
        };
      },
    });
    return {
      url: remoteServer.url,
      wifiUrl: remoteServer.wifiUrl,
      tailscaleUrl: remoteServer.tailscaleUrl,
      token: remoteServer.token,
      port: remoteServer.port,
    };
  });

  ipcMain.handle(IPC.StopRemoteServer, async () => {
    if (remoteServer) {
      await remoteServer.stop();
      remoteServer = null;
    }
  });

  ipcMain.handle(IPC.GetRemoteStatus, () => {
    if (!remoteServer) return { enabled: false, connectedClients: 0 };
    return {
      enabled: true,
      connectedClients: remoteServer.connectedClients(),
      url: remoteServer.url,
      wifiUrl: remoteServer.wifiUrl,
      tailscaleUrl: remoteServer.tailscaleUrl,
      token: remoteServer.token,
      port: remoteServer.port,
    };
  });

  // --- Forward window events to renderer ---
  win.on('focus', () => {
    if (!win.isDestroyed()) win.webContents.send(IPC.WindowFocus);
  });
  win.on('blur', () => {
    if (!win.isDestroyed()) win.webContents.send(IPC.WindowBlur);
  });
  win.on('resize', () => {
    if (!win.isDestroyed()) win.webContents.send(IPC.WindowResized);
  });
  win.on('move', () => {
    if (!win.isDestroyed()) win.webContents.send(IPC.WindowMoved);
  });
  win.on('close', (e) => {
    e.preventDefault();
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.WindowCloseRequested);
      // Fallback: force-close if renderer doesn't respond within 5 seconds.
      // If the renderer calls WindowForceClose first, win.isDestroyed()
      // will be true and this is a no-op.
      setTimeout(() => {
        if (!win.isDestroyed()) win.destroy();
      }, 5_000);
    }
  });
  win.on('closed', () => {
    void openClawBridge.stop();
  });
}
