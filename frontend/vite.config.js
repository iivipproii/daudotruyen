import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

function manualChunks(id) {
  if (id.includes('node_modules')) return 'vendor';
  if (id.includes('/components/account/AccountPages.jsx')) return 'account-pages';
  if (id.includes('/components/author/AuthorDashboard.jsx')) return 'author-dashboard';
  if (id.includes('/components/admin/AdminCMS.jsx')) return 'admin-cms';
  if (id.includes('/components/search/SearchPage.jsx')) return 'search-page';
  if (id.includes('/components/ranking/RankingPage.jsx')) return 'ranking-page';
  if (id.includes('/components/story/StoryDetailPage.jsx')) return 'story-detail-page';
  if (id.includes('/components/reader/ReaderPage.jsx')) return 'reader-page';
}

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'dist/bundle-stats.html',
      gzipSize: true,
      brotliSize: true,
      open: false,
      template: 'treemap'
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks
      }
    }
  }
});
