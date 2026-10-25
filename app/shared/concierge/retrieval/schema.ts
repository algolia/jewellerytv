import { z } from 'zod';

/* F3 native cleanup: the retrieve_evidence input schema (styleBatches, the
 * source discriminated union and its refinements) served the removed client
 * tool and its server route — the native agent formulates its own searches.
 * What survives is the exact objectID identity the UI's price/stock refresh
 * still validates (exactProductRefreshRoute). */
export const exactObjectId = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,149}$/,
    'Exact objectID must be a safe catalogue identifier',
  );
