import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { AuthType, Config, StatusInfo } from "../types";

export const getConfig = () => invoke<Config | null>("get_config");
export const saveConfig = (cfg: Config) => invoke<void>("save_config", { cfg });
export const startGateway = () => invoke<void>("start_gateway");
export const getStatus = () => invoke<StatusInfo>("get_status");
export const importCcswitch = () => invoke<string>("import_ccswitch");
export const getLogs = () => invoke<string[]>("get_logs");
export const fetchProviderModels = (
  baseUrl: string,
  apiKey: string,
  authType: AuthType,
  modelsUrl: string | null,
) => invoke<string[]>("fetch_provider_models", { baseUrl, apiKey, authType, modelsUrl });

// —— 应用更新 ——

/** 检查是否有新版本；网络异常/无更新源时返回 null */
export const checkForUpdate = async (): Promise<Update | null> => {
  try {
    return await check({ timeout: 15000 });
  } catch {
    return null;
  }
};

/** 下载并安装更新，安装完成后重启应用 */
export const installUpdate = async (update: Update, onProgress: (pct: number | null) => void) => {
  let downloaded = 0;
  let total = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress(total > 0 ? Math.round((downloaded / total) * 100) : null);
    }
  });
  try {
    await relaunch();
  } catch {
    // 绿色版等无法自动重启：安装已下载到本地，提示用户手动启动
  }
};
