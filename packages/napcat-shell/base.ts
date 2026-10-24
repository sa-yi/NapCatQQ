import { NapCatPathWrapper } from 'napcat-common/src/path';
import { getEffectiveHostname, hostname, systemVersion } from 'napcat-common/src/system';
import { loadNapcatConfig } from '@/napcat-core/helper/config';
import fs from 'fs';
import path from 'path';

function normalizeGuid (guid?: string): string | undefined {
  if (!guid) return undefined;
  const cleaned = guid.replace(/-/g, '').replace(/[^a-fA-F0-9]/g, '').slice(0, 32);
  if (cleaned.length !== 32) return undefined;
  return `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}-${cleaned.slice(16, 20)}-${cleaned.slice(20, 32)}`;
}

function buildGuidFromSeed (seed: string): string {
  const hash = require('node:crypto').createHash('sha256').update(seed).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

async function initializeLoginService (
  loginService: NodeIKernelLoginService,
  basicInfoWrapper: QQBasicInfoWrapper,
  dataPathGlobal: string,
  systemVersion: string,
  hostname: string
) {
  loginService.initConfig({
    machineId: '',
    appid: basicInfoWrapper.QQVersionAppid ?? '',
    platVer: systemVersion,
    commonPath: dataPathGlobal,
    clientVer: basicInfoWrapper.getFullQQVersion(),
    hostName: hostname,
    externalVersion: false,
  });
}

export async function NCoreInitShell () {
  console.log('NapCat Shell App Loading...');
  const pathWrapper = new NapCatPathWrapper();
  const logger = new LogWrapper(pathWrapper.logsPath);
  if (process.env['NAPCAT_WORKER_PROCESS'] !== '1' && process.env['NAPCAT_DISABLE_MULTI_PROCESS'] !== '1' && process.env['NAPCAT_DISABLE_MULTIPROCESSING'] !== '1') {
    logger.setFileLogEnabled(false);
  }

  const napcatConfig = loadNapcatConfig(pathWrapper.configPath);
  const antiDetect = napcatConfig.antiDetect;
  if (antiDetect?.enabled !== false) {
    if (antiDetect?.deviceName) process.env['NAPCAT_DEVICE_NAME'] = antiDetect.deviceName;
    if (antiDetect?.deviceType) process.env['NAPCAT_DEVICE_TYPE'] = antiDetect.deviceType;
    if (antiDetect?.machineGuid) process.env['NAPCAT_MACHINE_GUID'] = antiDetect.machineGuid;
    if (antiDetect?.guidSeed) process.env['NAPCAT_GUID_SEED'] = antiDetect.guidSeed;
    if (antiDetect?.appid) process.env['NAPCAT_QQ_APPID'] = antiDetect.appid;
    if (antiDetect?.qua) process.env['NAPCAT_QQ_QUA'] = antiDetect.qua;
  }

  const runtimeHostname = getEffectiveHostname();
  const effectiveSystemName = process.env['NAPCAT_DEVICE_TYPE']?.trim() || 'Windows';

  const basicInfoWrapper = new QQBasicInfoWrapper({ logger });
  const wrapper = loadQQWrapper(basicInfoWrapper.QQMainPath, basicInfoWrapper.getFullQQVersion());
  const nativePacketHandler = new NativePacketHandler({ logger });
  const napi2nativeLoader = new Napi2NativeLoader({ logger });
  const engine = wrapper.NodeIQQNTWrapperEngine.get();
  const loginService = wrapper.NodeIKernelLoginService.get();

  await initializeEngine(engine, basicInfoWrapper, dataPathGlobal, systemPlatform, systemVersion);
  await initializeLoginService(loginService, basicInfoWrapper, dataPathGlobal, systemVersion, runtimeHostname);

  const selfInfo = await handleLogin(loginService, logger, pathWrapper, quickLoginUin, historyLoginList);

  let guid = normalizeGuid(process.env['NAPCAT_MACHINE_GUID'] ?? antiDetect?.machineGuid) || normalizeGuid(loginService.getMachineGuid()) || buildGuidFromSeed(`${selfInfo.uin}:${runtimeHostname}:${antiDetect?.guidSeed || 'NapCat'}`);
  guid = guid.slice(0, 8) + '-' + guid.slice(8, 12) + '-' + guid.slice(12, 16) + '-' + guid.slice(16, 20) + '-' + guid.slice(20);

  const sessionConfig = await genSessionConfig(
    guid,
    basicInfoWrapper.QQVersionAppid,
    basicInfoWrapper.getFullQQVersion(),
    selfInfo.uin,
    selfInfo.uid,
    dataPath
  );

  return sessionConfig;
}
