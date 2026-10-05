/**
 * Loads the Cat Yard HOME module that catnip-heist builds into public/heist-game (a same-origin,
 * local file: nothing remote, so the Capacitor app ships it too). Browser only.
 */
import { isHomeYardModule, type HomeYardModule } from "@/shared-contracts/home-yard";
import { HOME_YARD_ENTRY } from "./yardEntry.generated";

/** The built Heist's assets (fonts, the stand-in cat sheet), next to the module. */
export const HOME_YARD_ASSET_BASE = "/heist-game/assets/";

export class HomeYardLoadError extends Error {
  constructor(message: string, readonly reason: "webgl" | "import" | "version" | "timeout" | "create") {
    super(message);
    // Keeps `instanceof` working where classes are compiled down to ES5 (Error subclassing).
    Object.setPrototypeOf(this, HomeYardLoadError.prototype);
    this.name = "HomeYardLoadError";
  }
}

/** Whether this browser can give the yard a WebGL context at all. */
export function hasWebGL(): boolean {
  try {
    if (typeof document === "undefined") return false;
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") || canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** The runtime import, kept out of the bundler (the file is a prebuilt ES module under public/). */
const importModule = (url: string): Promise<unknown> => import(/* webpackIgnore: true */ url);

export async function loadHomeYard(
  entry: string = HOME_YARD_ENTRY,
  load: (url: string) => Promise<unknown> = importModule,
): Promise<HomeYardModule> {
  if (!hasWebGL()) throw new HomeYardLoadError("WebGL unavailable", "webgl");
  let mod: unknown;
  try {
    mod = await load(entry);
  } catch (error) {
    throw new HomeYardLoadError(`Home yard import failed: ${(error as Error)?.message ?? error}`, "import");
  }
  if (!isHomeYardModule(mod)) throw new HomeYardLoadError("Home yard module has another API version", "version");
  return mod;
}
