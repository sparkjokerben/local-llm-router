import { Fragment, useState } from "react";
import type { Config, Route } from "../types";
import { fetchProviderModels } from "../lib/api";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, cls } from "../components/ui";

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
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOverGap, setDragOverGap] = useState<number | null>(null);

  const selProvider = config.providers.find((p) => p.id === provider);

  // 拖拽是「插入」语义：gap 表示拖拽行要落到最终数组的下标（0..routes.length），
  // 显示为两行之间的指示线，而不是整行高亮。
  const move = async (from: number, to: number) => {
    if (from === to || to < 0 || to > config.routes.length) return;
    await persist({ ...config, routes: reorder(config.routes, from, to) });
  };

  const onDragStart = (i: number) => (e: React.DragEvent) => {
    setDragFrom(i);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(i)); // 必须在 dragstart 里同步调用
  };

  const onDragOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault(); // 不 preventDefault 则 drop 不会触发
    e.dataTransfer.dropEffect = "move";
    // 光标在行上半 → 插到该行前（gap i）；下半 → 插到该行后（gap i+1）
    const rect = e.currentTarget.getBoundingClientRect();
    const gap = e.clientY < rect.top + rect.height / 2 ? i : i + 1;
    if (dragOverGap !== gap) setDragOverGap(gap); // 避免每帧 setState 引起重渲风暴
  };

  const keepDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const commitDrop = async () => {
    const from = dragFrom;
    const gap = dragOverGap;
    setDragFrom(null);
    setDragOverGap(null);
    if (from === null || gap === null) return;
    // gap 是视觉缝隙（基于原始行序）。reorder 先移除被拖行再插入，
    // 缝隙在被拖行下方时会向下压缩一位，需换算成目标下标：
    const to = gap <= from ? gap : gap - 1;
    await move(from, to);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    void commitDrop();
  };

  const onDragEnd = () => {
    setDragFrom(null);
    setDragOverGap(null);
  };

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
                <th className="w-10" />
                <th className="px-5 py-3.5 font-medium">模型</th>
                <th className="px-5 py-3.5 font-medium">提供商</th>
                <th className="px-5 py-3.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {config.routes.map((r, i) => (
                <Fragment key={`${r.model}→${r.provider}`}>
                  {dragFrom !== null && dragOverGap === i ? <DragLineRow onDragOver={keepDrop} onDrop={onDrop} /> : null}
                  <tr
                    draggable
                    onDragStart={onDragStart(i)}
                    onDragOver={onDragOver(i)}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                    className={cls(
                      "cursor-grab select-none border-b border-white/[0.03] transition-colors last:border-0 hover:bg-white/[0.02]",
                      dragFrom === i && "opacity-40",
                    )}
                  >
                  <td className="px-2 py-3.5 text-zinc-600">
                    <GripIcon />
                  </td>
                  <td className="px-5 py-3.5">
                    {r.model === "*" ? (
                      <Badge tone="amber">* 兜底</Badge>
                    ) : (
                      <span className="font-mono text-[13px] text-zinc-100">{r.model}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-zinc-300">{providerName(config, r.provider)}</td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" title="上移" ariaLabel="上移" disabled={i === 0} onClick={() => move(i, i - 1)}>
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        title="下移"
                        ariaLabel="下移"
                        disabled={i === config.routes.length - 1}
                        onClick={() => move(i, i + 1)}
                      >
                        ↓
                      </Button>
                      <Button variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => setToDelete(r)}>
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
                </Fragment>
              ))}
              {dragFrom !== null && dragOverGap === config.routes.length ? (
                <DragLineRow onDragOver={keepDrop} onDrop={onDrop} />
              ) : null}
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

function reorder<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/// 拖拽时的插入位置指示线（完整宽度的一行）。
function DragLineRow({
  onDragOver,
  onDrop,
}: {
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <tr onDragOver={onDragOver} onDrop={onDrop}>
      <td colSpan={4} className="p-0">
        <div className="h-0.5 w-full bg-violet-400/90 shadow-[0_0_8px_rgba(167,139,250,0.7)]" />
      </td>
    </tr>
  );
}

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="mx-auto">
      <circle cx="9" cy="5" r="1.6" />
      <circle cx="15" cy="5" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="19" r="1.6" />
      <circle cx="15" cy="19" r="1.6" />
    </svg>
  );
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
