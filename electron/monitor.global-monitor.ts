import { getActiveAgentIds, getAgentMeta, getAgentScrollback } from './ipc/pty.js';

const DEFAULT_MODEL = 'MiniMax-M2.5';
const DEFAULT_ENDPOINT = 'https://api.minimaxi.com/v1/text/chatcompletion_v2';
const DEFAULT_INTERVAL_SEC = 90;
const MIN_INTERVAL_SEC = 30;
const MAX_INTERVAL_SEC = 600;
const MAX_TASKS = 8;
const MAX_SESSION_CHARS = 2_400;
const MAX_ALERTS = 3;
const MAX_TASK_INSIGHTS = 8;
const MAX_COMMANDS = 3;
const REQUEST_TIMEOUT_MS = 60_000;
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const OSC_PATTERN = new RegExp(
  `${escapeForRegExp(ESC)}\\][^${escapeForRegExp(BEL)}]*(?:${escapeForRegExp(BEL)}|${escapeForRegExp(ESC)}\\\\)`,
  'g',
);
const CSI_PATTERN = new RegExp(`${escapeForRegExp(ESC)}\\[[0-?]*[ -/]*[@-~]`, 'g');
const ESC_PATTERN = new RegExp(`${escapeForRegExp(ESC)}[@-_]`, 'g');

type MonitorStatus = 'disabled' | 'idle' | 'running' | 'error';
type MonitorSeverity = 'high' | 'medium' | 'low';
type MonitorTaskStatus = 'coding' | 'blocked' | 'waiting' | 'done' | 'idle';

interface MonitorConfig {
  enabled: boolean;
  apiKey: string;
  endpoint: string;
  model: string;
  intervalSec: number;
}

interface MonitorAlert {
  taskId: string;
  taskName: string;
  severity: MonitorSeverity;
  issue: string;
  action: string;
}

interface MonitorTaskInsight {
  taskId: string;
  taskName: string;
  status: MonitorTaskStatus;
  detail: string;
}

interface MonitorCommand {
  taskId: string;
  taskName: string;
  prompt: string;
  rationale: string;
}

interface MonitorSnapshot {
  enabled: boolean;
  hasApiKey: boolean;
  endpoint: string;
  model: string;
  intervalSec: number;
  status: MonitorStatus;
  lastRunAt: string | null;
  lastSummary: string | null;
  lastError: string | null;
  activeTaskCount: number;
  alerts: MonitorAlert[];
  taskInsights: MonitorTaskInsight[];
  commands: MonitorCommand[];
}

interface TaskContext {
  taskId: string;
  taskName: string;
  sessions: Array<{
    agentId: string;
    command: string;
    tail: string;
  }>;
}

interface MiniMaxResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
}

interface RawMonitorResult {
  summary?: unknown;
  alerts?: unknown;
  tasks?: unknown;
  commands?: unknown;
}

function clampIntervalSec(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_INTERVAL_SEC;
  return Math.max(MIN_INTERVAL_SEC, Math.min(MAX_INTERVAL_SEC, Math.round(value)));
}

function normalizeConfig(input: Partial<MonitorConfig>): MonitorConfig {
  const endpoint =
    typeof input.endpoint === 'string' && input.endpoint.trim().length > 0
      ? input.endpoint.trim()
      : DEFAULT_ENDPOINT;
  const model =
    typeof input.model === 'string' && input.model.trim().length > 0
      ? input.model.trim()
      : DEFAULT_MODEL;

  return {
    enabled: input.enabled === true,
    apiKey: typeof input.apiKey === 'string' ? input.apiKey : '',
    endpoint,
    model,
    intervalSec: clampIntervalSec(Number(input.intervalSec)),
  };
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
  const lines = stripAnsi(input)
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line, index, arr) => line.length > 0 || (index > 0 && arr[index - 1].length > 0));
  const joined = lines.join('\n').trim();
  return joined.length > MAX_SESSION_CHARS ? joined.slice(-MAX_SESSION_CHARS) : joined;
}

function countActiveAgentTasks(): number {
  const taskIds = new Set<string>();
  for (const agentId of getActiveAgentIds()) {
    const meta = getAgentMeta(agentId);
    if (!meta || meta.kind !== 'agent') continue;
    taskIds.add(meta.taskId);
  }
  return taskIds.size;
}

function collectTaskContexts(getTaskName: (taskId: string) => string): TaskContext[] {
  const grouped = new Map<string, TaskContext>();

  for (const agentId of getActiveAgentIds()) {
    const meta = getAgentMeta(agentId);
    if (!meta || meta.kind !== 'agent') continue;

    const entry = grouped.get(meta.taskId) ?? {
      taskId: meta.taskId,
      taskName: getTaskName(meta.taskId) || meta.taskId,
      sessions: [],
    };

    const encoded = getAgentScrollback(agentId);
    const raw = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : '';
    const tail = normalizeTerminalText(raw) || '（暂无终端输出）';

    entry.sessions.push({
      agentId,
      command: meta.command,
      tail,
    });
    grouped.set(meta.taskId, entry);
  }

  return [...grouped.values()]
    .sort((left, right) => right.sessions.length - left.sessions.length)
    .slice(0, MAX_TASKS);
}

function extractContentString(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) {
        const text = (part as { text?: unknown }).text;
        return typeof text === 'string' ? text : '';
      }
      return '';
    })
    .join('\n');
}

function extractBalancedJsonObject(input: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (char === '}') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return input.slice(start, index + 1);
      }
    }
  }

  return null;
}

function extractJson(text: string): RawMonitorResult {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;

  try {
    return JSON.parse(candidate) as RawMonitorResult;
  } catch {
    const balanced = extractBalancedJsonObject(candidate);
    if (balanced) {
      return JSON.parse(balanced) as RawMonitorResult;
    }
    throw new Error('MiniMax 返回了无法解析的 JSON');
  }
}

function truncateText(value: unknown, fallback = '', max = 220): string {
  const text = typeof value === 'string' ? value.trim() : fallback;
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function normalizeSeverity(value: unknown): MonitorSeverity {
  const raw = typeof value === 'string' ? value.toLowerCase() : '';
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  if (raw === 'critical' || raw === 'urgent') return 'high';
  if (raw === 'warn' || raw === 'warning') return 'medium';
  return 'low';
}

function normalizeTaskStatus(value: unknown): MonitorTaskStatus {
  const raw = typeof value === 'string' ? value.toLowerCase() : '';
  if (
    raw === 'coding' ||
    raw === 'blocked' ||
    raw === 'waiting' ||
    raw === 'done' ||
    raw === 'idle'
  ) {
    return raw;
  }
  if (raw === 'complete' || raw === 'completed' || raw === 'finished') return 'done';
  if (raw === 'running' || raw === 'working') return 'coding';
  return 'idle';
}

function normalizeAlerts(raw: unknown, contexts: TaskContext[]): MonitorAlert[] {
  if (!Array.isArray(raw)) return [];
  const taskByName = new Map(contexts.map((task) => [task.taskName, task]));
  const taskById = new Map(contexts.map((task) => [task.taskId, task]));

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const data = entry as Record<string, unknown>;
      const matchedTask =
        (typeof data.taskId === 'string' ? taskById.get(data.taskId) : undefined) ??
        (typeof data.taskName === 'string' ? taskByName.get(data.taskName) : undefined) ??
        null;
      return {
        taskId: matchedTask?.taskId ?? (typeof data.taskId === 'string' ? data.taskId : ''),
        taskName:
          matchedTask?.taskName ??
          truncateText(data.taskName, '未命名任务', 80) ??
          matchedTask?.taskId ??
          '未命名任务',
        severity: normalizeSeverity(data.severity),
        issue: truncateText(data.issue, '需要人工关注', 180),
        action: truncateText(data.action, '', 180),
      } satisfies MonitorAlert;
    })
    .filter((entry): entry is MonitorAlert => Boolean(entry && entry.issue))
    .slice(0, MAX_ALERTS);
}

function normalizeTaskInsights(raw: unknown, contexts: TaskContext[]): MonitorTaskInsight[] {
  if (!Array.isArray(raw)) return [];
  const taskByName = new Map(contexts.map((task) => [task.taskName, task]));
  const taskById = new Map(contexts.map((task) => [task.taskId, task]));

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const data = entry as Record<string, unknown>;
      const matchedTask =
        (typeof data.taskId === 'string' ? taskById.get(data.taskId) : undefined) ??
        (typeof data.taskName === 'string' ? taskByName.get(data.taskName) : undefined) ??
        null;
      const taskId = matchedTask?.taskId ?? (typeof data.taskId === 'string' ? data.taskId : '');
      const fallbackTaskName = taskId || '未命名任务';
      const taskName =
        matchedTask?.taskName ??
        truncateText(data.taskName, fallbackTaskName, 80) ??
        fallbackTaskName;

      return {
        taskId,
        taskName,
        status: normalizeTaskStatus(data.status),
        detail: truncateText(data.detail, '暂无更多信息', 200),
      } satisfies MonitorTaskInsight;
    })
    .filter((entry): entry is MonitorTaskInsight => Boolean(entry && entry.taskName))
    .slice(0, MAX_TASK_INSIGHTS);
}

function normalizeCommands(raw: unknown, contexts: TaskContext[]): MonitorCommand[] {
  if (!Array.isArray(raw)) return [];
  const taskByName = new Map(contexts.map((task) => [task.taskName, task]));
  const taskById = new Map(contexts.map((task) => [task.taskId, task]));

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const data = entry as Record<string, unknown>;
      const matchedTask =
        (typeof data.taskId === 'string' ? taskById.get(data.taskId) : undefined) ??
        (typeof data.taskName === 'string' ? taskByName.get(data.taskName) : undefined) ??
        null;
      const taskId = matchedTask?.taskId ?? (typeof data.taskId === 'string' ? data.taskId : '');
      const fallbackTaskName = taskId || '未命名任务';
      const taskName =
        matchedTask?.taskName ??
        truncateText(data.taskName, fallbackTaskName, 80) ??
        fallbackTaskName;
      const prompt = truncateText(data.prompt, '', 260);
      if (!prompt) return null;

      return {
        taskId,
        taskName,
        prompt,
        rationale: truncateText(data.rationale, '建议助手主动推动该任务继续前进。', 180),
      } satisfies MonitorCommand;
    })
    .filter((entry): entry is MonitorCommand => Boolean(entry && entry.taskId && entry.prompt))
    .slice(0, MAX_COMMANDS);
}

function buildPrompt(contexts: TaskContext[]): { system: string; user: string } {
  const system =
    '你是 MouriCode 的全局任务汇报助理。你会观察多个 AI 编码任务的终端输出，判断进展和阻塞点，并汇报每个任务当前状态。只返回 JSON，不要返回 Markdown。';

  const user = [
    `当前时间：${new Date().toISOString()}`,
    '请返回如下 JSON：',
    '{"summary":"一句中文总结，不超过60字","alerts":[{"taskId":"任务ID","taskName":"任务名","severity":"high|medium|low","issue":"阻塞或风险","action":"建议的人类下一步"}],"tasks":[{"taskId":"任务ID","taskName":"任务名","status":"coding|blocked|waiting|done|idle","detail":"一句进展说明"}]}',
    '要求：',
    '1. 优先识别卡住、报错、等待确认、等待测试结果、已经完成但未合并的任务。',
    '2. 如果没有明显风险，alerts 返回空数组。',
    '3. summary 要先说整体状态，再点出最关键事项。',
    '4. 仅基于提供的终端输出做判断，不要编造仓库信息。',
    '',
    ...contexts.map((task, index) => {
      const sessions = task.sessions
        .map(
          (session, sessionIndex) =>
            `  会话 ${sessionIndex + 1} (${session.command || 'unknown'})\n${session.tail}`,
        )
        .join('\n\n');
      return `任务 ${index + 1}\n- taskId: ${task.taskId}\n- taskName: ${task.taskName}\n${sessions}`;
    }),
  ].join('\n');

  return { system, user };
}

async function requestMiniMax(
  config: MonitorConfig,
  contexts: TaskContext[],
): Promise<RawMonitorResult> {
  const apiKey = config.apiKey.trim() || process.env.MINIMAX_API_KEY?.trim() || '';
  if (!apiKey) throw new Error('未配置 MiniMax API Key');

  const { system, user } = buildPrompt(contexts);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    let data: MiniMaxResponse | null = null;
    try {
      data = JSON.parse(text) as MiniMaxResponse;
    } catch {
      data = null;
    }

    const businessStatus = data?.base_resp?.status_code;
    if (businessStatus !== undefined && businessStatus !== 0) {
      const msg = data?.base_resp?.status_msg || text || `status_code ${businessStatus}`;
      throw new Error(`MiniMax 请求失败：${msg}`);
    }

    if (!response.ok) {
      const msg = data?.base_resp?.status_msg || text || `HTTP ${response.status}`;
      throw new Error(`MiniMax 请求失败：${msg}`);
    }

    const content = extractContentString(data?.choices?.[0]?.message?.content);
    if (!content.trim()) {
      throw new Error('MiniMax 返回了空响应');
    }

    return extractJson(content);
  } finally {
    clearTimeout(timeout);
  }
}

export function createGlobalMonitorService(options: { getTaskName: (taskId: string) => string }) {
  let config = normalizeConfig({});
  let status: MonitorStatus = 'disabled';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<MonitorSnapshot> | null = null;
  let lastRunAt: string | null = null;
  let lastSummary: string | null = null;
  let lastError: string | null = null;
  let alerts: MonitorAlert[] = [];
  let taskInsights: MonitorTaskInsight[] = [];
  let commands: MonitorCommand[] = [];

  function hasApiKey(): boolean {
    return (config.apiKey.trim() || process.env.MINIMAX_API_KEY?.trim() || '').length > 0;
  }

  function snapshot(): MonitorSnapshot {
    return {
      enabled: config.enabled,
      hasApiKey: hasApiKey(),
      endpoint: config.endpoint,
      model: config.model,
      intervalSec: config.intervalSec,
      status: config.enabled ? status : 'disabled',
      lastRunAt,
      lastSummary,
      lastError,
      activeTaskCount: countActiveAgentTasks(),
      alerts: [...alerts],
      taskInsights: [...taskInsights],
      commands: [...commands],
    };
  }

  function clearSchedule(): void {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  async function runNow(): Promise<MonitorSnapshot> {
    if (!config.enabled) {
      status = 'disabled';
      clearSchedule();
      return snapshot();
    }
    if (inFlight) return inFlight;

    inFlight = (async () => {
      clearSchedule();
      const contexts = collectTaskContexts(options.getTaskName);
      const now = new Date().toISOString();

      if (contexts.length === 0) {
        status = 'idle';
        lastRunAt = now;
        lastError = null;
        lastSummary = '暂无运行中的 AI 代码任务';
        alerts = [];
        taskInsights = [];
        commands = [];
        clearSchedule();
        return snapshot();
      }

      if (!hasApiKey()) {
        status = 'error';
        lastRunAt = now;
        lastError = '已开启全局助理，但尚未配置 MiniMax API Key。';
        commands = [];
        clearSchedule();
        return snapshot();
      }

      status = 'running';
      lastError = null;

      try {
        const result = await requestMiniMax(config, contexts);
        const normalizedAlerts = normalizeAlerts(result.alerts, contexts);
        const normalizedTasks = normalizeTaskInsights(result.tasks, contexts);
        const summary = truncateText(
          result.summary,
          normalizedAlerts[0]?.issue || '所有任务都在继续推进',
          120,
        );

        alerts = normalizedAlerts;
        taskInsights = normalizedTasks;
        commands = [];
        lastSummary = summary;
        lastRunAt = now;
        lastError = null;
        status = 'idle';
        return snapshot();
      } catch (error) {
        status = 'error';
        lastRunAt = now;
        lastError = error instanceof Error ? error.message : String(error);
        commands = [];
        return snapshot();
      } finally {
        inFlight = null;
        clearSchedule();
      }
    })();

    return inFlight;
  }

  async function updateConfig(next: Partial<MonitorConfig>): Promise<MonitorSnapshot> {
    const wasEnabled = config.enabled;
    const hadApiKey = hasApiKey();
    const previousEndpoint = config.endpoint;
    const previousModel = config.model;
    const previousIntervalSec = config.intervalSec;

    config = normalizeConfig({ ...config, ...next });

    if (!config.enabled) {
      clearSchedule();
      status = 'disabled';
      lastError = null;
      return snapshot();
    }

    const hasValidApiKey = hasApiKey();
    status = hasValidApiKey ? 'idle' : 'error';
    if (hasValidApiKey) {
      lastError = null;
    }

    const configChanged =
      previousEndpoint !== config.endpoint ||
      previousModel !== config.model ||
      previousIntervalSec !== config.intervalSec;
    if (!wasEnabled || (!hadApiKey && hasValidApiKey) || configChanged) {
      clearSchedule();
    }
    return snapshot();
  }

  return {
    getState: snapshot,
    runNow,
    updateConfig,
  };
}
