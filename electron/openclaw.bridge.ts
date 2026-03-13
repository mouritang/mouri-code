import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { getActiveAgentIds, getAgentMeta, getAgentScrollback, writeToAgent } from './ipc/pty.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 7788;
const DISCOVERY_FILE = join(homedir(), '.clawdbot', 'mouricode-bridge.json');
const MAX_BODY_BYTES = 64 * 1024;
const MAX_OUTPUT_CHARS = 12_000;
const MIN_OUTPUT_CHARS = 200;
const ESC = String.fromCharCode(27);

const OSC_PATTERN = new RegExp(
  `${escapeForRegExp(ESC)}\\][^\\u0007]*(?:\\u0007|${escapeForRegExp(ESC)}\\\\)`,
  'g',
);
const CSI_PATTERN = new RegExp(`${escapeForRegExp(ESC)}\\[[0-?]*[ -/]*[@-~]`, 'g');
const ESC_PATTERN = new RegExp(`${escapeForRegExp(ESC)}[@-_]`, 'g');

interface GlobalMonitorSnapshotLike {
  enabled: boolean;
  hasApiKey: boolean;
  endpoint: string;
  model: string;
  intervalSec: number;
  status: string;
  lastRunAt: string | null;
  lastSummary: string | null;
  lastError: string | null;
  activeTaskCount: number;
  alerts: unknown[];
  taskInsights: unknown[];
  commands: unknown[];
}

interface OpenClawBridgeOptions {
  getTaskName: (taskId: string) => string;
  getGlobalMonitorSnapshot: () => GlobalMonitorSnapshotLike;
  runGlobalMonitorNow: () => Promise<GlobalMonitorSnapshotLike>;
  preferredPort?: number;
}

interface OpenClawBridge {
  stop: () => Promise<void>;
  getStatus: () => {
    ready: boolean;
    port: number | null;
    baseUrl: string | null;
    lastError: string | null;
  };
}

interface TaskSessionSummary {
  taskId: string;
  taskName: string;
  agentId: string;
  sessionCount: number;
  command: string;
  latestOutput: string;
  status: 'running';
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripAnsi(input: string): string {
  const stripped = input.replace(OSC_PATTERN, '').replace(CSI_PATTERN, '').replace(ESC_PATTERN, '');
  let cleaned = '';
  for (const char of stripped) {
    const code = char.charCodeAt(0);
    if (char === '\n' || char === '\t' || (code >= 32 && code !== 127)) {
      cleaned += char;
    }
  }
  return cleaned;
}

function normalizeTerminalText(input: string): string {
  const joined = stripAnsi(input)
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line, index, arr) => line.length > 0 || (index > 0 && arr[index - 1].length > 0))
    .join('\n')
    .trim();
  return joined.length > MAX_OUTPUT_CHARS ? joined.slice(-MAX_OUTPUT_CHARS) : joined;
}

function clampOutputChars(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return MAX_OUTPUT_CHARS;
  return Math.min(MAX_OUTPUT_CHARS, Math.max(MIN_OUTPUT_CHARS, Math.trunc(parsed)));
}

function decodeScrollback(encoded: string | null, maxChars?: number): string {
  if (!encoded) return '';
  try {
    const text = normalizeTerminalText(Buffer.from(encoded, 'base64').toString('utf8'));
    if (!maxChars || !Number.isFinite(maxChars)) return text;
    const limit = clampOutputChars(maxChars);
    return text.length > limit ? text.slice(-limit) : text;
  } catch {
    return '';
  }
}

function latestOutputLine(text: string): string {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines[lines.length - 1] : '（暂无终端输出）';
}

function listTaskSessions(getTaskName: (taskId: string) => string): TaskSessionSummary[] {
  const grouped = new Map<string, TaskSessionSummary>();

  for (const agentId of getActiveAgentIds()) {
    const meta = getAgentMeta(agentId);
    if (!meta || meta.kind !== 'agent') continue;

    const output = decodeScrollback(getAgentScrollback(agentId));
    const existing = grouped.get(meta.taskId);
    if (existing) {
      existing.sessionCount += 1;
      if (output.length > 0) {
        existing.latestOutput = latestOutputLine(output);
      }
      continue;
    }

    grouped.set(meta.taskId, {
      taskId: meta.taskId,
      taskName: getTaskName(meta.taskId) || meta.taskId,
      agentId,
      sessionCount: 1,
      command: meta.command,
      latestOutput: latestOutputLine(output),
      status: 'running',
    });
  }

  return [...grouped.values()].sort((left, right) => left.taskName.localeCompare(right.taskName));
}

function findTaskSession(
  taskId: string,
  requestedAgentId?: string,
): { agentId: string; taskId: string; taskName: string; command: string } | null {
  for (const agentId of getActiveAgentIds()) {
    const meta = getAgentMeta(agentId);
    if (!meta || meta.kind !== 'agent' || meta.taskId !== taskId) continue;
    if (requestedAgentId && agentId !== requestedAgentId) continue;
    return {
      agentId,
      taskId: meta.taskId,
      taskName: taskId,
      command: meta.command,
    };
  }
  return null;
}

function readTaskOutput(
  taskId: string,
  requestedAgentId?: string,
  maxChars?: number,
): {
  agentId: string;
  command: string;
  outputTail: string;
  latestOutput: string;
} | null {
  const session = findTaskSession(taskId, requestedAgentId);
  if (!session) return null;
  const outputTail = decodeScrollback(getAgentScrollback(session.agentId), maxChars);
  return {
    agentId: session.agentId,
    command: session.command,
    outputTail,
    latestOutput: latestOutputLine(outputTail),
  };
}

async function sendPromptToTask(
  taskId: string,
  prompt: string,
  requestedAgentId?: string,
): Promise<{
  taskId: string;
  agentId: string;
  command: string;
}> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error('prompt 不能为空');
  }

  const session = findTaskSession(taskId, requestedAgentId);
  if (!session) {
    throw new Error(`未找到运行中的任务会话：${taskId}`);
  }

  writeToAgent(session.agentId, trimmed);
  await new Promise((resolve) => setTimeout(resolve, 50));
  writeToAgent(session.agentId, '\r');

  return {
    taskId,
    agentId: session.agentId,
    command: session.command,
  };
}

function jsonHeaders(_statusCode = 200): Record<string, string | number> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': 'http://127.0.0.1',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff',
  };
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, jsonHeaders(statusCode));
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error('请求体过大');
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};

  const data = JSON.parse(text) as unknown;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('请求体必须是 JSON 对象');
  }
  return data as Record<string, unknown>;
}

async function publishDiscoveryFile(baseUrl: string, port: number): Promise<void> {
  const payload = {
    baseUrl,
    port,
    host: DEFAULT_HOST,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  await mkdir(dirname(DISCOVERY_FILE), { recursive: true });
  await writeFile(DISCOVERY_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function removeDiscoveryFile(): Promise<void> {
  await unlink(DISCOVERY_FILE).catch(() => {});
}

async function listen(server: ReturnType<typeof createServer>, port: number): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const handleListening = () => {
      cleanup();
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('无法确定 OpenClaw Bridge 端口'));
        return;
      }
      resolve(address.port);
    };
    const cleanup = () => {
      server.off('error', handleError);
      server.off('listening', handleListening);
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port, DEFAULT_HOST);
  });
}

export function startOpenClawBridge(options: OpenClawBridgeOptions): OpenClawBridge {
  let ready = false;
  let baseUrl: string | null = null;
  let port: number | null = null;
  let lastError: string | null = null;

  const server = createServer(async (req, res) => {
    if (!req.url) {
      sendJson(res, 400, { error: '缺少请求 URL' });
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, jsonHeaders(204));
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${DEFAULT_HOST}`);

    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, {
          ok: true,
          ready,
          baseUrl,
          port,
          activeTaskCount: listTaskSessions(options.getTaskName).length,
          monitorStatus: options.getGlobalMonitorSnapshot().status,
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/tasks') {
        sendJson(res, 200, {
          tasks: listTaskSessions(options.getTaskName),
        });
        return;
      }

      const taskDetailMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskDetailMatch && req.method === 'GET') {
        const taskId = decodeURIComponent(taskDetailMatch[1]);
        const maxChars = clampOutputChars(url.searchParams.get('maxChars'));
        const output = readTaskOutput(taskId, undefined, maxChars);
        if (!output) {
          sendJson(res, 404, { error: `任务未运行或不存在：${taskId}` });
          return;
        }
        sendJson(res, 200, {
          taskId,
          taskName: options.getTaskName(taskId) || taskId,
          ...output,
          output: output.outputTail,
        });
        return;
      }

      const taskOutputMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/output$/);
      if (taskOutputMatch && req.method === 'GET') {
        const taskId = decodeURIComponent(taskOutputMatch[1]);
        const maxChars = clampOutputChars(url.searchParams.get('maxChars'));
        const output = readTaskOutput(taskId, undefined, maxChars);
        if (!output) {
          sendJson(res, 404, { error: `任务未运行或不存在：${taskId}` });
          return;
        }
        sendJson(res, 200, {
          taskId,
          taskName: options.getTaskName(taskId) || taskId,
          output: output.outputTail,
          latestOutput: output.latestOutput,
          agentId: output.agentId,
          command: output.command,
        });
        return;
      }

      const taskPromptMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/prompt$/);
      if (taskPromptMatch && req.method === 'POST') {
        const taskId = decodeURIComponent(taskPromptMatch[1]);
        const body = await readJsonBody(req);
        const prompt = typeof body.prompt === 'string' ? body.prompt : '';
        const agentId = typeof body.agentId === 'string' ? body.agentId : undefined;
        const result = await sendPromptToTask(taskId, prompt, agentId);
        sendJson(res, 200, {
          ok: true,
          ...result,
          taskName: options.getTaskName(taskId) || taskId,
          prompt,
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/monitor') {
        const refresh = ['1', 'true', 'yes'].includes(
          (url.searchParams.get('refresh') || '').toLowerCase(),
        );
        const snapshot = refresh
          ? await options.runGlobalMonitorNow()
          : options.getGlobalMonitorSnapshot();
        sendJson(res, 200, snapshot);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/monitor/run') {
        const snapshot = await options.runGlobalMonitorNow();
        sendJson(res, 200, snapshot);
        return;
      }

      sendJson(res, 404, { error: 'not found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(res, 500, { error: message });
    }
  });

  server.on('error', (error) => {
    lastError = error instanceof Error ? error.message : String(error);
    console.error('[openclaw-bridge] server error:', lastError);
  });

  void (async () => {
    try {
      const preferredPort = options.preferredPort ?? DEFAULT_PORT;
      try {
        port = await listen(server, preferredPort);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EADDRINUSE' && code !== 'EACCES') {
          throw error;
        }
        port = await listen(server, 0);
      }

      ready = true;
      baseUrl = `http://${DEFAULT_HOST}:${port}`;
      lastError = null;
      await publishDiscoveryFile(baseUrl, port);
      console.warn(`[openclaw-bridge] listening on ${baseUrl}`);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error('[openclaw-bridge] failed to start:', lastError);
    }
  })();

  return {
    getStatus: () => ({
      ready,
      port,
      baseUrl,
      lastError,
    }),
    stop: async () => {
      ready = false;
      await removeDiscoveryFile();
      if (!server.listening) return;
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}
