export type ApiHttpMethod = 'DELETE' | 'GET' | 'HEAD' | 'PATCH' | 'POST' | 'PUT';

export type ApiQueryValue = boolean | number | string | null | undefined;
export type ApiQueryParams = Record<string, ApiQueryValue | ApiQueryValue[]>;

export type ApiErrorPayload = Record<string, unknown>;

export type ApiRequestOptions = {
  accessToken?: string;
  body?: BodyInit;
  headers?: HeadersInit;
  json?: unknown;
  method?: ApiHttpMethod;
  query?: ApiQueryParams;
  signal?: AbortSignal;
};

export const NETWORK_MESSAGE = 'Không kết nối được máy chủ FET3D. Kiểm tra mạng rồi bấm Thử lại.';

/**
 * The request never reached FET3D (no network, DNS failure, connection reset). The platform text, e.g. "fetch failed:
 * java.net.UnknownHostException: Unable to resolve host …", is kept in `cause` for logs only: screens show `message`.
 */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super(NETWORK_MESSAGE, { cause });
    this.name = 'NetworkError';
  }
}

/** Raw platform wording of a request that never got an answer (errors thrown outside apiClient keep it). */
const NETWORK_TEXT =
  /network|fetch|timeout|timed out|internet|offline|connection|unknownhost|unable to resolve host/i;

/** True when the device could not reach the server, as opposed to the server answering with an error. */
export function isNetworkError(issue: unknown): boolean {
  if (issue instanceof NetworkError) return true;
  return !(issue instanceof ApiError) && issue instanceof Error && NETWORK_TEXT.test(issue.message);
}

export class ApiError extends Error {
  readonly payload?: ApiErrorPayload;
  readonly status: number;

  constructor(message: string, status: number, payload?: ApiErrorPayload) {
    super(message);
    this.name = 'ApiError';
    this.payload = payload;
    this.status = status;
  }
}
