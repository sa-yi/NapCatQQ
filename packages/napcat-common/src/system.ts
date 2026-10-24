import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

function stableHash (value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 6).toUpperCase();
}

function pickCommonHostname (): string {
  const platform = os.platform();
  const seed = `${platform}:${os.arch()}:${os.release()}:${process.env.USER || process.env.USERNAME || 'user'}`;
  const hash = stableHash(seed);
  const n = parseInt(hash, 16);

  switch (platform) {
    case 'win32': {
      const presets = ['DESKTOP', 'LAPTOP', 'PC'];
      return `${presets[n % presets.length]}-${hash}`;
    }
    case 'darwin': {
      const presets = ['MacBook-Pro', 'MacBook-Air', 'iMac'];
      return presets[n % presets.length];
    }
    case 'linux': {
      const presets = ['ubuntu', 'localhost', 'server-01', 'devbox'];
      return presets[n % presets.length];
    }
    default:
      return 'localhost';
  }
}

export function getEffectiveHostname (): string {
  const envName = process.env['NAPCAT_DEVICE_NAME']?.trim();
  if (envName) return envName.slice(0, 24);

  try {
    const raw = os.hostname();
    if (!raw || raw === 'localhost' || raw === 'DESKTOP' || raw.startsWith('DESKTOP-')) {
      return pickCommonHostname();
    }
    const normalized = raw.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
    return normalized || pickCommonHostname();
  } catch {
    return pickCommonHostname();
  }
}

export function getEffectiveSystemName (): string {
  const envType = process.env['NAPCAT_DEVICE_TYPE']?.trim();
  if (envType) return envType;

  switch (os.platform()) {
    case 'win32': return 'Windows_NT';
    case 'darwin': return 'Darwin';
    case 'linux': return 'Linux';
    default: return 'Linux';
  }
}

let osName: string;

try {
  osName = getEffectiveHostname();
} catch {
  osName = 'localhost';
}

const homeDir = os.homedir();

export const systemPlatform = os.platform();
export const cpuArch = os.arch();
export const systemVersion = os.release();
export const hostname = osName;
export const downloadsPath = path.join(homeDir, 'Downloads');
export const systemName = getEffectiveSystemName();
