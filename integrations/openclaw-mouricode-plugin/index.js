import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_BASE_URL = 'http://127.0.0.1:7788';
const DISCOVERY_PATH = path.join(os.homedir(), '.clawdbot', 'mouricode-bridge.json');
const DEFAULT_TIMEOUT_MS = 15_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 180_000;

function asObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function s(v, d = '') {
  return typeof v === 'string' ? v.trim() || d : d;
}

function n(v, d) {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : d;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function cfg(api) {
  const c = asObj(api.pluginConfig);
  const hasBaseUrl = Object.prototype.hasOwnProperty.call(c, 'baseUrl');
  const explicitBaseUrl = s(c.baseUrl, '');
  const discoveryBaseUrl = readDiscoveryBaseUrl();
  const resolvedBaseUrl =
    (!hasBaseUrl || !explicitBaseUrl || explicitBaseUrl === DEFAULT_BASE_URL) && discoveryBaseUrl
      ? discoveryBaseUrl
      : explicitBaseUrl || DEFAULT_BASE_URL;
  const baseUrl = resolvedBaseUrl.replace(/\/+$/, '');
  const requestTimeoutMs = clamp(
    Math.trunc(n(c.requestTimeoutMs, DEFAULT_TIMEOUT_MS)),
    MIN_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
  );
  return { baseUrl, requestTimeoutMs };
}

function ensureString(v, key) {
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`${key} is required`);
  }
  return v.trim();
}

function readDiscoveryBaseUrl() {
  try {
    const raw = fs.readFileSync(DISCOVERY_PATH, 'utf8');
    const payload = JSON.parse(raw);
    return typeof payload?.baseUrl === 'string' && payload.baseUrl.trim()
      ? payload.baseUrl.trim()
      : '';
  } catch {
    return '';
  }
}

function result(details, text) {
  return {
    content: [{ type: 'text', text: text || JSON.stringify(details, null, 2) }],
    details,
  };
}

function toolFailure(tool, err, extraDetails) {
  const message = err instanceof Error ? err.message : String(err);
  const details = {
    ok: false,
    tool,
    error: message,
    ...asObj(extraDetails),
  };
  const text = `[mouricode] ${tool} failed: ${message}`;
  return result(details, text);
}

function joinUrl(baseUrl, path) {
  const cleanPath = String(path || '').startsWith('/') ? String(path || '') : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

function looksLikeJson(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

async function requestJson(api, method, path, opts) {
  const c = cfg(api);
  const query = asObj(opts?.query);
  const body = opts?.body;
  const headers = { ...(asObj(opts?.headers) || {}) };

  const url = new URL(joinUrl(c.baseUrl, path));
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), c.requestTimeoutMs);

  let res;
  let text = '';
  try {
    if (body !== undefined) {
      headers['Content-Type'] ??= 'application/json';
    }

    res = await fetch(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });

    text = await res.text();
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const isJson = ct.includes('application/json') || looksLikeJson(text);

    const parsed =
      isJson && text.trim()
        ? (() => {
            try {
              return JSON.parse(text);
            } catch {
              return null;
            }
          })()
        : null;

    const data = parsed ?? (text.trim() ? { raw: text } : null);

    if (!res.ok) {
      const err = new Error(
        `HTTP ${res.status} ${res.statusText}` +
          (text.trim() ? `: ${text.trim().slice(0, 400)}` : ''),
      );
      err.details = { status: res.status, statusText: res.statusText, data };
      throw err;
    }

    return {
      ok: true,
      url: url.toString(),
      status: res.status,
      data,
    };
  } finally {
    clearTimeout(t);
  }
}

function normalizeTasks(payload) {
  if (Array.isArray(payload)) return payload;
  const obj = asObj(payload);
  if (Array.isArray(obj.tasks)) return obj.tasks;
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.list)) return obj.list;
  return [];
}

function taskLine(task) {
  const t = asObj(task);
  const id = s(t.taskId, s(t.id, ''));
  const name = s(t.taskName, s(t.name, ''));
  const status = s(t.status, '');
  const bits = [];
  if (id) bits.push(id);
  if (name) bits.push(name);
  if (status) bits.push(`[${status}]`);
  return bits.length ? `- ${bits.join(' ')}` : `- ${JSON.stringify(t)}`;
}

function extractOutput(payload) {
  if (typeof payload === 'string') return payload;
  const obj = asObj(payload);
  const out =
    typeof obj.output === 'string'
      ? obj.output
      : typeof obj.text === 'string'
        ? obj.text
        : typeof obj.tail === 'string'
          ? obj.tail
          : '';
  return out;
}

export default function register(api) {
  api.registerTool({
    name: 'mouricode_list_tasks',
    description: 'List active MouriCode tasks (from local MouriCode bridge).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        activeOnly: { type: 'boolean', default: true },
      },
    },
    async execute(_id, params) {
      try {
        const activeOnly = params?.activeOnly !== false;
        const out = await requestJson(api, 'GET', '/api/tasks', {
          query: { activeOnly: activeOnly ? '1' : '0' },
        });
        const tasks = normalizeTasks(out.data);
        const text = tasks.length
          ? ['MouriCode tasks:', ...tasks.map(taskLine)].join('\n')
          : 'MouriCode tasks: (none)';
        return result(
          { ok: true, tool: 'mouricode_list_tasks', request: { url: out.url }, data: out.data },
          text,
        );
      } catch (err) {
        return toolFailure('mouricode_list_tasks', err, { input: params || {} });
      }
    },
  });

  api.registerTool({
    name: 'mouricode_get_monitor_snapshot',
    description:
      'Get MouriCode global monitor snapshot. Set refresh=true to ask the bridge to run a new snapshot first.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        refresh: { type: 'boolean', default: false },
      },
    },
    async execute(_id, params) {
      try {
        const refresh = params?.refresh === true;
        const out = refresh
          ? await requestJson(api, 'POST', '/api/monitor/run', {})
          : await requestJson(api, 'GET', '/api/monitor', {});

        const text = [
          `MouriCode monitor snapshot${refresh ? ' (refreshed)' : ''}:`,
          JSON.stringify(out.data, null, 2),
        ].join('\n');
        return result(
          {
            ok: true,
            tool: 'mouricode_get_monitor_snapshot',
            refreshed: refresh,
            request: { url: out.url },
            data: out.data,
          },
          text,
        );
      } catch (err) {
        return toolFailure('mouricode_get_monitor_snapshot', err, { input: params || {} });
      }
    },
  });

  api.registerTool({
    name: 'mouricode_get_task_output',
    description:
      "Fetch a task's terminal output (scrollback/tail) by taskId from local MouriCode bridge.",
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['taskId'],
      properties: {
        taskId: { type: 'string', description: 'MouriCode task id' },
        maxChars: { type: 'integer', minimum: 200, maximum: 200000, default: 8000 },
      },
    },
    async execute(_id, params) {
      try {
        const taskId = ensureString(params?.taskId, 'taskId');
        const maxChars = clamp(Math.trunc(n(params?.maxChars, 8000)), 200, 200000);
        const out = await requestJson(
          api,
          'GET',
          `/api/tasks/${encodeURIComponent(taskId)}/output`,
          {
            query: { maxChars: String(maxChars) },
          },
        );
        const output = extractOutput(out.data);
        const text = output
          ? [`Task ${taskId} output:`, output].join('\n')
          : `Task ${taskId} output: (empty)`;
        return result(
          {
            ok: true,
            tool: 'mouricode_get_task_output',
            taskId,
            request: { url: out.url },
            data: out.data,
          },
          text,
        );
      } catch (err) {
        return toolFailure('mouricode_get_task_output', err, { input: params || {} });
      }
    },
  });

  api.registerTool({
    name: 'mouricode_send_prompt',
    description: 'Send a prompt/command to a running task (by taskId) via local MouriCode bridge.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['taskId', 'prompt'],
      properties: {
        taskId: { type: 'string', description: 'MouriCode task id' },
        prompt: {
          type: 'string',
          description: "Prompt/command to send to the task's agent terminal",
        },
      },
    },
    async execute(_id, params) {
      try {
        const taskId = ensureString(params?.taskId, 'taskId');
        const prompt = ensureString(params?.prompt, 'prompt');
        const out = await requestJson(
          api,
          'POST',
          `/api/tasks/${encodeURIComponent(taskId)}/prompt`,
          {
            body: { prompt },
          },
        );
        const text = `Sent prompt to task ${taskId}.`;
        return result(
          {
            ok: true,
            tool: 'mouricode_send_prompt',
            taskId,
            request: { url: out.url },
            data: out.data,
          },
          text,
        );
      } catch (err) {
        return toolFailure('mouricode_send_prompt', err, { input: params || {} });
      }
    },
  });
}
