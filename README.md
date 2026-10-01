<div align="center">

# voice-quote-proxy

Reverse-proxy of the voice-quote app on `voice-quote.devartslab.com`.

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F6821F?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

</div>

## Routes

| Hostname                    | Serves                                                          |
| --------------------------- | --------------------------------------------------------------- |
| `voice-quote.devartslab.com` | `voice-quote.netlify.app`, reverse-proxied (Netlify SPA intact) |

The app lives in a separate repo: [DevArtsLab/voice-quote](https://github.com/DevArtsLab/voice-quote).
API calls go straight from the browser to `quote-builder-backend.fly.dev` and
never pass through this Worker.

## Deploy

```bash
npm install
npx wrangler deploy
```

`voice-quote.` uses a Worker custom domain (auto-creates its DNS record +
cert). Zone Redirect Rules still evaluate before the Worker, so none may match
the hostname.
