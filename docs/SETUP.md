# 安装与构建指南

## 一、最终用户：直接使用发行版

无需安装任何工具链。从 [Releases](https://github.com/sparkjokerben/local-llm-router/releases) 下载：

| 版本 | 文件 | 说明 |
|---|---|---|
| 安装版 | `LLM Router_x.y.z_x64-setup.exe` | NSIS 安装程序，装完有开始菜单快捷方式 |
| 绿色版 | `LLM-Router-portable-win-x64.zip` | 解压双击 `llm-router-app.exe` 即用，卸载 = 删文件夹 |

运行后：

1. 「提供商」页添加上游，填写 base_url 与 API key；
2. 「路由」页映射 model → 提供商（可用「从上游获取模型列表」一键拉取）；
3. 「集成」页点「一键导入 cc-switch」，在 cc-switch 里映射四档 Claude 模型到网关的模型 ID，切换启用。

### 安全建议：收紧配置文件权限

运行时会话（含 API key）写入 `%APPDATA%\local-llm-router\config.json`。可选收紧权限：

```powershell
icacls "%APPDATA%\local-llm-router\config.json" /inheritance:r /grant:r "%USERNAME%:(R,W)"
```

## 二、开发者：从源码构建

### 工具链（全部手动安装）

**1. VS Build Tools 2022（C++ 工作负载，约 2-5GB，最重的一步）**

> 硬前提：Tauri 与 rustls（`ring`）的 C 实现都需要 MSVC `cl.exe`。

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

验证：打开 "Developer Command Prompt for VS 2022"，`cl` 能输出版本。

**2. Rust（MSVC 工具链）**

```powershell
winget install Rustlang.Rustup
rustup toolchain install stable-x86_64-pc-windows-msvc
rustup default stable-x86_64-pc-windows-msvc
```

验证：`rustc -vV` 的 host 为 `x86_64-pc-windows-msvc`。

**3. Node.js 22+**（构建前端，`winget install OpenJS.NodeJS.LTS`）

**4. 仓库依赖**

```powershell
# 前端依赖
cd ui
npm install

# Tauri CLI
npm install -g @tauri-apps/cli
```

> WebView2 Runtime：Windows 11 自带；Windows 10 需确认已安装 "Microsoft Edge WebView2 Runtime"。

### 构建与测试

```powershell
cargo build            # 首次编译约 400 个 crate，较慢属正常
cargo test             # 路由匹配 / 配置校验 / 假上游转发测试
cargo clippy           # lint 全绿
```

### 开发模式（GUI 热更新）

```powershell
cd crates/app
npx tauri dev          # 启动 Vite(1420) + Tauri 窗口，改前端即热更新
```

### 打包安装版

```powershell
cd crates/app
npx tauri build        # 产物: target\release\bundle\nsis\LLM Router_x.y.z_x64-setup.exe
```

> 首次打包 tauri 需从 GitHub 下载 NSIS 工具链；网络不稳时可用 curl 重试手动下载到 `%LOCALAPPDATA%\tauri\NSIS\`。

## 三、发布新版本

1. 改 `Cargo.toml`（workspace.package.version）与 `crates/app/tauri.conf.json` 的 `version`；
2. 推 tag：

```bash
git tag v0.2.0
git push origin v0.2.0
```

3. [Actions](https://github.com/sparkjokerben/local-llm-router/actions) 自动在 `windows-latest` 构建，产出**安装版 + 绿色版**并发布到 Releases。也可以手动触发 `workflow_dispatch`（只出构建产物，不建 Release）。
