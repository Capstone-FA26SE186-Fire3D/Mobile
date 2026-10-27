import { env } from '../config/env';
import {
  ApiError,
  type ApiErrorPayload,
  type ApiQueryParams,
  type ApiRequestOptions,
} from './types/common';

function buildUrl(path: string, query?: ApiQueryParams): string {
  const baseUrl = env.apiBaseUrl.replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('Ứng dụng chưa được cấu hình địa chỉ máy chủ FET3D.');
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const [pathname, existingQuery = ''] = `${baseUrl}${normalizedPath}`.split('?', 2);
  const searchParams = new URLSearchParams(existingQuery);

  for (const [key, value] of Object.entries(query ?? {})) {
    const values = Array.isArray(value) ? value : [value];

    for (const item of values) {
      if (item !== null && item !== undefined) {
        searchParams.append(key, String(item));
      }
    }
  }

  const search = searchParams.toString();
  return search ? `${pathname}?${search}` : pathname;
}

function isErrorPayload(value: unknown): value is ApiErrorPayload {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined;
  }

  const contentType = response.headers.get('content-type') ?? '';
  return /(?:^|\s|;)application\/(?:[\w.-]+\+)?json(?:\s*;|\s*$)/i.test(contentType)
    ? response.json()
    : response.text();
}

/** Vietnamese diacritics: the server already wrote a message meant for people. */
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

/** Plain Vietnamese by HTTP status, used when the server text is English or missing. */
export function statusMessage(status: number): string {
  if (status === 400 || status === 422) return 'Thông tin chưa hợp lệ. Hãy kiểm tra lại.';
  if (status === 401) return 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.';
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (status === 404) return 'Không tìm thấy dữ liệu, có thể đã bị xóa hoặc đổi.';
  if (status === 409 || status === 412) return 'Dữ liệu vừa thay đổi. Hãy tải lại rồi thử lại.';
  if (status === 429) return 'Bạn thao tác quá nhanh. Hãy chờ một chút rồi thử lại.';
  if (status >= 500) return 'Máy chủ FET3D đang gặp lỗi. Hãy thử lại sau ít phút.';
  return 'Không thực hiện được. Hãy thử lại.';
}

function errorMessage(payload: unknown, status: number): string {
  if (isErrorPayload(payload)) {
    for (const text of [payload.message, payload.title, payload.detail]) {
      if (typeof text === 'string' && VIETNAMESE.test(text)) return text;
    }
  }
  return statusMessage(status);
}

export const apiClient = {
  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const response = await this.requestWithMeta<T>(path, options);
    return response.data;
  },
  async requestWithMeta<T>(
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<{ data: T; etag: string | null }> {
    if (options.body !== undefined && options.json !== undefined) {
      throw new TypeError('apiClient.request accepts either body or json, not both.');
    }

    const headers = new Headers(options.headers);
    headers.set('Accept', headers.get('Accept') ?? 'application/json');
    if (options.accessToken) headers.set('Authorization', `Bearer ${options.accessToken}`);

    const hasJsonBody = options.json !== undefined;
    if (hasJsonBody) {
      headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');
    }

    const response = await fetch(buildUrl(path, options.query), {
      body: hasJsonBody ? JSON.stringify(options.json) : options.body,
      headers,
      method: options.method ?? (hasJsonBody || options.body ? 'POST' : 'GET'),
      signal: options.signal,
    });
    const payload = await readResponseBody(response);

    if (!response.ok) {
      throw new ApiError(
        errorMessage(payload, response.status),
        response.status,
        isErrorPayload(payload) ? payload : undefined,
      );
    }

    return { data: payload as T, etag: response.headers.get('etag') };
  },
};
