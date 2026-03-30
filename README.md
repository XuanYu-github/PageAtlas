# PageAtlas Lite

> [English](./README.en.md)

纯浏览器 PDF 结构编辑与理解工作区，可部署于 GitHub Pages。

`PageAtlas Lite` 是一个 GPLv3 协议的静态 SvelteKit 应用，所有 PDF 操作均在浏览器内完成：

- 本地查看与编辑 PDF 书签 / 目录（ToC）
- 通过自带 API Key 的 AI，从页面图像或粘贴的纯文本生成目录
- 基于页级和章节级引用进行 PDF 问答
- 从当前目录大纲生成知识图谱
- 导出更新后的 PDF，无需将文件发送到自定义后端

本仓库是在 Tocify 基础上大幅修改的衍生版本，重构为静态 GitHub Pages 应用，AI 调用完全在浏览器端完成，无后端服务。

## 截图

| 主工作区 | 文本目录格式化 |
| --- | --- |
| ![主工作区](./screenshots/basic.png) | ![文本格式化](./screenshots/text.gif) |

| 样式编辑 |
| --- |
| ![样式编辑](./screenshots/style.png) |

## 为什么选择 PageAtlas Lite

与原始的服务端辅助流程不同，Lite 版本专为完全静态托管设计：

- 无需自定义服务器
- 无需 Redis / 后端缓存
- 无需服务端 OCR 流水线
- 运行时无需 API 路由
- 使用你自己的 API Key 直接从浏览器调用模型

这让它适用于 GitHub Pages 和其他静态主机，同时保留了完整的 PDF 工作流。

## 功能概览

| 模块 | 功能 |
| --- | --- |
| PDF 预览 | 本地预览、导航、缩放、导出 |
| 目录编辑 | 手动大纲编辑、拖拽层级、页码偏移、标签、前缀 |
| AI 目录生成 | 将扫描的目录页或粘贴的纯文本解析为结构化大纲 |
| PDF 问答 | 按当前页、选定页范围或当前章节提问 |
| 多模态阅读 | 若页面无可提取文本，仍可通过附带的页面图片进行问答 |
| 知识图谱 | 从当前目录构建关系图谱 |
| BYOK 预设 | 本地保存、导入、导出、复用 OpenAI 兼容接口的预设 |

## 支持的 AI 提供商

所有 AI 功能均为 BYOK（自带密钥），在浏览器中运行。

- Gemini
- Qwen
- Zhipu
- Doubao
- OpenAI 兼容接口

说明：

- API Key 存储在你自己设备的浏览器本地存储中。
- OpenAI 兼容预设在本地保存 `名称`、`Base URL` 和模型名称。
- 在 GitHub Pages 中是否可用取决于对应提供商或网关是否支持浏览器端 CORS。

## Lite 架构

PageAtlas Lite 将 PDF 文件保留在客户端，使用浏览器端的 AI 辅助模块。

- PDF 预览与编辑：浏览器本地
- 目录生成：浏览器 -> 提供商
- 问答：浏览器本地提取 + 浏览器 -> 提供商
- 知识图谱：浏览器 -> 提供商
- 导出 PDF：浏览器本地生成

Lite 版本已移除所有 `src/routes/api/**` 运行时接口。

## 开发

安装依赖：

```bash
pnpm install --frozen-lockfile
```

启动开发服务器：

```bash
pnpm dev
```

类型检查：

```bash
pnpm check
```

构建静态输出：

```bash
pnpm build
```

预览生产构建：

```bash
pnpm preview
```

## 桌面版开发

桌面版使用 Tauri 2，支持 Windows、macOS 和 Ubuntu。

```bash
pnpm tauri:dev
```

## GitHub Pages 部署

本仓库配置部署地址：

`https://xuanyu-github.github.io/PageAtlas/`

项目使用：

- `@sveltejs/adapter-static`
- 基础路径 `/PageAtlas`
- 工作流：`.github/workflows/deploy-pages.yml`

### GitHub 仓库设置清单

首次发布前，请在 GitHub 确认以下设置：

1. `Settings -> Pages -> Build and deployment -> Source` = `GitHub Actions`
2. `Settings -> Actions -> General -> Workflow permissions` = `Read and write permissions`
3. 默认分支为 `main`
4. 仓库为公开，或你的 Pages 计划支持私有仓库发布

### 发布流程

推送到 `main` 后，GitHub Actions 会自动构建并将 `build/` 的内容部署到 Pages。

## BYOK 使用建议

为了获得最佳的 Lite 体验：

- 优先选择支持浏览器 CORS 的提供商或网关
- 对扫描页/纯图片页使用支持多模态的模型
- 保存一份 OpenAI 兼容预设以便反复使用
- 如果出现浏览器网络故障，逐个测试不同提供商

## 当前限制

- 无后端意味着没有服务端 OCR 任务、任务队列或服务端缓存
- 大型 PDF 仍然占用较多内存，因为提取在浏览器中完成
- 多模态问答是纯图片页的兜底方案；Lite 版没有独立的 OCR 持久化流水线
- 部分提供商即使有有效 API Key，也可能因浏览器 CORS 限制而失败

## 许可证

本项目仍为 GPLv3 协议。如果你分发修改版本，请保留所需的版权声明和许可证声明。
