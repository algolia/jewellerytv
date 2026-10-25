type MessageParts = { role: string; parts: readonly unknown[] };

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function canonicalJtvUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== 'https:' ||
      (host !== 'jtv.com' && !host.endsWith('.jtv.com')) ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Only tool results from the current transcript can authorize an article or
 * help-page link. Citation-only sources: the blog and help_content indexes,
 * streamed by the agent's native search tool as `tool-algolia_search_index_<index>`
 * parts with raw hits (the retrieve_evidence envelope is gone with the client
 * tool layer). A record authorizes the URLs it carries: its canonical_url and
 * any https jtv.com URL embedded in the record text (help and blog articles
 * link pages such as the Channel Finder inside their body markdown — the
 * model quotes those links, and 2026-10-22 receipts confirm both turns).
 * Product searches never authorize prose links; product links keep their own
 * verified path. */
export function canonicalBlogUrlsFromMessages(
  messages: readonly MessageParts[],
): ReadonlySet<string> {
  const urls = new Set<string>();
  const citationIndex = new Set(['blog', 'help_content']);
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const rawPart of message.parts) {
      const part = object(rawPart);
      if (part?.state !== 'output-available' || typeof part.type !== 'string') continue;
      if (!part.type.startsWith('tool-algolia_search_index_')) continue;
      const index = part.type.slice('tool-algolia_search_index_'.length);
      if (!citationIndex.has(index)) continue;
      const output = object(part.output);
      if (!output || !Array.isArray(output.hits)) continue;
      for (const rawHit of output.hits) {
        const hit = object(rawHit);
        if (
          !hit ||
          typeof hit.objectID !== 'string' ||
          !hit.objectID ||
          typeof hit.content_hash !== 'string' ||
          !hit.content_hash
        )
          continue;
        const recordUrl = canonicalJtvUrl(hit.canonical_url);
        if (recordUrl) urls.add(recordUrl);
        for (const value of Object.values(hit)) {
          if (typeof value !== 'string') continue;
          // RFC 3986 ASCII URL characters only: the match stops at the closing
          // parenthesis of a markdown link and at curly quotes, so adjacency
          // like "](url)[Next" or "(url)" never leaks into the allowed set.
          for (const match of value.matchAll(/https?:\/\/[A-Za-z0-9\-._~:/?#@!$&+,;=%]+/g)) {
            const url = canonicalJtvUrl(match[0].replace(/[.,;:!'"’”]+$/, ''));
            if (url) urls.add(url);
          }
        }
      }
    }
  }
  return urls;
}

export function verifiedBlogHref(
  href: string | undefined,
  canonicalUrls: ReadonlySet<string>,
): string | null {
  const url = canonicalJtvUrl(href);
  return url && canonicalUrls.has(url) ? url : null;
}
