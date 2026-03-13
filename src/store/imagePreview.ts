import { setStore } from './core';

export function openImagePreview(filePath: string, title?: string): void {
  setStore('imagePreview', 'filePath', filePath);
  setStore('imagePreview', 'title', title ?? null);
}

export function closeImagePreview(): void {
  setStore('imagePreview', 'filePath', null);
  setStore('imagePreview', 'title', null);
}
