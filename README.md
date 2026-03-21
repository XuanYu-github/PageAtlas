# PageAtlas Lite

Browser-only PDF structure and understanding workspace for GitHub Pages.

`PageAtlas Lite` is a GPLv3, static SvelteKit app for working with PDFs entirely in the browser:

- inspect and edit PDF bookmarks / ToC locally
- generate ToCs from page images or pasted raw text with BYOK AI
- ask grounded page-level and chapter-level questions with citations
- explore a knowledge-board graph generated from the current outline
- export an updated PDF without sending the file to a custom backend

This repository is a substantially modified derivative of Tocify, rebuilt as a static GitHub Pages app with browser-side AI calls and no backend services.

## Screenshots

| Main Workspace | Text ToC Formatting |
| --- | --- |
| ![Main workspace](./screenshots/basic.png) | ![Text formatting](./screenshots/text.gif) |

| Style Editing |
| --- |
| ![Style editing](./screenshots/style.png) |

## Why PageAtlas Lite

Unlike the original server-assisted workflow, this Lite edition is designed for fully static hosting:

- no custom server
- no Redis / backend cache
- no server-side OCR pipeline
- no API routes required at runtime
- direct browser-to-model calls using your own key

That makes it suitable for GitHub Pages and other static hosts, while still keeping advanced PDF workflows available.

## Feature Overview

| Area | What it does |
| --- | --- |
| PDF Preview | Local preview, navigation, scale, and export |
| ToC Editing | Manual outline editing, drag-and-drop hierarchy, page offsets, labels, prefixes |
| AI ToC Generation | Parse scanned ToC pages or pasted raw text into structured outline data |
| PDF Q&A | Ask by current page, selected page ranges, or current chapter |
| Multimodal Reading | If a page has no extractable text, Lite can still query it through attached page images |
| Knowledge Board | Build a relationship graph from the current ToC |
| BYOK Presets | Save, import, export, and reuse OpenAI-compatible provider presets locally |

## Supported AI Providers

All AI features are BYOK and run in the browser.

- Gemini
- Qwen
- Zhipu
- Doubao
- OpenAI-compatible endpoints

Notes:

- Your API key is stored in browser storage on your own machine.
- OpenAI-compatible presets store `name`, `baseURL`, and model names locally.
- Whether a provider works in GitHub Pages depends on browser-side CORS support from that provider or gateway.

## Lite Architecture

PageAtlas Lite keeps the PDF file on the client side and uses browser-side AI helpers.

- PDF preview and editing: browser local
- ToC generation: browser -> provider
- Q&A: browser local extraction + browser -> provider
- Knowledge board: browser -> provider
- Exported PDF: generated locally in browser

There is no runtime dependency on `src/routes/api/**` because those routes have been removed from Lite.

## Development

Install:

```bash
pnpm install --frozen-lockfile
```

Run dev server:

```bash
pnpm dev
```

Type-check:

```bash
pnpm check
```

Build static output:

```bash
pnpm build
```

Preview production build:

```bash
pnpm preview
```

## GitHub Pages Deployment

This repo is configured for deployment at:

`https://xuanyu-github.github.io/PageAtlas/`

The project uses:

- `@sveltejs/adapter-static`
- base path `/PageAtlas`
- workflow: `.github/workflows/deploy-pages.yml`

### GitHub repository settings checklist

Before first release, confirm these repository settings in GitHub:

1. `Settings -> Pages -> Build and deployment -> Source` = `GitHub Actions`
2. `Settings -> Actions -> General -> Workflow permissions` = `Read and write permissions`
3. Default branch is `main`
4. The repository is public, or your Pages plan supports private repo publishing

### Publish flow

Push to `main` and GitHub Actions will build and deploy the contents of `build/` to Pages.

## BYOK Setup Tips

For the smoothest Lite experience:

- prefer providers or gateways that allow browser CORS
- use multimodal-capable models for scanned/image-only pages
- keep a saved OpenAI-compatible preset for repeated use
- test one provider at a time if you see browser network failures

## Current Limitations

- No backend means no server-side OCR jobs, task queues, or server caching
- Large PDFs are still memory-intensive because extraction happens in-browser
- Multimodal Q&A is the fallback for image-only pages; there is no separate OCR persistence pipeline in Lite
- Some providers may fail in-browser due to CORS even with a valid API key

## License

This project remains GPLv3. If you redistribute modified versions, preserve the required copyright and license notices.
