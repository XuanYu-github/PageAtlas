# PageAtlas

> [中文](./README.md)

PageAtlas is a local-first PDF workspace for building outlines, asking grounded questions, reading scanned pages with multimodal models, and generating a knowledge board from the document structure.

The repository now ships in two modes:

- `Web mode`: a static SvelteKit app for GitHub Pages
- `Desktop mode`: a Tauri 2 shell with a local native AI bridge for providers that are blocked by browser CORS

## Screenshots

| Main Workspace | Text ToC Formatting |
| --- | --- |
| ![Main workspace](./screenshots/basic.png) | ![Text formatting](./screenshots/text.gif) |

| Style Editing |
| --- |
| ![Style editing](./screenshots/style.png) |

## Core Capabilities

| Area | What it does |
| --- | --- |
| PDF Preview and Editing | Local preview, navigation, zoom, outline editing, and PDF export |
| AI ToC Generation | Parse scanned ToC pages or pasted raw text into structured outline data |
| PDF Q&A | Ask by current page, page range, or current chapter with citations |
| Multimodal Reading | Use page images when a page has no extractable text |
| Knowledge Board | Build a relationship graph from the current outline |
| OpenAI-Compatible Presets | Save, import, export, and reuse local gateway presets |
| Reasoning Effort | Supports `none`, `low`, `medium`, `high`, and `xhigh` for OpenAI-compatible providers |

## Architecture

### Web mode

- SvelteKit 2 + Svelte 5 + Vite 6
- Static adapter deployment to GitHub Pages under `/PageAtlas`
- Browser-side BYOK requests to model providers

### Desktop mode

- Tauri 2 app in `src-tauri/`
- Local bridge in `src-tauri/src/ai.rs`
- Used to route OpenAI-compatible providers through native HTTP and avoid browser CORS / preflight issues

## AI Providers

Supported providers:

- Gemini
- Qwen
- Zhipu
- Doubao
- OpenAI Compatible

Routing summary:

- Web mode: all requests come from the browser
- Desktop mode:
  - Gemini stays on the browser path
  - Qwen / Zhipu / Doubao / OpenAI Compatible can use the local bridge

## Privacy and Data

- PDFs are processed locally first; there is no project-owned remote backend
- API keys and OpenAI-compatible presets are stored in localStorage
- Model requests are sent only to the provider or gateway you configure

## Quick Start

### Requirements

- Node.js `22` LTS
- pnpm `10+`
- Rust toolchain for desktop development

### Install

```bash
pnpm install --frozen-lockfile
```

### Web development

```bash
pnpm dev
pnpm check
pnpm build
pnpm preview
```

### Desktop development and packaging

```bash
pnpm tauri:dev
pnpm tauri:build
```

Build outputs are written to `src-tauri/target/release/bundle/`.

## Release and Deployment

### GitHub Pages

- URL: `https://xuanyu-github.github.io/PageAtlas/`
- Workflow: `.github/workflows/deploy-pages.yml`
- Pushes to `main` automatically build and deploy the static site in `build/`

### Desktop installers

The current Tauri bundle targets are:

- Windows: `nsis` (`.exe` installer)
- macOS: `dmg` (`.dmg`)

> The current release pipeline first publishes Windows artifacts (setup installer plus portable `PageAtlas_0.1.0_x64-portable.exe`); macOS and Linux outputs are still configured in Tauri and can be added back after their CI builds are stabilized.

## Key Paths

- `src/routes/+page.svelte`: main app workflow
- `src/components/`: settings, panels, dialogs, and graph UI
- `src/lib/client/ai.ts`: browser-side AI orchestration and diagnostics
- `src/lib/client/ai-config.ts`: AI config and local storage helpers
- `src/lib/client/pdf-qa.ts`: page-text extraction and Q&A context building
- `src-tauri/src/ai.rs`: desktop AI bridge
- `src-tauri/src/main.rs`: Tauri command and plugin setup

## Current Limits

- Web mode still depends on provider CORS support
- Large PDFs can still be memory-heavy during local extraction
- The desktop bridge currently does not route Gemini

## License

GPLv3. If you redistribute modified versions, keep the required copyright and license notices.
