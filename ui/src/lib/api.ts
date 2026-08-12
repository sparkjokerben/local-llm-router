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

export type UpdateCheck = { ok: boolean; update: Update | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 部分网络环境对 github.com 的非浏览器 User-Agent 请求做概率性拦截，
// 伪装浏览器 UA 规避（检查与下载请求都会带上）
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** 检查是否有新版本；网络抖动时重试最多 8 次。{ok:false} 表示更新源不可达 */
export const checkForUpdate = async (): Promise<UpdateCheck> => {
  for (let i = 0; i < 8; i++) {
    try {
      return { ok: true, update: await check({ timeout: 15000, headers: { "User-Agent": BROWSER_UA } }) };
    } catch {
      await sleep(2000);
    }
  }
  return { ok: false, update: null };
};

/** 下载并安装更新（失败自动重试最多 8 次，跨约 40s 采样窗口），安装完成后重启应用 */
export const installUpdate = async (update: Update, onProgress: (pct: number | null) => void) => {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    let downloaded = 0;
    let total = 0;
    try {
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
      return;
    } catch (ex) {
      lastErr = ex;
      onProgress(null);
      await sleep(2000);
    }
  }
  throw lastErr;
};
