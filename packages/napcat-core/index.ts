import { hostname, systemName, systemVersion } from 'napcat-common/src/system';
import { NodeIKernelMsgListener, NodeIKernelProfileListener } from '@/napcat-core/listeners';
import { proxiedListenerOf } from '@/napcat-core/helper/proxy-handler';
import { NTQQPacketApi } from './apis/packet';
import { NativePacketHandler } from './packet/handler/client';
import { Napi2NativeLoader } from './packet/handler/napi2nativeLoader';
import { container, ReceiverServiceRegistry } from './packet/handler/serviceRegister';
import { appEvent } from './packet/handler/eventList';
import { TypedEventEmitter } from './packet/handler/typeEvent';
import { hookGlobalDateNow } from './helper/server-time';
export * from './wrapper';
export * from './types/index';
export * from './services/index';
export * from './listeners/index';
export * from './apis/index';
export * from './helper/log';
export * from './helper/qq-basic-info';
export * from './helper/event';
export * from './helper/config';
export * from './helper/config-base';
export * from './helper/proxy-handler';
export * from './helper/session-proxy';
export * from './helper/server-time';

export enum NapCatCoreWorkingEnv {
  Unknown = 0,
  Shell = 1,
  Framework = 2,
}

function dlopenWrapper (wrapperPath: string): WrapperNodeApi {
  const nativemodule: { exports: WrapperNodeApi; } = { exports: {} as WrapperNodeApi };
  try {
    process.dlopen(nativemodule, wrapperPath);
  } catch (error) {
    const mfplatPath = path.join(process.env['SystemRoot'] || 'C:\\Windows', 'System32', 'mfplat.dll');
    if (os.platform() === 'win32' && !fs.existsSync(mfplatPath)) {
      throw new Error(
        '加载 wrapper.node 失败：系统缺少「媒体基础」组件（找不到 mfplat.dll），Windows Server 默认不安装它。' +
        '请在服务器管理器的「添加角色和功能」里勾选「媒体基础」，' +
        '或在管理员 PowerShell 中执行 Install-WindowsFeature Server-Media-Foundation，重启后再启动。' +
        `原始错误：${(error as Error).message}`
      );
    }
    throw error;
  }
  return nativemodule.exports;
}

export function loadQQWrapper (execPath: string | undefined, QQVersion: string): WrapperNodeApi {
  if (process.env['NAPCAT_WRAPPER_PATH']) {
    return dlopenWrapper(process.env['NAPCAT_WRAPPER_PATH']);
  }
  if (!execPath) {
    throw new Error('无法加载Wrapper，execPath未定义');
  }
  let appPath;
  if (os.platform() === 'darwin') {
    appPath = path.resolve(path.dirname(execPath), '../Resources/app');
  } else if (os.platform() === 'linux') {
    appPath = path.resolve(path.dirname(execPath), './resources/app');
  } else {
    appPath = path.resolve(path.dirname(execPath), `./versions/${QQVersion}/`);
  }
  let wrapperNodePath = path.resolve(appPath, 'wrapper.node');
  if (!fs.existsSync(wrapperNodePath)) {
    wrapperNodePath = path.join(appPath, './resources/app/wrapper.node');
  }
  if (!fs.existsSync(wrapperNodePath)) {
    wrapperNodePath = path.join(path.dirname(execPath), `./resources/app/versions/${QQVersion}/wrapper.node`);
  }
  const exports = dlopenWrapper(wrapperNodePath);
  process.env['NAPCAT_WRAPPER_PATH'] = wrapperNodePath;
  return exports;
}

export function getMajorPath (execPath: string, QQVersion: string): string {
  let appPath;
  if (os.platform() === 'darwin') {
    appPath = path.resolve(path.dirname(execPath), '../Resources/app');
  } else if (os.platform() === 'linux') {
    appPath = path.resolve(path.dirname(execPath), './resources/app');
  } else {
    appPath = path.resolve(path.dirname(execPath), `./versions/${QQVersion}/`);
  }
  let majorPath = path.resolve(appPath, 'major.node');
  if (!fs.existsSync(majorPath)) {
    majorPath = path.join(appPath, './resources/app/major.node');
  }
  if (!fs.existsSync(majorPath)) {
    majorPath = path.join(path.dirname(execPath), `./resources/app/versions/${QQVersion}/major.node`);
  }
  return majorPath;
}

function buildCommonDeviceInfo (guid: string, qqVersion: string) {
  const platform = os.platform();
  const deviceName = process.env['NAPCAT_DEVICE_NAME']?.trim() || (
    platform === 'win32' ? `DESKTOP-${stableHash(`${qqVersion}:${guid}`).slice(0, 6)}`
      : platform === 'darwin' ? 'MacBook-Pro'
        : 'ubuntu'
  );
  const deviceType = process.env['NAPCAT_DEVICE_TYPE']?.trim() || (
    platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux'
  );

  return {
    guid,
    buildVer: qqVersion,
    localId: 2052,
    devName: deviceName,
    devType: deviceType,
    vendorName: '',
    osVer: systemVersion,
    vendorOsName: deviceType,
    setMute: false,
    vendorType: VendorType.KNOSETONIOS,
  };
}

export class NapCatCore {
  readonly context: InstanceContext;
  readonly eventWrapper: NTEventWrapper;
  event = appEvent;
  NapCatDataPath: string = '';
  NapCatTempPath: string = '';
  apis: StableNTApiWrapper;
  selfInfo: SelfInfo;
  util: NodeQQNTWrapperUtil;
  configLoader: NapCatConfigLoader;
  dbPassphrase: string | undefined;

  constructor (context: InstanceContext, selfInfo: SelfInfo) {
    this.selfInfo = selfInfo;
    this.eventWrapper = new NTEventWrapper(context.session);
    if (process.env['NAPCAT_SESSION_PROXY'] === '1') {
      const proxiedSession = createSessionProxy(context.session, this.eventWrapper);
      this.context = { ...context, session: proxiedSession };
    } else {
      this.context = context;
    }
    this.util = this.context.wrapper.NodeQQNTWrapperUtil;
    this.configLoader = new NapCatConfigLoader(this, this.context.pathWrapper.configPath, NapcatConfigSchema);
    this.apis = {
      FileApi: new NTQQFileApi(this.context, this),
      SystemApi: new NTQQSystemApi(this.context, this),
      CollectionApi: new NTQQCollectionApi(this.context, this),
      PacketApi: new NTQQPacketApi(this.context, this),
      WebApi: new NTQQWebApi(this.context, this),
      FriendApi: new NTQQFriendApi(this.context, this),
      MsgApi: new NTQQMsgApi(this.context, this),
      UserApi: new NTQQUserApi(this.context, this),
      GroupApi: new NTQQGroupApi(this.context, this),
      FlashApi: new NTQQFlashApi(this.context, this),
      OnlineApi: new NTQQOnlineApi(this.context, this),
      DatabaseApi: new NTQQDatabaseApi(this.context, this),
    };
    container.bind(NapCatCore).toConstantValue(this);
    container.bind(TypedEventEmitter).toConstantValue(this.event);
    ReceiverServiceRegistry.forEach((ServiceClass, serviceName) => {
      container.bind(ServiceClass).toSelf();
      this.context.packetHandler.onCmd(serviceName, ({ seq, hex_data }) => {
        const serviceInstance = container.get(ServiceClass);
        return serviceInstance.handler(seq, hex_data);
      });
    });
  }

  async initCore () {
    this.NapCatDataPath = path.join(this.dataPath, 'NapCat');
    fs.mkdirSync(this.NapCatDataPath, { recursive: true });
    this.NapCatTempPath = path.join(this.NapCatDataPath, 'temp');
    if (!fs.existsSync(this.NapCatTempPath)) {
      fs.mkdirSync(this.NapCatTempPath, { recursive: true });
    }
    if (process.env['NAPCAT_DISABLE_TIME_SYNC'] === '1' || !this.configLoader.configData.autoTimeSync) {
      this.context.logger.log('[ServerTime] 自动对时已禁用');
    } else {
      const doTimeSync = () => {
        try {
          const offsetMs = hookGlobalDateNow(() => this.context.session.getMSFService().getServerTime());
          if (Math.abs(offsetMs) > 5000) {
            this.context.logger.logWarn(`[ServerTime] 本地时间与服务器时间偏差 ${(offsetMs / 1000).toFixed(1)}s，已自动矫正`);
          } else {
            this.context.logger.log(`[ServerTime] 时间同步完成，偏差 ${offsetMs}ms`);
          }
        } catch (e) {
          this.context.logger.logError('[ServerTime] 时间矫正失败', e);
        }
      };
      doTimeSync();
      const syncTimer = setInterval(doTimeSync, 3600000);
      syncTimer.unref();
    }
    for (const apiKey in this.apis) {
      const api = this.apis[apiKey as keyof StableNTApiWrapper];
      if ('initApi' in api && typeof api.initApi === 'function') {
        await api.initApi();
      }
    }
    this.initNapCatCoreListeners().then().catch((e) => this.context.logger.logError(e));

    this.context.logger.setFileLogEnabled(this.configLoader.configData.fileLog);
    this.context.logger.setConsoleLogEnabled(this.configLoader.configData.consoleLog);
    this.context.logger.setFileAndConsoleLogLevel(
      this.configLoader.configData.fileLogLevel as LogLevel,
      this.configLoader.configData.consoleLogLevel as LogLevel
    );
  }

  get dataPath (): string {
    let result = this.context.wrapper.NodeQQNTWrapperUtil.getNTUserDataInfoConfig();
    if (!result) {
      result = path.resolve(os.homedir(), './.config/QQ');
      fs.mkdirSync(result, { recursive: true });
    }
    return result;
  }

  async initNapCatCoreListeners () {
    const msgListener = new NodeIKernelMsgListener();
    msgListener.onRecvOnlineFileMsg = (msgs: RawMessage[]) => {
      msgs.forEach(msg => this.context.logger.logMessage(msg, this.selfInfo));
    };
    msgListener.onKickedOffLine = (Info: KickedOffLineInfo) => {
      const tips = `[KickedOffLine] [${Info.tipsTitle}] ${Info.tipsDesc}`;
      this.context.logger.logError(tips);
      this.selfInfo.online = false;
      this.event.emit('KickedOffLine', tips);
    };
    msgListener.onRecvMsg = (msgs) => {
      msgs.forEach(msg => this.context.logger.logMessage(msg, this.selfInfo));
    };
    msgListener.onAddSendMsg = (msg) => {
      this.context.logger.logMessage(msg, this.selfInfo);
    };
    this.context.session.getMsgService().addKernelMsgListener(
      proxiedListenerOf(msgListener, this.context.logger)
    );

    const profileListener = new NodeIKernelProfileListener();
    profileListener.onProfileDetailInfoChanged = (profile) => {
      if (profile.uid === this.selfInfo.uid) {
        Object.assign(this.selfInfo, profile);
      }
    };
    profileListener.onSelfStatusChanged = (Info: SelfStatusInfo) => {
      if (Info.status === 20) {
        const wasOnline = this.selfInfo.online === true;
        this.selfInfo.online = false;
        this.context.logger.log('账号状态变更为离线');
        if (wasOnline) {
          this.event.emit('SelfOffline', '[SelfOffline] 账号状态变更为离线（未收到 KickedOffLine 通知）');
        }
      } else {
        this.selfInfo.online = true;
      }
    };
    this.context.session.getProfileService().addKernelProfileListener(
      proxiedListenerOf(profileListener, this.context.logger)
    );
  }
}

export async function genSessionConfig (
  guid: string,
  QQVersionAppid: string,
  QQVersion: string,
  selfUin: string,
  selfUid: string,
  account_path: string
): Promise<WrapperSessionInitConfig> {
  const downloadPath = path.join(account_path, 'NapCat', 'temp');
  fs.mkdirSync(downloadPath, { recursive: true });
  const platformMapping: Partial<Record<NodeJS.Platform, PlatformType>> = {
    win32: PlatformType.KWINDOWS,
    darwin: PlatformType.KMAC,
    linux: PlatformType.KLINUX,
  };
  const systemPlatform = platformMapping[os.platform()] ?? PlatformType.KWINDOWS;
  const deviceInfo = buildCommonDeviceInfo(guid, QQVersion);
  return {
    selfUin,
    selfUid,
    desktopPathConfig: { account_path },
    clientVer: QQVersion,
    a2: '',
    d2: '',
    d2Key: '',
    machineId: '',
    platform: systemPlatform,
    platVer: systemVersion,
    appid: QQVersionAppid,
    rdeliveryConfig: {
      appKey: '',
      systemId: 0,
      appId: '',
      logicEnvironment: '',
      platform: systemPlatform,
      language: '',
      sdkVersion: '',
      userId: '',
      appVersion: '',
      osVersion: '',
      bundleId: '',
      serverUrl: '',
      fixedAfterHitKeys: [''],
    },
    defaultFileDownloadPath: downloadPath,
    deviceInfo,
    deviceConfig: '{"appearance":{"isSplitViewMode":true},"msg":{}}',
  };
}

export interface InstanceContext {
  readonly workingEnv: NapCatCoreWorkingEnv;
  readonly wrapper: WrapperNodeApi;
  readonly session: NodeIQQNTWrapperSession;
  readonly logger: LogWrapper;
  readonly basicInfoWrapper: QQBasicInfoWrapper;
  readonly pathWrapper: NapCatPathWrapper;
  readonly packetHandler: NativePacketHandler;
  readonly napi2nativeLoader: Napi2NativeLoader;
}

export interface StableNTApiWrapper {
  FileApi: NTQQFileApi,
  SystemApi: NTQQSystemApi,
  PacketApi: NTQQPacketApi,
  CollectionApi: NTQQCollectionApi,
  WebApi: NTQQWebApi,
  FriendApi: NTQQFriendApi,
  MsgApi: NTQQMsgApi,
  UserApi: NTQQUserApi,
  GroupApi: NTQQGroupApi;
  FlashApi: NTQQFlashApi,
  OnlineApi: NTQQOnlineApi,
  DatabaseApi: NTQQDatabaseApi,
}
