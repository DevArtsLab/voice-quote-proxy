/**
 * voice-quote-proxy
 * Transparently serves https://voice-quote.netlify.app at
 * https://voice-quote.devartslab.com.
 *
 * Two jobs:
 * 1. Proxy /api/* and /graphql to the Fly.io backend so every request the
 *    app makes is same-origin (no CORS at all on the custom domain).
 *    Includes WebSocket pass-through for GraphQL subscriptions.
 * 2. Rewrite backend URLs in HTML/JS responses from Netlify
 *    (api-base-url meta tag, environment.prod.ts literals) to this host.
 *
 * Netlify's SPA fallback (/* -> /index.html, 200) applies upstream, so
 * client-side routes just work.
 */

interface Env {
  ORIGIN: string;
  API_ORIGIN: string;
}

const HOP_HEADERS = [
  "host",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "x-forwarded-proto",
  "x-real-ip",
];

const FLY_HOST = "quote-builder-backend.fly.dev";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const isApi = url.pathname === "/graphql" || url.pathname.startsWith("/api/");
    const upstreamOrigin = isApi ? env.API_ORIGIN : env.ORIGIN;
    const target = upstreamOrigin + url.pathname + url.search;

    const headers = new Headers(request.headers);
    for (const h of HOP_HEADERS) headers.delete(h);

    // WebSocket upgrade (GraphQL subscriptions) — tunnel straight through.
    if (request.headers.get("upgrade") === "websocket") {
      return fetch(target, { method: request.method, headers });
    }

    const isGet = ["GET", "HEAD"].includes(request.method);
    // We may rewrite the response body — ask upstream for uncompressed.
    if (isGet && !isApi) headers.set("accept-encoding", "identity");

    // The backend's tool-call handler destructures function.arguments as an
    // object, but Vapi sends it as a JSON string — parse it here so SSE
    // payloads are populated even on the currently deployed backend image.
    let body: BodyInit | undefined;
    if (
      request.method === "POST" &&
      url.pathname === "/api/vapi-webhook" &&
      (request.headers.get("content-type") ?? "").includes("json")
    ) {
      const payload = (await request.json()) as {
        message?: {
          toolCallList?: Array<{ function?: { arguments?: unknown } }>;
        };
      };
      for (const tc of payload.message?.toolCallList ?? []) {
        const fn = tc.function;
        if (typeof fn?.arguments === "string") {
          try {
            fn.arguments = JSON.parse(fn.arguments);
          } catch {
            // leave as-is
          }
        }
      }
      body = JSON.stringify(payload);
      headers.set("content-length", String(body.length));
    } else {
      body = isGet ? undefined : (request.body ?? undefined);
    }

    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      cf: isApi ? { cacheTtl: 0 } : { cacheEverything: true, cacheTtl: 60 },
    });

    const res = new Response(upstream.body, upstream);

    // Keep redirect targets on our hostname
    const loc = res.headers.get("location");
    if (loc?.startsWith(upstreamOrigin)) {
      res.headers.set("location", loc.replace(upstreamOrigin, url.origin));
    }

    // Point backend URLs in HTML/JS at this host so calls stay same-origin.
    const type = res.headers.get("content-type") ?? "";
    if (
      isGet &&
      !isApi &&
      (type.includes("text/html") || type.includes("javascript"))
    ) {
      const body = await res.text();
      const rewritten = body
        .replaceAll(`wss://${FLY_HOST}`, `wss://${url.host}`)
        .replaceAll(`https://${FLY_HOST}`, `https://${url.host}`);
      const out = new Response(rewritten, res);
      out.headers.delete("content-length");
      return out;
    }

    return res;
  },
} satisfies ExportedHandler<Env>;
