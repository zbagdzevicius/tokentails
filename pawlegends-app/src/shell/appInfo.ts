/**
 * The native part of the game's release watermark (pawlegends/src/ui/versionMark.ts): the app version and build
 * number, and the bundle the updater runs ("builtin" for the one in the binary, else the OTA bundle version). Published
 * as `window.__PL_APP_INFO__` and announced with a `pl:appinfo` event, so the title screen's watermark fills in when it
 * arrives. Each part is optional: a failing call leaves its part out, never the whole line.
 */
export const APP_INFO_GLOBAL = '__PL_APP_INFO__';
export const APP_INFO_EVENT = 'pl:appinfo';

export interface AppInfo {
  native?: string;
  nativeBuild?: string;
  ota?: string;
}

export interface AppInfoDeps {
  /** App.getInfo() from @capacitor/app. */
  getInfo(): Promise<{ version?: unknown; build?: unknown }>;
  /** CapacitorUpdater.current(); absent where the shell takes no OTA updates (it still answers `builtin`). */
  current?(): Promise<{ bundle?: { id?: unknown; version?: unknown } }>;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v.slice(0, 40) : typeof v === 'number' ? String(v) : undefined);

/** Gather the info; never throws. */
export async function readAppInfo(d: AppInfoDeps): Promise<AppInfo> {
  const out: AppInfo = {};
  try {
    const i = await d.getInfo();
    const native = str(i?.version);
    const build = str(i?.build);
    if (native) out.native = native;
    if (build) out.nativeBuild = build;
  } catch {
    /* no native info: the line leaves it out */
  }
  try {
    const b = d.current ? (await d.current())?.bundle : undefined;
    const id = str(b?.id);
    const ota = id === 'builtin' ? 'builtin' : (str(b?.version) ?? id);
    if (ota) out.ota = ota;
  } catch {
    /* no updater answer */
  }
  return out;
}

/** Read and publish on `w`; never throws. */
export async function publishAppInfo(d: AppInfoDeps, w: Window = window): Promise<AppInfo> {
  const info = await readAppInfo(d);
  try {
    (w as unknown as Record<string, unknown>)[APP_INFO_GLOBAL] = Object.freeze(info);
    w.dispatchEvent(new Event(APP_INFO_EVENT));
  } catch {
    /* a locked window: the watermark shows the web part only */
  }
  return info;
}
