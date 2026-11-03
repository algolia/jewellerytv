import { searchClient } from '../../shared/client';

/* Live starters, derived from facet counts rather than written down.
 *
 * The curated pool cannot know what is on air: it was built from aggregate
 * search demand months before the broadcast indices existed, which is why its
 * one on-air label had to be hand-added. Two chips come from the index
 * instead, so the panel opens on something that is true this minute.
 *
 * Facets, not a model. A generated opener has no guarantee that the series it
 * names actually aired; a facet count is the guarantee. It also costs one
 * `hitsPerPage: 0` query rather than a round trip through an agent.
 *
 * Brands are deliberately not a signal: that facet returns alphabetically
 * (1928 Jewelry 664, then Accelero 10), so "top brand" would be a fiction. */

export type StarterSignals = { series: string[]; hosts: string[] };

type FacetBlock = Record<string, Record<string, number>> | undefined;

/** Highest-count values first, which the facet response does not guarantee. */
function ranked(facets: FacetBlock, attribute: string, limit: number): string[] {
  const counts = facets?.[attribute];
  if (!counts) return [];
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([value]) => value);
}

/** One label per signal, at most two, series before host. Pure. */
export function signalsToLabels(signals: StarterSignals): string[] {
  const labels: string[] = [];
  const [series] = signals.series;
  const [host] = signals.hosts;
  if (series) labels.push(`What was on ${series} this week?`);
  if (host) labels.push(`What did ${host} feature this week?`);
  return labels.slice(0, 2);
}

/** Reads the broadcast window. Resolves to empty on any failure: a panel that
 * opens with the curated set is correct, a panel that opens blank is not. */
export async function readStarterSignals(): Promise<StarterSignals> {
  try {
    const response = (await searchClient.search([
      {
        indexName: 'on_air_shows',
        params: {
          query: '',
          hitsPerPage: 0,
          filters: 'recencyDays < 3',
          facets: ['seriesName', 'hosts'],
          maxValuesPerFacet: 10,
        },
      },
    ])) as { results: Array<{ facets?: FacetBlock }> };
    const facets = response.results?.[0]?.facets;
    return { series: ranked(facets, 'seriesName', 1), hosts: ranked(facets, 'hosts', 1) };
  } catch {
    return { series: [], hosts: [] };
  }
}
