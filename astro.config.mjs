import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL || 'https://argota.example.com',
  integrations: [sitemap()],
  output: 'static',
  build: {
    format: 'directory',
  },
});
