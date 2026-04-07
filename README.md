# PageAtlas

> [English](./README.en.md)

PageAtlas 是一个本地优先的 PDF 工作台：在同一个界面里完成目录整理、页级/章节级问答、多模态阅读和知识图谱生成。

当前仓库已经不是“纯静态无后端”的状态，而是双形态架构：

- `Web 模式`：静态 SvelteKit 应用（GitHub Pages）
- `Desktop 模式`：Tauri 2 桌面壳 + 本地原生 AI 桥接（用于绕过部分浏览器 CORS 限制）

## 截图

| 主工作区 | 文本目录格式化 |
| --- | --- |
| ![主工作区](./screenshots/basic.png) | ![文本目录格式化](./screenshots/text.gif) |

| 样式编辑 |
| --- |
| ![样式编辑](./screenshots/style.png) |

## 核心能力

| 模块 | 说明 |
| --- | --- |
| PDF 预览与编辑 | 本地加载、缩放/跳转、目录树编辑、导出更新后的 PDF |
| AI 目录生成 | 从目录页图像或粘贴文本生成结构化 ToC |
| PDF Q&A | 支持当前页、页范围、当前章节等问答作用域，并返回引用页 |
| 多模态问答 | 对扫描页或无可提取文本页面，自动补充页面图像进行问答 |
| Knowledge Board | 基于当前目录自动构建知识关系图 |
| OpenAI 兼容预设 | 本地保存/导入/导出 Base URL + 模型配置，支持默认预设 |
| Reasoning Effort | OpenAI 兼容接口支持 `none/low/medium/high/xhigh` |

## 架构与运行模式

### 1) Web 模式（静态部署）

- 前端：SvelteKit 2 + Svelte 5 + Vite 6
- 部署：`@sveltejs/adapter-static`，GitHub Pages 基础路径 `/PageAtlas`
- AI 请求：浏览器直连模型提供商（BYOK）

### 2) Desktop 模式（本地原生桥接）

- 框架：Tauri 2（`src-tauri/`）
- 桌面桥接：`src-tauri/src/ai.rs`
- 作用：对 OpenAI 兼容协议提供商走本地原生 HTTP，规避浏览器 CORS/预检限制
- 边界：这是“本地后端桥接”，不是远程 SaaS 服务器

## AI 提供商与路由策略

支持提供商：

- Gemini
- Qwen
- Zhipu
- Doubao
- OpenAI Compatible

路由说明：

- `Web 模式`：全部由浏览器发起请求（受目标服务 CORS 策略影响）
- `Desktop 模式`：
  - Gemini 仍走浏览器侧调用
  - Qwen / Zhipu / Doubao / OpenAI Compatible 可走 Tauri 本地桥接

## 隐私与数据

- PDF 文件处理以本地为主，不上传到项目自建远程服务
- API Key 与 OpenAI 兼容预设保存在本地存储（localStorage）
- 模型请求发送给你配置的第三方提供商

## 快速开始

### 环境要求

- Node.js `22`（LTS，仓库内含 `.nvmrc` / `.node-version`）
- pnpm `10+`
- Desktop 开发需要 Rust 工具链与 Tauri 依赖

### 安装

```bash
pnpm install --frozen-lockfile
```

### Web 开发与构建

```bash
pnpm dev
pnpm check
pnpm build
pnpm preview
```

### Desktop 开发与打包

```bash
pnpm tauri:dev
pnpm tauri:build
```

打包产物默认位于 `src-tauri/target/release/bundle/`。

## 发布与部署

### GitHub Pages（Web）

- URL：`https://xuanyu-github.github.io/PageAtlas/`
- 工作流：`.github/workflows/deploy-pages.yml`
- 推送到 `main` 后自动构建并部署静态产物 `build/`

### Desktop（安装包）

当前 Tauri 配置目标（`src-tauri/tauri.conf.json`）：

- Windows: `nsis`（安装器 `.exe`）
- macOS: `dmg`（`.dmg`）

> 当前 Release 流水线先自动发布 Windows 版本（包含安装版 setup 和免安装版可执行文件）；macOS / Linux 产物仍保留在 Tauri 配置里，后续补齐对应 CI 构建后再一起发布。

## 关键目录

- `src/routes/+page.svelte`：主工作区（目录、问答、图谱等流程入口）
- `src/components/`：UI 组件（设置、面板、模态框、知识图谱）
- `src/lib/client/ai.ts`：浏览器侧 AI 编排与诊断
- `src/lib/client/ai-config.ts`：AI 配置与本地存储
- `src/lib/client/pdf-qa.ts`：页文本提取与问答上下文构建
- `src-tauri/src/ai.rs`：桌面本地 AI 请求桥接
- `src-tauri/src/main.rs`：Tauri 命令与插件注册

## 当前限制

- Web 模式仍受提供商 CORS 策略约束
- 大体积 PDF 依然会有较高本地内存占用
- 桌面桥接当前不包含 Gemini 路由

## 许可证

本项目采用 GPLv3。分发修改版本时请保留版权与许可证声明。
