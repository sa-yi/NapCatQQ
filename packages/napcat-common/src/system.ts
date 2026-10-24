import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

function stableHash (value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function getEffectiveHostname (): string {
  const envName = process.env['NAPCAT_DEVICE_NAME']?.trim();
  if (envName) return envName.slice(0, 24);

  try {
    const raw = os.hostname();
    if (!raw || raw === 'localhost' || raw === 'DESKTOP' || raw.startsWith('DESKTOP-')) {
      return `NapCat-${stableHash(`${os.platform()}:${os.arch()}:${process.pid}`).slice(0, 8)}`;
    }
    const normalized = raw.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
    return normalized || `NapCat-${stableHash(`${os.platform()}:${os.arch()}:${process.pid}`).slice(0, 8)}`;
  } catch {
    return `NapCat-${stableHash(`${os.platform()}:${os.arch()}:${process.pid}`).slice(0, 8)}`;
  }
}

export function getEffectiveSystemName (): string {
  return process.env['NAPCAT_DEVICE_TYPE']?.trim() || os.type();
}

// 缓解Win7设备兼容性问题
let osName: string;

try {
  osName = getEffectiveHostname();
} catch {
  osName = 'NapCat';
}

const homeDir = os.homedir();

export const systemPlatform = os.platform();
export const cpuArch = os.arch();
export const systemVersion = os.release();
export const hostname = osName;
export const downloadsPath = path.join(homeDir, 'Downloads');
export const systemName = getEffectiveSystemName();
