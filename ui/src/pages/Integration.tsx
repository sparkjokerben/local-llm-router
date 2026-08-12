import { useState } from "react";
import type { StatusInfo } from "../types";
import { importCcswitch } from "../lib/api";
import { Badge, Button, Card, cls, Spinner } from "../components/ui";

export function IntegrationPage({
  status,
  refresh,
  checkUpdates,
}: {
  status: StatusInfo | null;
  refresh: () => void;
  checkUpdates: () => void;
}) {
  const [importing, setImporting] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const doImport = async () => {
    setImporting(true);
    setErr(null);
    try {
      const u = await importCcswitch();
      setUrl(u);
    } catch (ex) {
      setErr(String(ex));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">网关状态</h3>
            <p className="mt-1 font-mono text-xs text-slate-500">
              {status ? `${status.host}:${status.port}` : "…"}
              {status?.embedded ? " · 内嵌运行" : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {status ? (
              <>
                <Badge tone={status.reachable ? "green" : "red"}>
                  <span className="relative flex h-1.5 w-1.5">
                    <span
                      className={cls(
                        "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                        status.reachable ? "bg-emerald-400" : "bg-red-400",
                      )}
                    />
                    <span
                      className={cls(
                        "relative inline-flex h-1.5 w-1.5 rounded-full",
                        status.reachable ? "bg-emerald-400" : "bg-red-400",
                      )}
                    />
                  </span>
                  {status.reachable ? "运行中" : "未运行"}
                </Badge>
                <Button variant="secondary" onClick={checkUpdates}>
                  检查更新
                </Button>
                <Button variant="secondary" onClick={refresh}>
                  刷新
                </Button>
              </>
            ) : (
              <Spinner />
            )}
          </div>
        </div>

        <p className="mt-4 text-xs text-slate-500">可路由的模型（来自 /v1/models）：</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {status && status.models.length > 0 ? (
            status.models.map((m) => (
              <span
                key={m}
                className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-xs text-slate-300"
              >
                {m}
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-600">暂无模型（检查「路由」页配置）</span>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-white">cc-switch 集成</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          一键把网关导入 cc-switch 作为提供商。cc-switch 会弹出确认框预览；确认后，在 cc-switch 里把
          haiku / sonnet / opus / fable 四档映射到上方列出的模型 ID，切换到该提供商即可让 Claude Code
          走网关路由。
        </p>
        <div className="mt-4">
          <Button onClick={doImport} disabled={importing}>
            {importing ? <Spinner /> : "一键导入到 cc-switch"}
          </Button>
        </div>
        {url ? (
          <p className="mt-3 break-all rounded-lg border border-white/10 bg-[#0b0d13] p-3 font-mono text-xs text-slate-400">
            {url}
          </p>
        ) : null}
        {err ? <p className="mt-3 text-sm text-red-400">{err}</p> : null}
      </Card>
    </div>
  );
}
