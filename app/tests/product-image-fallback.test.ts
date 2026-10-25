import { describe, expect, it } from 'vitest';
import { IMAGE_RETRY_LIMIT, nextImageCursor } from '../src/shared/ProductWorkspace';

/* H2 bug 2, our side: an image-load failure falls back to the record's next
 * image and retries the last one once before the honest "Image unavailable"
 * label. The order lives in nextImageCursor (pure), the component only wires
 * onError to it. */

const start = { index: 0, attempt: 0 };

describe('image fallback order (H2)', () => {
  it('advances to the next record image after a failure', () => {
    expect(nextImageCursor(3, start)).toEqual({ index: 1, attempt: 0, failed: false });
  });

  it('keeps advancing until the last image', () => {
    expect(nextImageCursor(3, { index: 1, attempt: 0 })).toEqual({
      index: 2,
      attempt: 0,
      failed: false,
    });
  });

  it('retries the last image once before giving up', () => {
    expect(nextImageCursor(3, { index: 2, attempt: 0 })).toEqual({
      index: 2,
      attempt: 1,
      failed: false,
    });
    expect(nextImageCursor(3, { index: 2, attempt: 1 })).toEqual({
      index: 2,
      attempt: 1,
      failed: true,
    });
    expect(IMAGE_RETRY_LIMIT).toBe(1);
  });

  it('a single-image record retries once, then shows the label', () => {
    expect(nextImageCursor(1, start)).toEqual({ index: 0, attempt: 1, failed: false });
    expect(nextImageCursor(1, { index: 0, attempt: 1 })).toEqual({
      index: 0,
      attempt: 1,
      failed: true,
    });
  });
});
