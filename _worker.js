// Auravyx Preclinical - Cloudflare Pages advanced-mode worker.
// Handles POST /anthropic as a same-origin proxy to the Anthropic API using a
// server-side secret (env.ANTHROPIC_API_KEY). Everything else is served as a
// normal static asset (the app's index.html, etc). (c) 2026 HAKOYA LLC.
//
// Security: the proxy only serves requests originating from the app itself.
// The app calls it same-origin (fetch('/anthropic')), so legitimate traffic
// always carries Origin: https://auravyx.app. Anything else gets 403 and never
// reaches the upstream API, so a leaked URL alone cannot drain the API key.

const ALLOWED_HOSTS = new Set(["auravyx.app", "www.auravyx.app"]);

function isAppOrigin(request) {
  const origin = request.headers.get("Origin") || request.headers.get("Referer");
  if (!origin) return false;
  let host;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch (e) {
    return false;
  }
  return ALLOWED_HOSTS.has(host) || host.endsWith(".auravyx.app");
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/anthropic") {
      if (request.method !== "POST") {
        return json({ error: { message: "Use POST for /anthropic." } }, 405);
      }
      if (!isAppOrigin(request)) {
        return json({ error: { message: "Forbidden: /anthropic serves the Auravyx Preclinical app origin only." } }, 403);
      }
      const key = env.ANTHROPIC_API_KEY;
      if (!key) {
        return json({ error: { message: "Proxy not configured: set the ANTHROPIC_API_KEY secret in the Cloudflare Pages project settings." } }, 500);
      }
      let body;
      try {
        body = await request.text();
      } catch (e) {
        return json({ error: { message: "Bad request body." } }, 400);
      }
      let upstream;
      try {
        upstream = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
          },
          body: body,
        });
      } catch (e) {
        return json({ error: { message: "Upstream request failed." } }, 502);
      }
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { "content-type": "application/json" },
      });
    }
    // Not the proxy path -> serve the static site as normal.
    return env.ASSETS.fetch(request);
  },
};
