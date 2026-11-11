import { appStore, authActions } from './appState';

const API_BASE = 'http://localhost:4000/api/v1';

export interface ApiOptions extends RequestInit {
  requiresAuth?: boolean;
}

export async function apiFetch<T = any>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { requiresAuth = false, headers: customHeaders, ...customOptions } = options;

  const headers: Record<string, string> = {
    ...(customHeaders as Record<string, string>),
  };

  if (!(customOptions.body instanceof FormData)) {
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

  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers,
    ...customOptions,
  });

  if (response.status === 401) {
    authActions.logout();
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return undefined as T;
  }

  return response.json();
}