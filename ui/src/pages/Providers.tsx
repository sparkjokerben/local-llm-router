import { useState } from "react";
import type { AuthType, Config, Provider } from "../types";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner } from "../components/ui";

export function ProvidersPage({
  config,
  persist,
}: {
  config: Config;
  persist: (c: Config) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [toDelete, setToDelete] = useState<Provider | null>(null);

  const save = async (p: Provider) => {
    if (editing) {
      await persist({
        ...config,
        providers: config.providers.map((x) => (x.id === editing.id ? p : x)),
      });
    } else {
      await persist({ ...config, providers: [...config.providers, p] });
    }
    setCreating(false);
    setEditing(null);
  };

  const remove = async () => {
    if (!toDelete) return;
    await persist({
      ...config,
      providers: config.providers.filter((p) => p.id !== toDelete.id),
      routes: config.routes.filter((r) => r.provider !== toDelete.id),
    });
    setToDelete(null);
  };

  if (config.providers.length === 0) {
    return (
      <EmptyState
        title="还没有提供商"
        desc="添加第一个提供商（DeepSeek / Qwen / GLM / Kimi…），配置好 base_url 和 API Key。Claude Code 发来的模型会按路由转发到对应提供商。"
        action={<Button onClick={() => setCreating(true)}>＋ 添加提供商</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{config.providers.length} 个提供商</p>
        <Button onClick={() => setCreating(true)}>＋ 添加提供商</Button>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {config.providers.map((p) => (
          <Card key={p.id} className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">{p.name}</span>
                <Badge tone={p.auth_type === "bearer" ? "violet" : "slate"}>
                  {p.auth_type === "bearer" ? "Bearer" : "x-api-key"}
                </Badge>
              </div>
              <p className="mt-1 truncate font-mono text-xs text-slate-500">{p.base_url}</p>
              <p className="mt-0.5 font-mono text-xs text-slate-600">key: {mask(p.api_key)}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="secondary" onClick={() => setEditing(p)}>
                编辑
              </Button>
              <Button variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => setToDelete(p)}>
                删除
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {creating && <ProviderModal title="添加提供商" initial={blank()} onSave={save} onClose={() => setCreating(false)} />}
      {editing && <ProviderModal title="编辑提供商" initial={editing} onSave={save} onClose={() => setEditing(null)} />}
      {toDelete && (
        <Modal open onClose={() => setToDelete(null)} title="删除提供商">
          <p className="text-sm text-slate-400">删除「{toDelete.name}」？关联到它的路由也会一并删除。</p>
          <div className="mt-5 flex justify-end gap-2">
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

function mask(key: string) {
  if (!key) return "（未设置）";
  if (key.length <= 8) return "•".repeat(8);
  return `${key.slice(0, 3)}${"•".repeat(8)}${key.slice(-4)}`;
}

function blank(): Provider {
  return { id: "", name: "", base_url: "", api_key: "", auth_type: "bearer", models_url: null };
}

function ProviderModal({
  title,
  initial,
  onSave,
  onClose,
}: {
  title: string;
  initial: Provider;
  onSave: (p: Provider) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Provider>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.base_url.trim() || !form.api_key.trim()) {
      setErr("名称、Base URL 和 API Key 为必填");
      return;
    }
    setBusy(true);
    try {
      await onSave({ ...form, id: form.id.trim() || form.name.trim().toLowerCase() });
    } catch (ex) {
      setErr(String(ex));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="名称">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="DeepSeek" autoFocus />
        </Field>
        <Field label="ID" hint="留空则自动使用小写名称">
          <Input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="deepseek" />
        </Field>
        <Field label="Base URL" hint="Anthropic 兼容端点，如 https://api.deepseek.com/anthropic">
          <Input
            value={form.base_url}
            onChange={(e) => setForm({ ...form, base_url: e.target.value })}
            placeholder="https://api.deepseek.com/anthropic"
          />
        </Field>
        <Field label="API Key">
          <Input
            type="password"
            value={form.api_key}
            onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            placeholder="sk-…"
          />
        </Field>
        <Field label="鉴权方式">
          <Select
            value={form.auth_type}
            onChange={(e) => setForm({ ...form, auth_type: e.target.value as AuthType })}
          >
            <option value="bearer">Authorization: Bearer</option>
            <option value="api_key">x-api-key</option>
          </Select>
        </Field>
        <Field label="模型列表地址（可选）" hint="Anthropic 端点一般没有模型列表；填 OpenAI 兼容的 /v1/models。留空时自动尝试 base_url/v1/models 及去掉 /anthropic 的变体">
          <Input
            value={form.models_url ?? ""}
            onChange={(e) => setForm({ ...form, models_url: e.target.value.trim() || null })}
            placeholder="https://api.deepseek.com/v1/models"
          />
        </Field>
        {err ? <p className="text-sm text-red-400">{err}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? <Spinner /> : "保存"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
