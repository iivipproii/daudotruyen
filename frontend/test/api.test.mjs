import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApiUrl, createApiClient, resolveApiBase } from '../src/lib/api.js';

test('resolveApiBase rejects localhost in production', () => {
  assert.throws(
    () => resolveApiBase({ PROD: true, VITE_API_URL: 'http://localhost:4000/api' }),
    /Invalid production VITE_API_URL/
  );
});

test('buildApiUrl joins base URL and path safely', () => {
  assert.equal(buildApiUrl('https://api.example.com/api/', '/stories'), 'https://api.example.com/api/stories');
  assert.equal(buildApiUrl('https://api.example.com/api', 'stories'), 'https://api.example.com/api/stories');
});

test('api client surfaces backend JSON errors directly', async () => {
  const api = createApiClient({
    baseUrl: 'https://api.example.com',
    storage: { getItem: () => null },
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => JSON.stringify({ message: 'Thiếu bucket story-covers' })
    })
  });

  await assert.rejects(() => api('/uploads/cover', { method: 'POST' }), /Thiếu bucket story-covers/);
});

test('api client falls back to readable text for non-JSON errors', async () => {
  const api = createApiClient({
    baseUrl: 'https://api.example.com',
    storage: { getItem: () => null },
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => '<html><body>Supabase schema chưa có view public.catalog</body></html>'
    })
  });

  await assert.rejects(() => api('/author/taxonomy'), /Supabase schema chưa có view public.catalog/);
});

test('api client wraps network failures with a concrete message', async () => {
  const api = createApiClient({
    baseUrl: 'https://api.example.com',
    storage: { getItem: () => null },
    fetchImpl: async () => {
      throw new TypeError('Failed to fetch');
    }
  });

  await assert.rejects(
    () => api('/author/stories', { method: 'POST' }),
    /Không thể kết nối tới API: https:\/\/api\.example\.com\/author\/stories/
  );
});
