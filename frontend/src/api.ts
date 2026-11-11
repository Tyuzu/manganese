import { appStore, authActions } from './appState';

const API_BASE = 'http://localhost:4000/api/v1';

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiOptions extends RequestInit {
  requiresAuth?: boolean;
  method?: ApiMethod;
}

function getAuthHeaders(customHeaders?: HeadersInit): Record<string, string> {
  const headers: Record<string, string> = {};

  if (customHeaders instanceof Headers) {
    customHeaders.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }

  if (Array.isArray(customHeaders)) {
    for (const [key, value] of customHeaders) {
      headers[key] = value;
    }
    return headers;
  }

  if (customHeaders && typeof customHeaders === 'object') {
    Object.assign(headers, customHeaders as Record<string, string>);
  }

  return headers;
}

async function readJsonResponse<T>(response: Response): Promise<T | undefined> {
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export async function apiFetch<T = any>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { requiresAuth = false, method = 'GET', headers: customHeaders, body, ...customOptions } = options;
  const headers = getAuthHeaders(customHeaders);

  if (body !== undefined && body !== null && !(body instanceof FormData) && !(typeof body === 'string')) {
    headers['Content-Type'] = 'application/json';
  }

  if (requiresAuth) {
    const state = appStore.getState();
    const token = state.token;

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      throw new Error('Authentication token missing');
    }
  }

  const requestInit: RequestInit = {
    ...customOptions,
    method: method.toUpperCase(),
    headers,
  };

  if (body !== undefined && body !== null && !(body instanceof FormData) && !(typeof body === 'string')) {
    requestInit.body = JSON.stringify(body);
  } else if (body !== undefined && body !== null) {
    requestInit.body = body as BodyInit;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, requestInit);

  if (response.status === 401) {
    authActions.logout();
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const errorData = (await readJsonResponse<{ error?: string; message?: string }>(response).catch(
      () => ({}) as { error?: string; message?: string }
    )) ?? {};
    throw new Error(errorData.error || errorData.message || `HTTP error ${response.status}`);
  }

  return (await readJsonResponse<T>(response)) as T;
}

export const api = {
  get: <T = any>(endpoint: string, options: Omit<ApiOptions, 'method' | 'body'> = {}) =>
    apiFetch<T>(endpoint, { ...options, method: 'GET' }),
  post: <T = any>(endpoint: string, body?: unknown, options: Omit<ApiOptions, 'method' | 'body'> = {}) =>
    apiFetch<T>(endpoint, { ...options, method: 'POST', body: body as BodyInit | undefined }),
  put: <T = any>(endpoint: string, body?: unknown, options: Omit<ApiOptions, 'method' | 'body'> = {}) =>
    apiFetch<T>(endpoint, { ...options, method: 'PUT', body: body as BodyInit | undefined }),
  patch: <T = any>(endpoint: string, body?: unknown, options: Omit<ApiOptions, 'method' | 'body'> = {}) =>
    apiFetch<T>(endpoint, { ...options, method: 'PATCH', body: body as BodyInit | undefined }),
  delete: <T = any>(endpoint: string, options: Omit<ApiOptions, 'method' | 'body'> = {}) =>
    apiFetch<T>(endpoint, { ...options, method: 'DELETE' }),
};
