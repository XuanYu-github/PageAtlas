import adapter from '@sveltejs/adapter-static';
import {vitePreprocess} from '@sveltejs/vite-plugin-svelte';

const isDev = process.argv.includes('dev');

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter({strict: false}),
    paths: {
      base: isDev ? '' : '/PageAtlas',
    },
    prerender: {
      entries: ['*'],
    },
  },

  onwarn: (warning, handler) => {
    const {code} = warning;
    if (code === 'css_unused_selector') return;

    handler(warning);
  },
};

export default config;
