import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

function stableId (value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

function resolveHostname (): string {
  const envName = process.env['NAPCAT_DEVICE_NAME']?.trim();
  if (envName) return envName.slice(0, 24);

  try {
    const raw = os.hostname();
    if (!raw || raw === 'localhost' || raw === 'DESKTOP' || raw.startsWith('DESKTOP-')) {
      return `NapCat-${stableId(`${os.platform()}:${os.arch()}:${process.pid}`)}`;
    }
    const normalized = raw.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
    return normalized || `NapCat-${stableId(`${os.platform()}:${os.arch()}:${process.pid}`)}`;
  } catch {
    return `NapCat-${stableId(`${os.platform()}:${os.arch()}:${process.pid}`)}`;
  }
}

// 缓解Win7设备兼容性问题
let osName: string;

try {
  osName = resolveHostname();
} catch {
  osName = 'NapCat';
}

const homeDir = os.homedir();

export const systemPlatform = os.platform();
export const cpuArch = os.arch();
export const systemVersion = os.release();
export const hostname = osName;
export const downloadsPath = path.join(homeDir, 'Downloads');
export const systemName = os.type();
