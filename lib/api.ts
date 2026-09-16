export type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
  meta?: { page: number; limit: number; total: number; totalPages: number };
  error?: { code?: string; details?: unknown };
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = "REQUEST_FAILED",
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<ApiEnvelope<T>> {
  const { token, headers, ...init } = options;
  const response = await fetch(`/api/clinic${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  const payload = (await response.json().catch(() => ({
    success: false,
    message: `API returned ${response.status}`,
  }))) as ApiEnvelope<T>;

  if (!response.ok || payload.success === false) {
    throw new ApiClientError(
      payload.message || "เรียก API ไม่สำเร็จ",
      response.status,
      payload.error?.code,
      payload.error?.details,
    );
  }
  return payload;
}

