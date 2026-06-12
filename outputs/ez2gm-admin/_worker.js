export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const assetLike = url.pathname.startsWith("/assets/") ||
      url.pathname.startsWith("/backend/") ||
      /\.[a-zA-Z0-9]{2,8}$/.test(url.pathname);

    if (assetLike) {
      return env.ASSETS.fetch(request);
    }

    const target = new URL(request.url);
    if (host === "admin.ez2gm.com") {
      target.pathname = "/index.html";
      target.search = "";
      return env.ASSETS.fetch(new Request(target, request));
    }

    if (host === "ez2gm.com" || host === "www.ez2gm.com") {
      target.pathname = "/storefront.html";
      target.search = "";
      return env.ASSETS.fetch(new Request(target, request));
    }

    return env.ASSETS.fetch(request);
  }
};
