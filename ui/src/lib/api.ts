import { invoke } from "@tauri-apps/api/core";
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
