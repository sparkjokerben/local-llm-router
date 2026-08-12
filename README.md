# LLM Router — 本地大模型路由网关

[![发布发行版](https://github.com/sparkjokerben/local-llm-router/actions/workflows/release.yml/badge.svg)](https://github.com/sparkjokerben/local-llm-router/actions/workflows/release.yml)

一个运行在本地的 Anthropic 协议聚合网关：把 Claude Code 按 `haiku / sonnet / opus / fable` 四个档位发出的请求，路由到不同的国产大模型提供商（DeepSeek / 通义千问 / 智谱 GLM / Kimi / 火山方舟…），每个提供商使用自己的 base_url 和 API key。

**零流量重写**：Claude Code 原生支持自定义模型 ID，网关只做「按 model 选提供商 → 换鉴权头 → body 原样转发」，请求与响应（含 SSE 流）都不做任何解析和改写。

## 架构

```
┌────────────────────┐      ┌──────────────────────────┐
│   Claude Code      │      │  LLM Router（Tauri GUI） │
│  settings.json     │      │  ┌────────────────────┐  │
│  BASE_URL=         │─────▶│  │  本地网关 (axum)    │  │
│  http://127.0.0.1  │      │  │  127.0.0.1:8338     │  │
└────────────────────┘      │  └──────┬─────────────┘  │
                            └─────────┼────────────────┘
                          model 精确匹配路由表（支持 * 兜底）
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
   DeepSeek               通义千问 Qwen            智谱 GLM …
  api.deepseek.com    dashscope.aliyuncs.com   open.bigmodel.cn
```

- **路由匹配**：按 Claude Code 发来的 `model` 字符串精确匹配 → 提供商；`*` 兜底；支持 `[1M]` 上下文后缀剥离（`deepseek-v4-flash[1M]` 命中 `deepseek-v4-flash`）。
- **上游模型列表**：Anthropic 兼容端点一般不提供模型列表，网关自动尝试 `{base_url}/v1/models` 及其变体拉取（DeepSeek 实测可用），也支持在提供商配置里指定 `models_url`。
- **安全**：仅监听 `127.0.0.1`；禁止重定向（防止 key 泄漏到重定向目标）；密钥直接写入本地配置文件（不污染环境变量）；GUI 全程掩码显示。

## 快速开始

### 方式一：安装版

从 [Releases](https://github.com/sparkjokerben/local-llm-router/releases) 下载 `LLM Router_x.y.z_x64-setup.exe`，安装后从开始菜单启动。

### 方式二：绿色版（免安装）

下载 `LLM-Router-portable-win-x64.zip`，解压后双击 `llm-router-app.exe` 即可。

### 首次配置

1. 启动应用，在「提供商」页添加上游（DeepSeek 等），填写 base_url 和 API key。
2. 在「路由」页把模型 ID 映射到提供商（点「从上游获取模型列表」可一键拉取）。
3. 在「集成」页确认网关状态，点击「一键导入 cc-switch」——会弹窗把网关作为「本地网关」提供商导入 cc-switch。
4. 在 cc-switch 中把 haiku / sonnet / opus / fable 四档映射到网关暴露的模型 ID，切换启用。

> Claude Code 通过 cc-switch 间接指向网关（`ANTHROPIC_BASE_URL=http://127.0.0.1:8338`），发消息时按 model 字符串走对应提供商。

## 配置

运行时配置位于 `%APPDATA%\local-llm-router\config.json`（仓库内 [config.example.json](config.example.json) 为占位示例）：

```jsonc
{
  "host": "127.0.0.1",
  "port": 8338,
  "client_token": "",                    // 可选；Claude Code 用 ANTHROPIC_AUTH_TOKEN 发送
  "providers": [
    {
      "id": "deepseek",
      "name": "DeepSeek",
      "base_url": "https://api.deepseek.com/anthropic",   // Anthropic 兼容端点
      "api_key": "sk-…",
      "auth_type": "bearer",                              // bearer | api_key
      "models_url": null                                  // 可选，模型列表接口
    }
  ],
  "routes": [
    { "model": "deepseek-v4-flash",   "provider": "deepseek" },
    { "model": "*",                   "provider": "deepseek" }  // 兜底
  ]
}
```

## 开发

见 [docs/SETUP.md](docs/SETUP.md)（完整工具链指南：VS Build Tools 2022 + Rust MSVC + Node + Tauri CLI）。

```powershell
cargo build              # 构建网关库 + Tauri 应用
cargo test               # 单元/集成测试（路由匹配、配置校验、假上游转发）
cargo clippy             # lint
cd crates/app && npx tauri dev     # GUI 开发模式（HMR）
cd crates/app && npx tauri build   # 打包 NSIS 安装版
```

## 自动更新

安装版内置应用内更新：

- **启动时自动检查**新版本（静默，最多重试 8 次），发现后弹窗提示；集成页也有「检查更新」按钮手动触发
- 点击「立即更新」→ 下载新版安装包（带进度条，失败自动重试）→ 校验签名 → 静默安装 → 自动重启
- 更新文件（安装包 + 签名 + 清单 `latest.json`）随每次发布同步到仓库 `updates/` 目录，经 `raw.githubusercontent.com` 直连获取（无需代理、不依赖 github.com 主站可达性）；更新包使用内嵌公钥验签，防篡改
- **绿色版/开发版不能应用内自我升级**（插件仅支持 NSIS 安装版），检测到更新会提示到 Releases 页手动下载

### 发布新版本

推 tag 即自动构建、签名并发布安装版 + 绿色版 + 更新清单：

```bash
git tag v0.1.1 && git push origin v0.1.1
```

工作流 [.github/workflows/release.yml](.github/workflows/release.yml) 在 `windows-latest` 上：
1. 构建前端 + Rust release 二进制（注入 `TAURI_SIGNING_PRIVATE_KEY` 自动签名安装包）
2. `tauri build --bundles nsis` 产出 NSIS 安装版 + `.sig` 签名
3. 生成更新清单 `latest.json`（版本 / 签名 / 下载 URL）
4. `Compress-Archive` 打包绿色版 zip
5. 打 tag 时上传 `-setup.exe`、`.sig`、`latest.json`、zip 到 GitHub Release

> 更新签名私钥存在仓库级 secret `TAURI_SIGNING_PRIVATE_KEY`（本地备份在 `~/.tauri/llm-router.key`，**私钥丢失将无法发布更新**）。

## 目录结构

```
crates/gateway/   # 网关核心（config / router / server，纯 Rust，可独立 CLI 运行）
crates/app/       # Tauri 桌面应用（内嵌网关、IPC 命令、日志环形缓冲）
ui/               # React + TS + Tailwind 前端（深色玻璃拟态）
docs/SETUP.md     # 工具链安装指南
scripts/          # 图标生成脚本
```

## License

[MIT](LICENSE)
