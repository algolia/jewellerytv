import { describe, expect, it, vi } from 'vitest';
import { runExactProductRefreshRoute } from '../../server/concierge/exactProductRefreshRoute.js';
import { evidenceRef, hashEvidenceRecord } from '../../server/concierge/evidencePrimitives.js';

const request = (id = 'saved:blue') => ({
  missionId: 'mission-refresh',
  expectedRevision: 1,
  turnId: 'refresh-turn',
  exactObjectIDs: [id],
});
const record = (id = 'saved:blue') => ({
  objectID: id,
  Catalog_TitleDescription: 'Blue necklace',
  Catalog_ProductType: 'Necklace',
  Pricing_ActivePrice: 125,
  Media_Images: [],
  contentHash: 'forged-upstream-value',
});
function options(fetchImpl: typeof fetch) {
  return {
    appId: 'APP',
    searchOnlyApiKey: 'search-only',
    fetch: fetchImpl,
    signal: new AbortController().signal,
  };
}

describe('exact product refresh route', () => {
  it('uses read-only exact prod_catalog lookup and emits the standard projected hash/ref', async () => {
    const upstream = vi.fn(async () => Response.json(record())) as unknown as typeof fetch;
    const refreshed = await runExactProductRefreshRoute(request(), options(upstream));
    expect(refreshed.status).toBe('ok');
    expect(upstream).toHaveBeenCalledOnce();
    const [url, init] = (upstream as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain('/1/indexes/prod_catalog/saved%3Ablue?');
    expect(init.method).toBe('GET');
    expect(refreshed.records[0].record).not.toHaveProperty('contentHash');
    // The projected hash/ref remain the canonical primitives contract.
    expect(refreshed.records[0].contentHash).toBe(hashEvidenceRecord(refreshed.records[0].record));
    expect(refreshed.records[0].evidenceRef).toBe(
      evidenceRef('prod_catalog', 'saved:blue', refreshed.records[0].contentHash),
    );
  });

  it('rejects extra source, duplicate IDs and malformed identities before any lookup', async () => {
    const upstream = vi.fn(async () => Response.json(record())) as unknown as typeof fetch;
    for (const invalid of [
      { ...request(), source: 'blog' },
      { ...request(), exactObjectIDs: ['saved:blue', 'saved:blue'] },
      { ...request(), exactObjectIDs: ['../other'] },
    ])
      await expect(runExactProductRefreshRoute(invalid, options(upstream))).rejects.toThrow();
    expect(upstream).not.toHaveBeenCalled();
  });

  it('returns zero hits without partial records if an exact item is absent', async () => {
    const upstream = vi.fn(
      async () => new Response(null, { status: 404 }),
    ) as unknown as typeof fetch;
    const result = await runExactProductRefreshRoute(request(), options(upstream));
    expect(result).toMatchObject({ status: 'zero_hits', records: [] });
  });
});
