export type AuthType = "bearer" | "api_key";

export interface Provider {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  auth_type: AuthType;
  models_url: string | null;
}

export interface Route {
  model: string;
  provider: string;
}

export interface Config {
  host: string;
  port: number;
  client_token: string | null;
  providers: Provider[];
  routes: Route[];
  close_to_tray: boolean;
  auto_start: boolean;
}

export interface StatusInfo {
  host: string;
  port: number;
  embedded: boolean;
  reachable: boolean;
  models: string[];
}
