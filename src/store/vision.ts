import { IPC } from '../../electron/ipc/channels';
import { invoke } from '../lib/ipc';
import { setStore, store } from './core';
import { DEFAULT_VISION_ENDPOINT, DEFAULT_VISION_MODEL } from './visionDefaults';

export function setVisionEnabled(enabled: boolean): void {
  setStore('vision', 'enabled', enabled);
}

export function setVisionApiKey(apiKey: string): void {
  setStore('vision', 'apiKey', apiKey);
}

export function setVisionEndpoint(endpoint: string): void {
  setStore('vision', 'endpoint', endpoint || DEFAULT_VISION_ENDPOINT);
}

export function setVisionModel(model: string): void {
  setStore('vision', 'model', model || DEFAULT_VISION_MODEL);
}

export async function describeImages(prompt: string, imagePaths: string[]): Promise<string> {
  const trimmedPrompt = prompt.trim() || '请解析我附上的图片，并提取关键可复制文本。';
  const endpoint = store.vision.endpoint.trim() || DEFAULT_VISION_ENDPOINT;
  const model = store.vision.model.trim() || DEFAULT_VISION_MODEL;

  const out = await invoke<{ description: string }>(IPC.VisionDescribeImages, {
    prompt: trimmedPrompt,
    imagePaths,
    apiKey: store.vision.apiKey,
    endpoint,
    model,
  });
  return out.description;
}
