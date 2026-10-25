import { ProductWorkspace, type WorkspaceViewModel } from './ProductWorkspace';
import './shopping-workspace.css';
/** Product work lives here; the editable brief stays alongside the conversation. */
export function ShoppingWorkspace({ model, onStart }: {
  onStart?: () => void;
  model: WorkspaceViewModel;
}) {
  return (
    <aside className="shopping-workspace" aria-label="Your shopping workspace">
      <ProductWorkspace model={model} onStart={onStart} />
    </aside>
  );
}
