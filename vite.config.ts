import {sveltekit} from '@sveltejs/kit/vite';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('pdfjs-dist')) {
            return 'pdf-engine';
          }
          if (id.includes('pdf-lib') || id.includes('pdf-fontkit')) {
            return 'pdf-edit';
          }
          if (id.includes('@google/generative-ai') || id.includes('openai') || id.includes('jsonrepair')) {
            return 'llm-clients';
          }
          if (id.includes('roughjs')) {
            return 'graph';
          }
          if (id.includes('lucide-svelte')) {
            return 'icons';
          }
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    },
    target: 'es2018',
    chunkSizeWarningLimit: 1000
  }
});
