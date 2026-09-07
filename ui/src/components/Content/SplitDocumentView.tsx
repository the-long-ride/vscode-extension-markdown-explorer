import type { ReactNode } from 'react';
import type { PaneId } from '../../split-view/paneState';
import { SplitDivider } from './SplitDivider';

interface SplitDocumentViewProps {
  ratio: number;
  activePane: PaneId;
  primary: ReactNode;
  secondary: ReactNode;
  primaryLabel?: string;
  secondaryLabel?: string;
  closeSecondaryLabel?: string;
  resizeLabel?: string;
  onActivatePane: (paneId: PaneId) => void;
  onRatioChange: (ratio: number) => void;
  onCloseSecondary: () => void;
}

export function SplitDocumentView({
  ratio,
  activePane,
  primary,
  secondary,
  primaryLabel = 'Primary document',
  secondaryLabel = 'Secondary document',
  closeSecondaryLabel = 'Close secondary pane',
  resizeLabel = 'Resize document panes',
  onActivatePane,
  onRatioChange,
  onCloseSecondary,
}: SplitDocumentViewProps) {
  return (
    <div
      className="split-document-view"
      data-active-pane={activePane}
      data-split-percent={Math.round(ratio * 100)}
      style={{ gridTemplateColumns: `minmax(0, ${ratio}fr) 6px minmax(0, ${1 - ratio}fr)` }}
    >
      <section
        className={`split-document-pane split-document-pane--primary${activePane === 'primary' ? ' is-active' : ''}`}
        role="region"
        aria-label={primaryLabel}
        onPointerDown={() => onActivatePane('primary')}
      >
        {primary}
      </section>
      <SplitDivider ratio={ratio} onRatioChange={onRatioChange} label={resizeLabel} />
      <section
        className={`split-document-pane split-document-pane--secondary${activePane === 'secondary' ? ' is-active' : ''}`}
        role="region"
        aria-label={secondaryLabel}
        onPointerDown={() => onActivatePane('secondary')}
      >
        <button
          type="button"
          className="split-document-pane__close"
          aria-label={closeSecondaryLabel}
          onClick={onCloseSecondary}
        >
          ×
        </button>
        {secondary}
      </section>
    </div>
  );
}
