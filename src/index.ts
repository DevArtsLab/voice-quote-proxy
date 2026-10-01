/**
 * voice-quote-proxy
 * Transparently serves https://voice-quote.netlify.app at
 * https://voice-quote.devartslab.com.
 *
 * Netlify's SPA fallback (/* -> /index.html, 200) applies upstream, so
 * client-side routes just work. The app's API calls go straight from the
 * browser to quote-builder-backend.fly.dev and never pass through here.
 */

interface Env {
  ORIGIN: string;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const target = env.ORIGIN + url.pathname + url.search;

    const headers = new Headers(request.headers);
    for (const h of HOP_HEADERS) headers.delete(h);

    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
      cf: { cacheEverything: true, cacheTtl: 60 },
    });

    const res = new Response(upstream.body, upstream);

    // Keep redirect targets on our hostname
    const loc = res.headers.get("location");
    if (loc?.startsWith(env.ORIGIN)) {
      res.headers.set("location", loc.replace(env.ORIGIN, url.origin));
    }

    return res;
  },
} satisfies ExportedHandler<Env>;
