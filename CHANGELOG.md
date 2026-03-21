# Changelog

All notable changes to this project are documented here.

## v0.1.0 - 2026-03-21

Initial public release of `PageAtlas Lite`.

### Highlights

- Rebranded the project from `Tocify` to `PageAtlas Lite`
- Rebuilt the app as a fully static, browser-only PDF workspace for GitHub Pages
- Switched AI features to BYOK browser-direct provider calls
- Added grounded page-level and chapter-level PDF Q&A
- Added knowledge-board graph generation from the current outline

### Added

- Browser-side AI provider wrapper for Gemini, Qwen, Zhipu, Doubao, and OpenAI-compatible endpoints
- OpenAI-compatible preset save, delete, import, export, default, and apply flows
- Local PDF page-text extraction helpers for question answering
- Multimodal fallback for image-only pages during PDF Q&A
- GitHub Pages deployment workflow for static publishing
- Updated branding, logo, favicon, README, and agent guidance for `PageAtlas Lite`

### Changed

- Converted ToC generation from server API calls to browser-direct model calls
- Converted knowledge-board generation from server API calls to browser-direct model calls
- Converted PDF Q&A to local browser extraction plus direct model calls
- Updated the app to use GitHub Pages base path `/PageAtlas`
- Updated SEO, sitemap, robots, and repository links to `https://xuanyu-github.github.io/PageAtlas/`
- Improved client bundling and manual chunking for large PDF and AI dependencies

### Removed

- Removed all runtime `src/routes/api/**` endpoints from the Lite build path
- Removed server-only document indexing, OCR jobs, chapter cache, and rate limiting
- Removed Redis and other backend-only dependencies
- Removed old client-app promo UI and stale verification files

### Deployment Notes

- Static output is generated with `@sveltejs/adapter-static`
- GitHub Pages deployment is handled by `.github/workflows/deploy-pages.yml`
- The app is intended to publish at `https://xuanyu-github.github.io/PageAtlas/`

### Limitations

- This Lite release has no backend services
- Provider CORS support is required for browser-side AI access
- Large PDFs can still be memory-intensive because extraction happens in-browser
- Image-only pages rely on multimodal model input during Q&A instead of a standalone OCR pipeline
