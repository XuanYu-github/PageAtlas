# AGENTS.md

## Purpose
- This file guides coding agents working in `PageAtlas Lite`.
- The repository supports both a static SvelteKit web build for GitHub Pages and a Tauri desktop shell for local-app distributions.

## Canonical Rule Files
- No `.cursorrules` file was found.
- No `.cursor/rules/` directory was found.
- No `.github/copilot-instructions.md` file was found.
- Treat this file as the main agent instruction source.

## Product Summary
- `PageAtlas Lite` is a GPLv3 PDF workspace.
- Core features: local PDF preview, local ToC editing, AI ToC generation, page/chapter Q&A, and knowledge-board generation.
- Web mode remains browser-first.
- Desktop mode uses a local Tauri backend for provider requests that fail in browser-only mode due to CORS.
- There is no remote server-side indexing, OCR pipeline, Redis cache, or backend document storage.

## Stack And Runtime
- SvelteKit 2 with Svelte 5, Vite 6, and Tailwind CSS 3.
- Static adapter: `@sveltejs/adapter-static`.
- Deployment target: GitHub Pages under base path `/PageAtlas`.
- Desktop target: Tauri 2 with Rust backend under `src-tauri/`.
- Package manager: `pnpm`.
- Build target: `es2018`.
- `.npmrc` still uses `engine-strict=true`.

## Repository Map
- `src/routes/+page.svelte`: main app shell and PDF workflow.
- `src/components/*`: editor, viewer, settings, graph, modals, and panels.
- `src/lib/client/ai.ts`: browser-side AI provider wrapper.
- `src-tauri/src/ai.rs`: desktop-side AI request bridge for Tauri mode.
- `src/lib/client/pdf-qa.ts`: browser-side page extraction and QA helpers.
- `src/lib/pdf/*`: PDF preview, outline writing, page labels, and worker logic.
- `src/lib/utils/*`: tree, chapter, graph, and helper utilities.
- `src/stores.ts`: shared app state and autosave.
- `src/lib/i18n/*`: locale bootstrap and dictionaries.
- `.github/workflows/deploy-pages.yml`: GitHub Pages deployment workflow.

## Commands
- Install: `pnpm install --frozen-lockfile`
- Dev: `pnpm dev`
- Build: `pnpm build`
- Preview: `pnpm preview`
- Desktop dev: `pnpm tauri:dev`
- Desktop build: `pnpm tauri:build`
- Check: `pnpm check`
- Watch check: `pnpm check:watch`
- Lint: none configured.
- Tests: none configured.
- Single test command: not available.

## Validation Expectations
- Run `pnpm check` after most code changes.
- Run `pnpm build` after UI, routing, PDF, worker, AI, or static-path changes.
- If validation cannot run, state exactly why.
- Do not claim `pnpm lint` or `pnpm test` ran.

## Static Deployment Rules
- This repository must remain fully static-build compatible.
- Do not add new `src/routes/api/**` endpoints.
- Do not add `src/lib/server/**` modules.
- Do not introduce backend-only env access like `$env/dynamic/private`.
- Prefer browser-side storage (`localStorage`, `IndexedDB`) for stateful Lite features.
- Respect the GitHub Pages base path `/PageAtlas`.
- Use `$app/paths` `base` for app-local links and static assets.
- Keep worker, font, favicon, and media URLs base-aware.

## Desktop Rules
- Desktop builds use `PAGEATLAS_TARGET=desktop` so web base path must resolve to `''` in that mode.
- Native provider requests for Tauri should go through `src-tauri/src/ai.rs`, not ad hoc shell calls.
- Keep the desktop bridge limited to local execution; do not add a remote backend service.

## AI / Provider Rules
- Model call orchestration stays centralized in `src/lib/client/ai.ts`.
- Web mode may call providers from the browser.
- Desktop mode may route OpenAI-compatible providers through the Tauri backend to bypass browser CORS.
- Assume BYOK: user enters API keys locally.
- Never hardcode secrets, API keys, or personal tokens into the repo.
- OpenAI-compatible presets should stay local to the browser.
- Be mindful of CORS when adding provider support.
- Prefer reusable wrappers over duplicating provider logic in components.

## PDF And Performance Rules
- `pdfjs-dist`, `pdf-lib`, and the PDF worker are large; avoid unnecessary bundle bloat.
- Prefer dynamic imports for AI-heavy or optional flows when practical.
- Keep `vite.config.ts` manual chunking aligned with major heavy dependencies.
- Avoid duplicating page-image generation or page-text extraction logic.
- Reuse `PDFService` and browser helpers rather than inventing parallel pipelines.
- If you add large client dependencies, verify `pnpm build` for chunk warnings.

## Formatting Conventions
- No formatter is enforced; preserve local style.
- Match the surrounding file's indentation, semicolon use, and spacing.
- Avoid broad opportunistic reformatting.
- Keep edits minimal and easy to review.

## Import Conventions
- Typical order: framework/vendor, blank line, `$lib`/`$app` aliases, blank line, relatives.
- Prefer `import type` for type-only imports.
- Use `$lib` and `$app/*` aliases where they improve clarity.
- Keep dynamic imports inside event handlers or optional flows when used for bundle splitting.

## TypeScript Conventions
- `tsconfig.json` is strict.
- Avoid `any`; prefer `unknown` and narrow.
- Type component props, event payloads, and helper returns explicitly.
- Reuse existing domain types like `TocItem`, `PDFState`, `QaScope`, and chapter types.
- Guard browser-only APIs with `browser` or runtime checks.

## Naming Conventions
- Components, interfaces, and type aliases: PascalCase.
- Functions, stores, local vars: camelCase.
- Constants and config tables: UPPER_SNAKE_CASE when appropriate.
- Route files must keep SvelteKit naming such as `+page.svelte` and `+layout.ts`.

## Svelte And State Patterns
- Existing code mixes classic Svelte patterns with a few newer APIs; stay consistent per file.
- Shared state lives in `src/stores.ts` and local component state.
- Use `createEventDispatcher` where components already follow that pattern.
- Clean up timers, listeners, and observers in `onDestroy`.
- Keep transient UI state local unless multiple features truly need it.

## Styling Conventions
- Tailwind utilities are the main styling layer.
- Preserve the hand-crafted, paper-like visual language.
- Reuse borders, shadows, spacing, and rounded corners already present in the app.
- Ensure changes work on both desktop and mobile layouts.

## I18n And Content
- User-facing strings should go through `svelte-i18n`.
- Update both `src/lib/i18n/locales/en.json` and `src/lib/i18n/locales/zh.json` when changing UI text.
- Keep English and Chinese content aligned in intent.
- Avoid hardcoding new display strings in components unless truly necessary.

## Files To Treat Carefully
- `svelte.config.js`: controls static output and GitHub Pages base path.
- `vite.config.ts`: controls chunking for heavy client dependencies.
- `src/lib/pdf/service.ts`: PDF worker/font/static asset paths must stay base-aware.
- `src/lib/workers/pdf.worker.ts`: worker runtime path must remain static-safe.
- `src/lib/client/ai.ts`: all provider compatibility logic is centralized here.

## Agent Workflow
- Read nearby code before editing, especially around PDF worker, AI wrappers, and base-path handling.
- Prefer the smallest safe change.
- Keep the app static-deployable at all times.
- Preserve local formatting and naming patterns.
- Report the commands you ran and whether they succeeded.
- Update this file if architecture, build commands, or deployment assumptions change.
