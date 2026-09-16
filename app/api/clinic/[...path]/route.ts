const API_BASE = (process.env.KLINIC_API_URL ?? "http://localhost:8080/api").replace(/\/$/, "");

async function proxy(request: Request, context: RouteContext<"/api/clinic/[...path]">) {
  const { path } = await context.params;
  const incoming = new URL(request.url);
  const target = `${API_BASE}/${path.map(encodeURIComponent).join("/")}${incoming.search}`;
  const headers = new Headers({ accept: "application/json" });
  const authorization = request.headers.get("authorization");
  const contentType = request.headers.get("content-type");
  const idempotencyKey = request.headers.get("idempotency-key");
  if (authorization) headers.set("authorization", authorization);
  if (contentType) headers.set("content-type", contentType);
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      cache: "no-store",
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json(
      { success: false, message: `เชื่อมต่อ Klinic API ไม่ได้ที่ ${API_BASE}`, error: { code: "API_UNREACHABLE", details: { target } } },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
