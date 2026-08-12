import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import type { Config, StatusInfo } from "./types";
import { checkForUpdate, getConfig, getStatus, installUpdate, saveConfig, startGateway } from "./lib/api";
import { ProvidersPage } from "./pages/Providers";
import { RoutesPage } from "./pages/Routes";
import { IntegrationPage } from "./pages/Integration";
import { LogsPage } from "./pages/Logs";
import { Button, EmptyState, Modal, Spinner, Toast, cls } from "./components/ui";

type Page = "providers" | "routes" | "integration" | "logs";

const NAV: { key: Page; label: string; icon: ReactNode }[] = [
  { key: "providers", label: "提供商", icon: <ServerIcon /> },
  { key: "routes", label: "路由", icon: <RouteIcon /> },
  { key: "integration", label: "集成", icon: <PlugIcon /> },
  { key: "logs", label: "日志", icon: <ListIcon /> },
];

const SAMPLE: Config = {
  host: "127.0.0.1",
  port: 8338,
  client_token: "",
  providers: [
    {
      id: "deepseek",
      name: "DeepSeek",
      base_url: "https://api.deepseek.com/anthropic",
      api_key: "",
      auth_type: "bearer",
      models_url: null,
    },
  ],
  routes: [{ model: "*", provider: "deepseek" }],
};

export default function App() {
  const [page, setPage] = useState<Page>("providers");
  const [config, setConfig] = useState<Config | null>(null);
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);

  const refreshStatus = useCallback(async () => {
    setStatus(await getStatus().catch(() => null));
  }, []);

  const refreshConfig = useCallback(async () => {
    setConfig(await getConfig().catch(() => null));
  }, []);

  useEffect(() => {
    (async () => {
      await startGateway().catch(() => {});
      await refreshConfig();
      await refreshStatus();
      setLoading(false);
    })();
  }, [refreshConfig, refreshStatus]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  // 启动时静默检查更新
  useEffect(() => {
    checkForUpdate().then((u) => u && setUpdate(u));
  }, []);

  const checkUpdates = useCallback(async () => {
    const u = await checkForUpdate();
    if (u) setUpdate(u);
    else showToast("已是最新版本或暂无可用更新");
  }, [showToast]);

  const persist = useCallback(
    async (next: Config) => {
      await saveConfig(next);
      setConfig(next);
      refreshStatus();
      showToast("已保存");
    },
    [refreshStatus, showToast],
  );

  const initConfig = async () => {
    await persist(SAMPLE);
  };

  if (loading) {
    return (
      <div className="relative flex h-screen items-center justify-center">
        <div className="app-backdrop" />
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-violet-400" />
          <p className="text-sm text-zinc-500">正在启动网关…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen overflow-hidden">
      <div className="app-backdrop" />

      <aside className="relative z-10 flex w-60 shrink-0 flex-col border-r border-white/[0.06] bg-black/20 backdrop-blur-2xl">
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-900/50">
            <RouteIcon className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <p className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-[15px] font-semibold text-transparent">
              LLM Router
            </p>
            <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">本地路由网关</p>
          </div>
        </div>

        <nav className="mt-1 flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active = page === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setPage(item.key)}
                className={cls(
                  "group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150",
                  active
                    ? "bg-gradient-to-r from-indigo-500/20 to-violet-500/5 text-white"
                    : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100",
                )}
              >
                {active ? (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gradient-to-b from-indigo-400 to-fuchsia-400" />
                ) : null}
                <span
                  className={cls(
                    "transition-colors",
                    active ? "text-violet-300" : "text-zinc-500 group-hover:text-zinc-300",
                  )}
                >
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.06] px-5 py-5">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span
                className={cls(
                  "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
                  status?.reachable ? "bg-emerald-400" : "bg-red-400",
                )}
              />
              <span
                className={cls(
                  "relative inline-flex h-2 w-2 rounded-full",
                  status?.reachable ? "bg-emerald-400" : "bg-red-400",
                )}
              />
            </span>
            <span className="text-xs text-zinc-500">
              {status?.reachable ? `网关运行中 · ${status.host}:${status.port}` : "网关未运行"}
            </span>
          </div>
        </div>
      </aside>

      <main className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between px-8 py-5">
          <div>
            <h1 className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-xl font-semibold text-transparent">
              {NAV.find((n) => n.key === page)!.label}
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500">
              {page === "providers" && "管理上游提供商（Anthropic 兼容端点）"}
              {page === "routes" && "把模型 ID 映射到提供商"}
              {page === "integration" && "网关状态与 cc-switch 集成"}
              {page === "logs" && "网关请求日志"}
            </p>
          </div>
          {page !== "integration" ? (
            <button
              onClick={refreshStatus}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs text-zinc-400 backdrop-blur transition-all hover:bg-white/[0.08] hover:text-zinc-100"
            >
              <RefreshIcon /> 刷新状态
            </button>
          ) : null}
        </header>

        <div className="flex-1 overflow-y-auto px-8 pb-10">
          {!config ? (
            <EmptyState
              title="欢迎使用 LLM Router"
              desc="还没有配置文件。点击下面按钮创建一份示例配置（DeepSeek + 兜底路由），然后去「提供商」页填入你的 API Key。"
              action={<Button onClick={initConfig}>创建示例配置</Button>}
            />
          ) : (
            <div key={page} className="animate-fade-up">
              {page === "providers" ? (
                <ProvidersPage config={config} persist={persist} />
              ) : page === "routes" ? (
                <RoutesPage config={config} persist={persist} />
              ) : page === "integration" ? (
                <IntegrationPage status={status} refresh={refreshStatus} checkUpdates={checkUpdates} />
              ) : (
                <LogsPage />
              )}
            </div>
          )}
        </div>
      </main>

      <Toast message={toast} />
      {update ? <UpdateModal update={update} onClose={() => setUpdate(null)} /> : null}
    </div>
  );
}

const UPDATE_ERROR_HINT = "更新失败。绿色版/开发版暂不支持应用内更新，请到 Releases 页手动下载：https://github.com/sparkjokerben/local-llm-router/releases";

function UpdateModal({ update, onClose }: { update: Update; onClose: () => void }) {
  const [phase, setPhase] = useState<"idle" | "downloading" | "error">("idle");
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    setPhase("downloading");
    setPct(null);
    setErr(null);
    try {
      await installUpdate(update, setPct);
    } catch (ex) {
      setPhase("error");
      setErr(String(ex));
    }
  };

  const busy = phase === "downloading";

  return (
    <Modal open onClose={busy ? () => {} : onClose} title="发现新版本">
      <div className="space-y-4">
        <p className="text-sm text-zinc-300">
          新版本 <span className="font-mono font-semibold text-violet-300">v{update.version}</span> 可用，一键升级到最新版本。
        </p>

        {update.body ? (
          <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/[0.06] bg-black/20 p-3 text-xs leading-relaxed text-zinc-400">
            {update.body}
          </div>
        ) : null}

        {busy ? (
          <div>
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="flex items-center gap-2">
                <Spinner /> 正在下载更新…
              </span>
              {pct !== null ? <span>{pct}%</span> : null}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={cls(
                  "h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all duration-300",
                  pct === null ? "w-1/3 animate-pulse" : "",
                )}
                style={pct !== null ? { width: `${pct}%` } : undefined}
              />
            </div>
          </div>
        ) : null}

        {phase === "error" && err ? (
          <div className="space-y-2">
            <p className="text-sm text-red-400">{err}</p>
            <p className="text-xs leading-relaxed text-zinc-500">{UPDATE_ERROR_HINT}</p>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            稍后
          </Button>
          {phase === "error" ? (
            <Button onClick={start}>重试</Button>
          ) : (
            <Button onClick={start} disabled={busy}>
              {busy ? "更新中…" : "立即更新"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ServerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </svg>
  );
}

function RouteIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="6" cy="19" r="2.4" />
      <circle cx="18" cy="5" r="2.4" />
      <circle cx="18" cy="19" r="2.4" />
      <path d="M8.4 19H11a3 3 0 0 0 3-3V8a3 3 0 0 1 3-3" />
    </svg>
  );
}

function PlugIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2v6M15 2v6" />
      <path d="M6 8h12v3a6 6 0 0 1-12 0z" />
      <path d="M12 17v5" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.6-6.3M21 3v6h-6" />
    </svg>
  );
}
