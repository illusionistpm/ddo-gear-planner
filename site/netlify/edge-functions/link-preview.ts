/**
 * Link previews for shared pages: the title and description Discord, Slack,
 * the forums and the like show when a link is posted.
 *
 * Those crawlers don't run JavaScript, so the tags have to be in the HTML
 * itself - and the site serves the same index.html for every path. This
 * Netlify Edge Function rewrites that page's tags for a build, a friend's
 * "still needed" list, a comparison and a group shopping list. It runs only
 * for link-preview crawlers and search bots: anyone else gets the page
 * untouched, without a lookup. A crawler fetches a URL once when it is
 * first posted and caches the preview, so a rename shows only where the
 * link is posted afresh.
 *
 * A build's name comes from the API's public lookup, which answers 404 for
 * a private build: those, and any lookup that fails or is slow, keep the
 * site's own tags. A group list's name stays out of it - its invite rides in
 * the URL fragment, which never reaches a server, so anyone with the short
 * id alone could read it.
 *
 * Self-contained (no imports) so `node --test` can exercise it as is; see
 * ../tests/link-preview.test.ts.
 */

const API_BASE = 'https://api.ddo-gear-planner.com';
const SITE_NAME = 'DDO Gear Planner';
const LOOKUP_TIMEOUT_MS = 1500;

/** Link unfurlers and search crawlers, by user agent. */
const PREVIEW_AGENT = /bot\b|bot\/|crawler|spider|preview|unfurl|embed|facebookexternalhit|facebot|whatsapp|telegram|discord|slack|xenforo|skype|vkshare|pinterest/i;

/** Short ids are generated from letters and digits (worker/src/shortId.ts). */
const SHORT_ID = /^[A-Za-z0-9]{1,32}$/;

/** What a preview says. */
export interface Preview {
  title: string;
  description: string;
}

/** The parts of Netlify's edge function context this uses. */
interface EdgeContext {
  next(): Promise<Response>;
}

type BuildLookup = (shortId: string) => Promise<string | null>;

export function isPreviewAgent(userAgent: string | null): boolean {
  return !!userAgent && PREVIEW_AGENT.test(userAgent);
}

/** A saved build's name, or null for one that is missing, private, or didn't answer in time. */
export async function lookUpBuildName(shortId: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  if (!SHORT_ID.test(shortId)) {
    return null;
  }
  try {
    const response = await fetcher(`${API_BASE}/api/build/${shortId}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    const body = await response.json() as { name?: unknown };
    return typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
  } catch {
    return null;
  }
}

/** The preview for a path, or null to leave the site's own tags. */
export async function previewFor(pathname: string, lookUp: BuildLookup): Promise<Preview | null> {
  const [page, first, second] = pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (page === 'build' && first) {
    const name = await lookUp(first);
    return name ? {
      title: name,
      description: 'A DDO gear build: its gear, augments and set bonuses, and a shopping list of where it all drops.',
    } : null;
  }

  if (page === 'still-needed' && first) {
    const name = await lookUp(first);
    return name ? {
      title: `What ${name} still needs`,
      description: 'The gear this DDO build still needs, and the quests it drops in.',
    } : null;
  }

  if (page === 'compare') {
    const [a, b] = await Promise.all([first ? lookUp(first) : null, second ? lookUp(second) : null]);
    const description = 'Two DDO gear builds side by side: how their bonuses differ, and what changed in their gear.';
    if (a && b) {
      return { title: `${a} vs ${b}`, description };
    }
    if (a || b) {
      return { title: `Compare ${a ?? b} with another build`, description };
    }
    return { title: 'Compare builds', description };
  }

  if (page === 'list' && first) {
    return {
      title: 'A shared shopping list',
      description: 'Several DDO gear builds shopped for together: what each still needs, and where it drops. Open the link to join.',
    };
  }

  return null;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Sets a meta tag's content, matching it by name or property, wherever the attributes break lines. */
function setMeta(html: string, key: string, content: string): string {
  const tag = new RegExp(`(<meta\\s+(?:name|property)="${key}"\\s+content=")[^"]*(")`);
  return html.replace(tag, (_match, before: string, after: string) => before + escapeHtml(content) + after);
}

/** The page with the preview's title, description and URL in place of the site's. */
export function applyPreview(html: string, preview: Preview, url: string): string {
  const pageTitle = `${preview.title} – ${SITE_NAME}`;
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(pageTitle)}</title>`);
  out = setMeta(out, 'description', preview.description);
  out = setMeta(out, 'og:title', preview.title);
  out = setMeta(out, 'og:description', preview.description);
  if (!/property="og:url"/.test(out)) {
    out = out.replace(/(<meta\s+property="og:title")/, `<meta property="og:url" content="${escapeHtml(url)}">\n  $1`);
  }
  return out;
}

export async function handle(request: Request, context: EdgeContext, lookUp: BuildLookup = id => lookUpBuildName(id)): Promise<Response> {
  if (request.method !== 'GET' || !isPreviewAgent(request.headers.get('user-agent'))) {
    return context.next();
  }

  const url = new URL(request.url);
  const [preview, response] = await Promise.all([previewFor(url.pathname, lookUp), context.next()]);
  if (!preview || !response.ok || !(response.headers.get('content-type') ?? '').includes('text/html')) {
    return response;
  }

  const html = applyPreview(await response.text(), preview, url.origin + url.pathname);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  // The page now differs by who asks: no cache should hand this copy to a person, or theirs to a crawler.
  headers.set('vary', 'User-Agent');
  return new Response(html, { status: response.status, headers });
}

export default (request: Request, context: EdgeContext) => handle(request, context);

export const config = {
  path: ['/build/*', '/still-needed/*', '/compare', '/compare/*', '/list/*'],
  // A failure here costs only the preview: serve the page as if this weren't here.
  onError: 'bypass',
};
