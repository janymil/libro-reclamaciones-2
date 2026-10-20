import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { type Server } from "http";
import { SEO_ARTICLES, buildArticleHtml, buildHubHtml } from "./services/seoService";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

/**
 * Injects route-specific SEO tags (title, description, OpenGraph, Twitter, JSON-LD schema)
 * into index.html before returning it to the browser or search engine crawler.
 */
function injectSeoHeaders(html: string, url: string, host: string): string {
  const cleanPath = url.split("?")[0].replace(/\/+$/, "");

  // Match /articulos/:slug
  const articleMatch = cleanPath.match(/^\/articulos\/([a-z0-9-]+)$/);
  if (articleMatch) {
    const slug = articleMatch[1];
    const article = SEO_ARTICLES[slug];
    if (article) {
      const seoSnippet = buildArticleHtml(article, host);
      // Remove default title and description
      let modified = html.replace(/<title>.*?<\/title>/i, "");
      modified = modified.replace(/<meta\s+name=["']description["'].*?>/i, "");
      return modified.replace("</head>", `${seoSnippet}\n  </head>`);
    }
  }

  // Match /articulos hub
  if (cleanPath === "/articulos") {
    const hubSnippet = buildHubHtml(host);
    let modified = html.replace(/<title>.*?<\/title>/i, "");
    modified = modified.replace(/<meta\s+name=["']description["'].*?>/i, "");
    return modified.replace("</head>", `${hubSnippet}\n  </head>`);
  }

  return html;
}

/**
 * The service worker and the recovery page must never come from a cache.
 */
function noStoreForWorkerFiles(app: Express) {
  app.use(["/sw.js", "/reset.html"], (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
}

export async function setupVite(app: Express, server: Server) {
  const { createServer: createViteServer, createLogger } = await import("vite");
  const { nanoid } = await import("nanoid");
  const viteLogger = createLogger();

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    configFile: path.resolve(import.meta.dirname, "..", "vite.config.ts"),
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  noStoreForWorkerFiles(app);
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    const host = req.get("host") || "librodigital.pe";

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      let page = await vite.transformIndexHtml(url, template);
      page = injectSeoHeaders(page, url, host);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  noStoreForWorkerFiles(app);
  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    const host = req.get("host") || "librodigital.pe";
    try {
      let html = fs.readFileSync(indexPath, "utf-8");
      html = injectSeoHeaders(html, req.originalUrl, host);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch {
      res.sendFile(indexPath);
    }
  });
}

