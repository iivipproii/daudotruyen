function stripHtml(value = '') {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tryParseJson(value = '') {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function responseErrorMessage({ status, statusText, url, payload, rawText }) {
  const textMessage = stripHtml(rawText);
  const payloadMessage = typeof payload?.message === 'string' ? payload.message.trim() : '';
  if (payloadMessage) return payloadMessage;
  if (textMessage) return textMessage;
  if (status === 401) return 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.';
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (status === 404) return `Không tìm thấy API ${url}.`;
  if (status >= 500) return `Máy chủ API gặp lỗi (${status}${statusText ? ` ${statusText}` : ''}).`;
  return `Yêu cầu API thất bại (${status}${statusText ? ` ${statusText}` : ''}).`;
}

function networkErrorMessage(url, error) {
  if (error?.name === 'AbortError') {
    return `Yêu cầu tới API đã quá thời gian chờ: ${url}`;
  }
  return `Không thể kết nối tới API: ${url}. Kiểm tra mạng, CORS hoặc cấu hình VITE_API_URL.`;
}

export function resolveApiBase(env = {}) {
  const configured = String(env.VITE_API_URL || '').trim();
  if (configured) {
    const cleanBase = configured.replace(/\/+$/, '');
    if (env.PROD && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/i.test(cleanBase)) {
      throw new Error(`Invalid production VITE_API_URL: ${cleanBase}`);
    }
    return cleanBase;
  }
  if (env.PROD) {
    throw new Error('Missing VITE_API_URL for production build.');
  }
  return '/api';
}

export function buildApiUrl(baseUrl, path) {
  const cleanPath = String(path || '').startsWith('/') ? String(path || '') : `/${path || ''}`;
  if (/^https?:\/\//i.test(cleanPath)) return cleanPath;
  return `${String(baseUrl || '').replace(/\/+$/, '')}${cleanPath}`;
}

export function createApiClient({
  baseUrl,
  storage,
  fetchImpl,
  logger = () => {},
  timeoutMs = 30000
}) {
  if (!baseUrl) {
    throw new Error('API base URL is required.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required.');
  }

  return async function api(path, options = {}) {
    const token = storage?.getItem?.('daudo_token');
    const isFormData = options.body instanceof FormData;
    const headers = {
      Accept: 'application/json',
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {})
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const url = buildApiUrl(baseUrl, path);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    let rawText = '';

    try {
      response = await fetchImpl(url, {
        cache: 'no-store',
        ...options,
        headers,
        signal: options.signal || controller.signal
      });
      rawText = await response.text();
      const payload = tryParseJson(rawText);

      if (!response.ok) {
        const error = new Error(responseErrorMessage({
          status: response.status,
          statusText: response.statusText,
          url,
          payload,
          rawText
        }));
        error.status = response.status;
        error.statusText = response.statusText;
        error.url = url;
        error.path = path;
        error.payload = payload;
        error.rawText = rawText;
        throw error;
      }

      return payload ?? (rawText ? { raw: rawText } : {});
    } catch (error) {
      if (!error?.status) {
        const wrapped = new Error(networkErrorMessage(url, error));
        wrapped.cause = error;
        wrapped.url = url;
        wrapped.path = path;
        logger('[API_ERROR]', {
          path,
          url,
          status: response?.status,
          statusText: response?.statusText,
          message: wrapped.message
        });
        throw wrapped;
      }

      logger('[API_ERROR]', {
        path,
        url,
        status: error.status,
        statusText: error.statusText,
        message: error.message
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
}
