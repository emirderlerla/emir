const TOKEN_KEY = 'noah_auth_token';
const LEGACY_TOKEN_KEY = 'emir7_auth_token';

function isEnClient(): boolean {
  try {
    return localStorage.getItem('noah_language') === 'en';
  } catch {
    return false;
  }
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage errors
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: Record<string, unknown>;

  constructor(message: string, status: number, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = typeof data?.code === 'string' ? data.code : undefined;
    this.data = data;
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? ((await res.json()) as Record<string, unknown>) : null;

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/login')) {
      setStoredToken(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('noah:unauthorized'));
      }
    }
    const msg =
      (payload?.error as string) ||
      (isEnClient() ? `Request failed (${res.status})` : `İstek başarısız oldu (${res.status})`);
    throw new ApiError(msg, res.status, payload || undefined);
  }

  return (payload as T) ?? ({} as T);
}

export async function downloadProtectedFile(path: string, filename: string): Promise<void> {
  const token = getStoredToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(path, { headers, credentials: 'include' });
  if (!res.ok) {
    throw new Error(isEnClient() ? 'Failed to download file.' : 'Dosya indirilemedi.');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
