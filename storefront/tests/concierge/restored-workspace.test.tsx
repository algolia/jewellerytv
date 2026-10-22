import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BriefStateV3 } from '../../shared/briefSchema';
import { ConnectedShoppingBrief } from '../../src/concierge/ConnectedShoppingBrief';
import { ConciergeWorkspaceLayout } from '../../src/concierge/ConciergeWorkspaceLayout';
import { ShoppingWorkspace } from '../../src/ShoppingWorkspace';
import { normalizeProduct } from '../../src/catalog';
import type { WorkspaceViewModel } from '../../src/ProductWorkspace';

const piece = normalizeProduct({
  objectID: 'piece-1',
  Catalog_TitleDescription: 'Sterling silver necklace',
  Pricing_ActivePrice: 125,
  Media_Images: [],
});
const blankBrief: BriefStateV3 = {
  version: 3,
  missionId: 'mission-restored',
  revision: 0,
  facts: [],
  processedTurns: [],
  tombstones: [],
  events: [],
};

function workspace(): WorkspaceViewModel {
  return {
    discoveries: [{ title: 'A direction', items: [{ product: piece, why: 'A grounded choice' }] }],
  };
}

function layout(model: WorkspaceViewModel) {
  return (
    <ConciergeWorkspaceLayout
      headerActions={
        <>
          <button type="button">New conversation</button>
          <button type="button">Close</button>
        </>
      }
      preferenceControls={
        <ConnectedShoppingBrief
          brief={blankBrief}
          onAdd={vi.fn()}
          onReplace={vi.fn()}
          onRetract={vi.fn()}
          onUndo={vi.fn()}
        />
      }
      messages={<p>Conversation answer</p>}
      status={<p role="status">Concierge is considering your request.</p>}
      composer={
        <label>
          Ask the Concierge
          <input aria-label="Ask the Concierge" />
        </label>
      }
      productWorkspace={<ShoppingWorkspace model={model} />}
      sectionSwitch={
        <>
          <button aria-pressed={true}>Conversation</button>
          <button aria-pressed={false}>Products</button>
        </>
      }
      section="conversation"
    />
  );
}

describe('restored approved workspace composition', () => {
  it('renders the two columns, the brief and a single product surface with no tabs', () => {
    const html = renderToStaticMarkup(layout(workspace()));
    expect(html).toContain('class="conversation-column"');
    expect(html).toContain('class="shopping-column"');
    expect(html).toContain('Preferences');
    expect(html).toContain('Sterling silver necklace');
    expect(html).toContain('href="/product/piece-1"');
    expect(html).not.toContain('pw-views');
    expect(html).not.toContain('Remove from saved');
    expect(html).not.toContain('Remove from comparison');
    expect(html).not.toContain('Add to combination');
  });

  it('shows the honest empty state and the mobile Products section marker', () => {
    const html = renderToStaticMarkup(
      <ConciergeWorkspaceLayout
        headerActions={<button type="button">Close</button>}
        preferenceControls={
          <button type="button" aria-expanded="false">
            Preferences (0)
          </button>
        }
        messages={<p>Conversation</p>}
        composer={<button type="button">Send</button>}
        productWorkspace={
          <ShoppingWorkspace model={{ discoveries: [], discoveryUnavailable: true }} />
        }
        sectionSwitch={<button aria-pressed="true">Products</button>}
        section="shopping"
      />,
    );
    expect(html).toContain('data-section="shopping"');
    expect(html).toContain('No confirmed matches are ready to show.');
    expect(html).toContain('aria-expanded="false"');
  });
});
