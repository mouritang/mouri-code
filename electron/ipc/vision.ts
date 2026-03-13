import fs from 'fs';
import path from 'path';

const DEFAULT_OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
const REQUEST_TIMEOUT_MS = 45_000;

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function normalizeExt(p: string): string {
  return path.extname(p).toLowerCase();
}

function guessMimeType(filePath: string): string {
  const ext = normalizeExt(filePath);
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

function imageFileToDataUrl(filePath: string): { mime: string; url: string } {
  const ext = normalizeExt(filePath);
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(`不支持的图片格式：${ext || 'unknown'}（仅支持 PNG/JPG/WebP/GIF）`);
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error('图片路径不是文件');
  if (stat.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `图片太大（${Math.round(stat.size / 1024 / 1024)}MB），请压缩后再试（单张上限 8MB）`,
    );
  }

  const buf = fs.readFileSync(filePath);
  const mime = guessMimeType(filePath);
  return { mime, url: `data:${mime};base64,${buf.toString('base64')}` };
}

function extractContent(json: unknown): string {
  const root = asRecord(json);
  const choices = root?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const choice0 = asRecord(choices[0]);
  const message = asRecord(choice0?.message);
  const content = message?.content;
  return typeof content === 'string' ? content : '';
}

export async function describeImages(args: {
  prompt: string;
  imagePaths: string[];
  apiKey?: string;
  endpoint?: string;
  model?: string;
}): Promise<string> {
  const prompt = args.prompt?.trim() ?? '';
  if (!prompt) throw new Error('prompt 不能为空');

  const imagePaths = Array.isArray(args.imagePaths) ? args.imagePaths : [];
  if (imagePaths.length === 0) throw new Error('未提供图片');
  if (imagePaths.length > MAX_IMAGES) throw new Error(`最多支持 ${MAX_IMAGES} 张图片`);

  const apiKey = (args.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim() || '').trim();
  if (!apiKey)
    throw new Error('未配置 OpenAI API Key（可在设置中填写，或使用环境变量 OPENAI_API_KEY）');

  const endpoint = (args.endpoint?.trim() || DEFAULT_OPENAI_ENDPOINT).trim();
  const model = (args.model?.trim() || DEFAULT_OPENAI_MODEL).trim();

  const images = imagePaths.map((p) => imageFileToDataUrl(p));

  const system =
    '你是一个视觉助手。用户会附上图片（通常是软件界面截图、报错截图、终端输出、网页）。' +
    '请用中文输出：1) 图片内容的简要描述；2) 重要的可复制文本（尤其是报错、路径、命令、按钮文案）；' +
    '3) 你建议的下一步（最多3条，尽量具体）。输出不要使用 Markdown 代码块。';

  const content = [
    { type: 'text', text: prompt },
    ...images.map((img) => ({ type: 'image_url', image_url: { url: img.url } })),
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    const root = asRecord(json);
    const error = asRecord(root?.error);
    const errMsg = typeof error?.message === 'string' ? error.message : '';
    if (!response.ok) {
      throw new Error(
        `视觉请求失败：${typeof errMsg === 'string' && errMsg.trim() ? errMsg : `HTTP ${response.status}`}`,
      );
    }

    const out = extractContent(json).trim();
    if (!out) {
      throw new Error('视觉模型返回了空结果');
    }
    return out;
  } finally {
    clearTimeout(timeout);
  }
}
