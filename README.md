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

- **路由匹配**：按 Claude Code 发来的 `model` 字符串精确匹配 → 提供商；`*` 兜底；支持 `[1M]` 上下文后缀剥离（`deepseek-v4-flash[1M]` 命中 `deepseek-v4-flash`）；路由列表可在「路由」页拖拽 / 上下按钮手动排序（匹配按列表顺序 first-match）。
- **上游模型列表**：Anthropic 兼容端点一般不提供模型列表，网关自动尝试 `{base_url}/v1/models` 及其变体拉取（DeepSeek 实测可用），也支持在提供商配置里指定 `models_url`。
- **后台运行**：关闭窗口默认最小化到系统托盘（可关），网关持续在后台服务；可选开机自启，登录后自动后台运行。
- **安全**：仅监听 `127.0.0.1`；禁止重定向（防止 key 泄漏到重定向目标）；密钥直接写入本地配置文件（不污染环境变量）；GUI 全程掩码显示。

## 快速开始

从 [Releases](https://github.com/sparkjokerben/local-llm-router/releases) 按平台下载：

| 平台 | 安装版 | 绿色版（免安装） |
|---|---|---|
| Windows x64 | `LLM-Router_x.y.z-x64-setup.exe`（NSIS 安装程序） | `LLM-Router-portable-win-x64.zip`（解压双击 `llm-router-app.exe`） |
| macOS Apple 芯片 | `LLM-Router_x.y.z-aarch64.dmg`（拖入"应用程序"） | `LLM-Router_x.y.z-aarch64.app.tar.gz`（解压得 `.app`，拖入"应用程序"） |
| macOS Intel | `LLM-Router_x.y.z-x64.dmg` | `LLM-Router_x.y.z-x64.app.tar.gz` |
| Linux x86_64 | `LLM-Router_x.y.z-amd64.deb`（`sudo apt install ./…`） | `LLM-Router_x.y.z-amd64.AppImage`（`chmod +x` 后直接运行） |

> **macOS 未做 Apple 签名/公证**：首次打开请右键 →「打开」，或先执行 `xattr -cr "/Applications/LLM Router.app"` 再双击。

### 首次配置

1. 启动应用，在「提供商」页添加上游（DeepSeek 等），填写 base_url 和 API key。
2. 在「路由」页把模型 ID 映射到提供商（点「从上游获取模型列表」可一键拉取）。
3. 在「集成」页确认网关状态，点击「一键导入 cc-switch」——会弹窗把网关作为「本地网关」提供商导入 cc-switch。
4. 在 cc-switch 中把 haiku / sonnet / opus / fable 四档映射到网关暴露的模型 ID，切换启用。

> Claude Code 通过 cc-switch 间接指向网关（`ANTHROPIC_BASE_URL=http://127.0.0.1:8338`），发消息时按 model 字符串走对应提供商。

## 配置

运行时配置写入各平台的标准配置目录（仓库内 [config.example.json](config.example.json) 为占位示例）：

| 平台 | 路径 |
|---|---|
| Windows | `%APPDATA%\local-llm-router\config.json` |
| macOS | `~/Library/Application Support/local-llm-router/config.json` |
| Linux | `~/.config/local-llm-router/config.json` |

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
  ],
  "close_to_tray": true,             // 关闭窗口时最小化到系统托盘
  "auto_start": false                // 登录后开机自启
}
```

## 开发

完整工具链指南见 [docs/SETUP.md](docs/SETUP.md)（Windows：VS Build Tools 2022 + Rust MSVC；macOS：Xcode CLT + Rust；Linux：webkit2gtk-4.1 等系统依赖）。

```bash
cargo build              # 构建网关库 + Tauri 应用
cargo test               # 单元/集成测试（路由匹配、配置校验、假上游转发）
cargo clippy             # lint
cd crates/app && npx tauri dev     # GUI 开发模式（HMR）
cd crates/app && npx tauri build   # 打包（本机平台：Windows NSIS / macOS dmg / Linux deb+AppImage）
```

## 自动更新

应用内更新：**启动时自动检查**新版本（静默，最多重试 8 次），发现后弹窗提示；集成页也有「检查更新」按钮手动触发。点击「立即更新」→ 下载更新包（带进度条，失败自动重试）→ 公钥验签 → 安装 → 自动重启。

各平台行为差异：

- **Windows 安装版**：完整支持，静默安装后自动重启
- **macOS**：更新包（`.app.tar.gz`）替换应用；因当前未做 Apple 签名/公证，替换后首次启动仍需右键 →「打开」（签名就绪后可无缝更新）
- **Linux**：更新清单指向 AppImage（`deb` 升级需要 sudo，故不用作更新源）；更新会热替换 AppImage 文件，需保持以 AppImage 方式运行
- **绿色版/开发版**（Windows zip、直接运行源码）：不能应用内自我升级，检测到更新会提示到 Releases 页手动下载

> 更新源为 GitHub Releases（`releases/latest/download/latest.json`）；请求携带浏览器 User-Agent（部分网络环境对非浏览器 UA 的连接做概率性拦截）；更新包使用内嵌公钥验签，防篡改。

### 发布新版本

推 tag 即触发**三平台矩阵构建**（Windows x64 / macOS ARM64+Intel / Linux x86_64），自动发布各平台安装版 + 绿色版 + 合并后的多平台更新清单：

```bash
git tag v0.1.11 && git push origin v0.1.11
```

工作流 [.github/workflows/release.yml](.github/workflows/release.yml)：
1. 四个构建任务并行：Windows（NSIS + 绿色 zip）、macOS ARM64 / Intel（dmg + 更新包）、Linux（deb + AppImage），注入 `TAURI_SIGNING_PRIVATE_KEY` 自动签名更新包
2. 每个任务规范化产物文件名（GitHub 资产名会把空格换成点），并产出 `platform-*.json` 元数据
3. 汇总任务下载全部产物 → 创建 Release 上传所有资产 → 读取各平台 `platform-*.json` 按名查询 `asset_id`，生成合并的 `latest.json`（各平台下载 URL 走 `api.github.com` 稳定通道）并上传

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
