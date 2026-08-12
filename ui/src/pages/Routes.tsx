import { useState } from "react";
import type { Config, Route } from "../types";
import { fetchProviderModels } from "../lib/api";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner } from "../components/ui";

export function RoutesPage({
  config,
  persist,
}: {
  config: Config;
  persist: (c: Config) => Promise<void>;
}) {
  const [model, setModel] = useState("");
  const [provider, setProvider] = useState("");
  const [models, setModels] = useState<string[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Route | null>(null);

  const selProvider = config.providers.find((p) => p.id === provider);

  const fetchModels = async () => {
    if (!selProvider) return;
    setFetching(true);
    setFetchErr(null);
    try {
      const list = await fetchProviderModels(
        selProvider.base_url,
        selProvider.api_key,
        selProvider.auth_type,
        selProvider.models_url,
      );
      setModels(list);
    } catch (ex) {
      setFetchErr(String(ex));
      setModels([]);
    } finally {
      setFetching(false);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const m = model.trim();
    if (!m || !provider) return;
    await persist({
      ...config,
      routes: [...config.routes.filter((r) => !(r.model === m && r.provider === provider)), { model: m, provider }],
    });
    setModel("");
    setModels(null);
  };

  const remove = async () => {
    if (!toDelete) return;
    await persist({ ...config, routes: config.routes.filter((r) => r !== toDelete) });
    setToDelete(null);
  };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <form onSubmit={add} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto]">
            <Field label="提供商">
              <Select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setModels(null);
                  setFetchErr(null);
                }}
              >
                <option value="">选择提供商…</option>
                {config.providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="模型 ID" hint="Claude Code 发来的模型名；输入 * 作为兜底">
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="qwen3.5-plus"
                list="model-suggestions"
              />
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={!model.trim() || !provider}>
                ＋ 添加
              </Button>
            </div>
          </div>
          <datalist id="model-suggestions">
            {models?.map((m) => <option key={m} value={m} />)}
          </datalist>

          <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4">
            <Button variant="secondary" onClick={fetchModels} disabled={!selProvider || fetching}>
              {fetching ? <Spinner /> : <DownloadIcon />} 从上游获取模型列表
            </Button>
            {selProvider && (
              <span className="text-xs text-zinc-500">
                拉取 {selProvider.name} 的 /v1/models
              </span>
            )}
            {fetchErr ? <span className="text-xs text-red-400">{fetchErr}</span> : null}
          </div>

          {models && models.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {models.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModel(m)}
                  className={clsChip(m === model)}
                  title="点击填入模型 ID"
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </form>
      </Card>

      {config.routes.length === 0 ? (
        <EmptyState
          title="还没有路由"
          desc="把模型 ID 映射到提供商。Claude Code 发送该模型时，网关会转发到对应提供商（`*` 兜底匹配其余所有模型）。"
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02] text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <th className="px-5 py-3.5 font-medium">模型</th>
                <th className="px-5 py-3.5 font-medium">提供商</th>
                <th className="px-5 py-3.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {config.routes.map((r) => (
                <tr
                  key={`${r.model}→${r.provider}`}
                  className="border-b border-white/[0.03] transition-colors last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-5 py-3.5">
                    {r.model === "*" ? (
                      <Badge tone="amber">* 兜底</Badge>
                    ) : (
                      <span className="font-mono text-[13px] text-zinc-100">{r.model}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-zinc-300">{providerName(config, r.provider)}</td>
                  <td className="px-5 py-3.5 text-right">
                    <Button variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => setToDelete(r)}>
                      删除
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {toDelete && (
        <Modal open onClose={() => setToDelete(null)} title="删除路由">
          <p className="text-sm text-zinc-400">
            删除「{toDelete.model === "*" ? "* 兜底" : toDelete.model}」路由？
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setToDelete(null)}>
              取消
            </Button>
            <Button variant="danger" onClick={remove}>
              删除
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function providerName(config: Config, id: string) {
  return config.providers.find((p) => p.id === id)?.name ?? id;
}

function clsChip(active: boolean) {
  return (
    "rounded-lg border px-2.5 py-1.5 font-mono text-xs transition-all " +
    (active
      ? "border-violet-400/50 bg-violet-500/20 text-violet-200"
      : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-violet-400/30 hover:bg-white/[0.06]")
  );
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}
