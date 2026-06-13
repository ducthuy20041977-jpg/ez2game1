export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const storefrontHost = host === "ez2gm.com" || host === "www.ez2gm.com";
    const blockedExactPaths = new Set([
      "/_worker.js",
      "/_redirects",
      "/_headers",
      "/package.json",
      "/package-lock.json",
      "/wrangler.toml",
      "/wrangler.worker.toml",
      "/render.yaml",
      "/README.md",
      "/DEPLOYMENT.md",
      "/index.js",
      "/.gitignore"
    ]);
    const blockedPrefix = [
      "/backend",
      "/api-worker",
      "/outputs",
      "/node_modules"
    ].some(prefix => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
    if (blockedPrefix || blockedExactPaths.has(url.pathname) || url.pathname.includes("/.")) {
      return new Response("Not found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Robots-Tag": "noindex"
        }
      });
    }
    if (url.searchParams.has("role")) {
      const clean = new URL(request.url);
      clean.search = "";
      return Response.redirect(clean.toString(), 302);
    }
    if (storefrontHost && (url.pathname === "/index.html" || url.pathname === "/index")) {
      const target = new URL(request.url);
      target.pathname = "/storefront";
      target.search = "";
      return env.ASSETS.fetch(new Request(target, request));
    }
    const assetLike = url.pathname.startsWith("/assets/") ||
      /\.[a-zA-Z0-9]{2,8}$/.test(url.pathname);

    if (assetLike) {
      return env.ASSETS.fetch(request);
    }

    const target = new URL(request.url);
    if (host === "admin.ez2gm.com") {
      if (url.search) {
        return Response.redirect("https://admin.ez2gm.com/", 302);
      }
      target.pathname = "/";
      target.search = "";
      return env.ASSETS.fetch(new Request(target, request));
    }

    if (storefrontHost) {
      target.pathname = "/storefront";
      target.search = "";
      return env.ASSETS.fetch(new Request(target, request));
    }

    return env.ASSETS.fetch(request);
  }
};
