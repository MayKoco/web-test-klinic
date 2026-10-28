import { clinicSubdomainFromHostname } from "@/lib/tenant-host";

const API_BASE = (process.env.KLINIC_API_URL ?? "http://localhost:8080/api").replace(/\/$/, "");
async function proxy(request: Request, context: RouteContext<"/api/clinic/[...path]">) {
  const { path } = await context.params;
  const incoming = new URL(request.url);
  const target = `${API_BASE}/${path.map(encodeURIComponent).join("/")}${incoming.search}`;
  const headers = new Headers({ accept: "application/json" });
  const authorization = request.headers.get("authorization");
  const contentType = request.headers.get("content-type");
  const idempotencyKey = request.headers.get("idempotency-key");
  const clinicSubdomain = clinicSubdomainFromHostname(incoming.hostname);
  if (authorization) headers.set("authorization", authorization);
  if (contentType) headers.set("content-type", contentType);
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
  if (clinicSubdomain) headers.set("x-klinic-subdomain", clinicSubdomain);

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      cache: "no-store",
    });
    const upstreamContentType = upstream.headers.get("content-type") ?? "application/json";
    if (upstreamContentType.includes("text/event-stream")) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "content-type": upstreamContentType,
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        },
      });
    }
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": upstreamContentType },
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
