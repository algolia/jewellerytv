/* Design-variant signature (2026-10-23, Arijit; single home since the
 * curation restore): the catalog carries the same design as several records
 * (size/metal variants, separate objectIDs), and two of them may never fill
 * two tiles. The signature strips metal colors, purities and sizes from the
 * title, so yellow- and white-gold twins collapse to one design. */

const DESIGN_NOISE_TOKENS = new Set([
  'yellow', 'white', 'rose', 'pink', 'gold', 'goldtone', 'silvertone',
  'rhodium', 'sterling', 'silver', 'silverite', 'platineve', 'over',
  '10k', '14k', '18k', '24k', 'ctw', 'ct', 'mm', 'inch', 'inches', 'approximately',
]);

export function designSignature(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s./]+/g, ' ')
    .split(/\s+/)
    .filter(
      (token) =>
        token &&
        !DESIGN_NOISE_TOKENS.has(token) &&
        !/^\d+(?:\.\d+)?(?:\/\d+)?$/.test(token),
    );
  return tokens.join(' ');
}
