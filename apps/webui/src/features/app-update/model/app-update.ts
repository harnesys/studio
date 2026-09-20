import { getVersion } from '@tauri-apps/api/app';
import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { relaunch } from '@tauri-apps/plugin-process';
import type { Update } from '@tauri-apps/plugin-updater';
import { check } from '@tauri-apps/plugin-updater';

const RELEASES_URL = 'https://github.com/harnesys/studio/releases';
const AUTO_UPDATE_STORAGE_KEY = 'harnesys.app-update.auto';

export function isDesktop(): boolean {
  return isTauri();
}

export function releaseUrl(version: string | null): string {
  return version ? `${RELEASES_URL}/tag/v${version}` : RELEASES_URL;
}

export async function openReleaseNotes(version: string | null): Promise<void> {
  if (!isDesktop()) {
    window.open(releaseUrl(version), '_blank', 'noreferrer');
    return;
  }
  await openUrl(releaseUrl(version));
}

export function readAutoUpdatePreference(): boolean {
  try {
    return localStorage.getItem(AUTO_UPDATE_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeAutoUpdatePreference(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_UPDATE_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    return;
  }
}

export async function desktopVersion(): Promise<string | null> {
  if (!isDesktop()) {
    return null;
  }
  try {
    return await getVersion();
  } catch {
    return null;
  }
}

export function fetchUpdate(): Promise<Update | null> {
  return check();
}

export async function installUpdate(
  update: Update,
  onProgress: (downloaded: number, total: number | null) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | null = null;
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? null;
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
    } else {
      return;
    }
    onProgress(downloaded, total);
  });
}

export async function relaunchApp(): Promise<void> {
  await relaunch();
}
