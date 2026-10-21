import type { Browser } from "playwright";
import sanitizeHtml from "sanitize-html";
import { JobFailure } from "./errors.js";

const RENDER_TIMEOUT_MS = 60_000;

// sanitize-html's own defaults are tuned for a content *fragment*
// (comment bodies, article text) — they exclude document-structure tags
// (html/head/body/style) entirely, which would strip a full HTML document
// down to almost nothing. This allowlist is deliberately built for
// full-document input instead, while still excluding every
// script-execution vector (script/object/embed/iframe/form/on* handlers).
const ALLOWED_TAGS = [
  "html", "head", "body", "meta", "title", "style", "link",
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr",
  "div", "span", "section", "article", "header", "footer", "main", "nav", "aside",
  "a", "b", "i", "u", "strong", "em", "small", "sub", "sup", "mark", "code", "pre",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "blockquote", "q", "cite", "img", "figure", "figcaption",
];

function sanitize(rawHtml: string): string {
  return sanitizeHtml(rawHtml, {
    allowedTags: ALLOWED_TAGS,
    // The "style" tag has old, IE-specific CSS-expression() XSS history —
    // irrelevant here (JS is disabled in the render context regardless,
    // and this never runs in a browser a real user interacts with), but
    // sanitize-html requires this explicit acknowledgement to allow it.
    allowVulnerableTags: true,
    allowedAttributes: {
      "*": ["class", "id", "style"],
      meta: ["charset", "name", "content"],
      link: ["rel", "href"],
      a: ["href"],
      img: ["src", "alt", "width", "height"],
      table: ["border", "cellpadding", "cellspacing"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    // No "javascript" scheme — sanitize-html strips any href/src using a
    // scheme not in this list, a defense-in-depth backstop alongside
    // `javaScriptEnabled: false` below.
    allowedSchemes: ["http", "https", "mailto", "data"],
    disallowedTagsMode: "discard",
  });
}

/**
 * The one shared render path for both `html-to-pdf` and `markdown-to-pdf`
 * (Markdown is parsed to HTML first, then handed here) — same sanitizer,
 * same JS-disabled context, same network-request block, same timeout
 * wrapper for both tools.
 *
 * SSRF / resource-loading mitigation (defense in depth, both layers
 * required — see docs/DECISIONS.md):
 * 1. `context.route("**\/*", ...)` blocks every network request except
 *    inert `about:blank`/`data:` URIs, regardless of which HTML/CSS
 *    construct would otherwise trigger it (img, link, @import, url(),
 *    srcset, iframe). A referenced resource simply renders as missing
 *    (broken-image-style degradation) rather than the job being rejected
 *    outright — rejecting would break a large share of benign real-world
 *    HTML (Google Fonts links, hotlinked images) for no additional
 *    security benefit, since the request is aborted either way.
 * 2. At the infra level the worker sits only on an `internal: true`
 *    Docker network (docker-compose.yml / docker-compose.prod.yml): no
 *    route to the internet, though it can still reach the other services
 *    on that network (Postgres, Redis, MinIO). Backstop if this
 *    in-process block has a gap Chromium doesn't route through
 *    `page.route` (e.g. DNS prefetch).
 *
 * Rendering security, in order of importance:
 * 1. `javaScriptEnabled: false` — the primary, structural control. A PDF
 *    is a static snapshot, so no legitimate fidelity is lost.
 * 2. `sanitize-html` before `setContent` — defense-in-depth against a
 *    future refactor accidentally re-enabling JS.
 * 3. An application-level render timeout, explicitly a *backstop* not the
 *    primary mitigation — Playwright is a persistent driver, not a
 *    one-shot subprocess, so a hung render needs its own force-close
 *    rather than relying on `execFile`'s SIGKILL-on-timeout pattern used
 *    everywhere else in this codebase.
 */
export async function renderHtmlToPdf(browser: Browser, rawHtml: string): Promise<Buffer> {
  const safeHtml = sanitize(rawHtml);

  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (url === "about:blank" || url.startsWith("data:")) {
        void route.continue();
      } else {
        void route.abort();
      }
    });

    const page = await context.newPage();

    const render = async (): Promise<Buffer> => {
      await page.setContent(safeHtml, { waitUntil: "load", timeout: RENDER_TIMEOUT_MS });
      return page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
      });
    };

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("RENDER_TIMEOUT")), RENDER_TIMEOUT_MS);
    });

    try {
      return await Promise.race([render(), timeout]);
    } catch {
      throw new JobFailure("PROCESSING_FAILED");
    }
  } finally {
    // Runs regardless of which side of the race settled first — this is
    // what actually forces a hung render to stop, since Promise.race
    // alone doesn't cancel the losing promise.
    await context.close();
  }
}
