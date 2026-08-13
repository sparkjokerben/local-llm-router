# 安装与构建指南

## 一、最终用户：直接使用发行版

无需安装任何工具链。从 [Releases](https://github.com/sparkjokerben/local-llm-router/releases) 下载：

| 平台 | 安装版 | 绿色版（免安装） |
|---|---|---|
| Windows x64 | `LLM-Router_x.y.z-x64-setup.exe`（NSIS 安装程序） | `LLM-Router-portable-win-x64.zip`（解压双击 `llm-router-app.exe` 即用，卸载 = 删文件夹） |
| macOS Apple 芯片 | `LLM-Router_x.y.z-aarch64.dmg`（拖入"应用程序"） | `LLM-Router_x.y.z-aarch64.app.tar.gz`（解压得 `.app`，拖入"应用程序"） |
| macOS Intel | `LLM-Router_x.y.z-x64.dmg` | `LLM-Router_x.y.z-x64.app.tar.gz` |
| Linux x86_64 | `LLM-Router_x.y.z-amd64.deb`（`sudo apt install ./…`） | `LLM-Router_x.y.z-amd64.AppImage`（`chmod +x` 后运行，卸载 = 删文件） |

> **macOS 未做 Apple 签名/公证**：首次打开请右键 →「打开」，或先执行 `xattr -cr "/Applications/LLM Router.app"` 再双击。

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

> WebView2 Runtime：Windows 11 自带；Windows 10 需确认已安装 "Microsoft Edge WebView2 Runtime"。

**macOS 系统依赖**

Xcode Command Line Tools（Tauri 编译需要，含 clang、ld 等）：

```bash
xcode-select --install
```

安装 Rust 后即可直接构建（Tauri 在 macOS 上默认以 Apple WebKit 渲染，无需额外系统库）。

**Linux 系统依赖**（Debian/Ubuntu 系；webkit2gtk 版本必须为 4.1，对应 Tauri v2）

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev patchelf
```

> 打包 AppImage 若提示 FUSE 相关错误，安装 `libfuse2`。Rust 用 `rustup toolchain install stable` 默认工具链即可。

**4. 仓库依赖（三平台通用）**

```bash
# 前端依赖
cd ui
npm install

# Tauri CLI
npm install -g @tauri-apps/cli
```

### 构建与测试

```bash
cargo build            # 首次编译约 400 个 crate，较慢属正常
cargo test             # 路由匹配 / 配置校验 / 假上游转发测试
cargo clippy           # lint 全绿
```

### 开发模式（GUI 热更新）

```bash
cd crates/app
npx tauri dev          # 启动 Vite(1420) + Tauri 窗口，改前端即热更新
```

### 打包安装版（本机平台）

```bash
cd crates/app
npx tauri build        # Windows: bundle\nsis\…-setup.exe；macOS: bundle/dmg/…dmg；Linux: bundle/deb+appimage
```

> Windows 首次打包 tauri 需从 GitHub 下载 NSIS 工具链；网络不稳时可用 curl 重试手动下载到 `%LOCALAPPDATA%\tauri\NSIS\`。

## 三、发布新版本

1. 改 `Cargo.toml`（workspace.package.version）与 `crates/app/tauri.conf.json` 的 `version`；
2. 推 tag：

```bash
git tag v0.1.10
git push origin v0.1.10
```

3. [Actions](https://github.com/sparkjokerben/local-llm-router/actions) 自动跑**四任务矩阵**（Windows x64 / macOS ARM64 / macOS Intel / Linux x86_64），每个任务产出安装版 + 绿色版 + 更新包签名；汇总任务把各平台资产上传到 Releases 并合并生成多平台 `latest.json`（各平台下载 URL 走 `api.github.com` 稳定通道）。已安装用户的应用内更新会在启动时自动检测到新版本（请求携带浏览器 UA，规避部分网络环境对非浏览器 UA 的概率性拦截）。也可以手动触发 `workflow_dispatch`（只出构建产物，不建 Release）。

### 更新签名私钥（重要）

安装版的应用内更新通过签名校验包完整性，签名私钥 `TAURI_SIGNING_PRIVATE_KEY` 存于仓库 secret：

```bash
# 重新生成（仅丢失时执行；换 key 后老版本将无法更新，需重新安装）
npx tauri signer generate -w ~/.tauri/llm-router.key --ci
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/llm-router.key

# 私钥公钥同步更新到 crates/app/tauri.conf.json 的 plugins.updater.pubkey
```

**私钥（含密码）丢失将永远无法发布新更新**，请备份 `~/.tauri/llm-router.key`。
