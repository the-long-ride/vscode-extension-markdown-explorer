import type { ReactNode } from 'react';
import type { PaneId } from '../../split-view/paneState';
import { SplitDivider } from './SplitDivider';

interface SplitDocumentViewProps {
  ratio: number;
  activePane: PaneId;
  primary: ReactNode;
  secondary: ReactNode;
  onActivatePane: (paneId: PaneId) => void;
  onRatioChange: (ratio: number) => void;
  onCloseSecondary: () => void;
}

export function SplitDocumentView({
  ratio,
  activePane,
  primary,
  secondary,
  onActivatePane,
  onRatioChange,
  onCloseSecondary,
}: SplitDocumentViewProps) {
  return (
    <div className="split-document-view" data-active-pane={activePane}>
      <section
        className={`split-document-pane${activePane === 'primary' ? ' is-active' : ''}`}
        role="region"
        aria-label="Primary document"
        style={{ flexBasis: `${ratio * 100}%` }}
        onPointerDown={() => onActivatePane('primary')}
      >
        {primary}
      </section>
      <SplitDivider ratio={ratio} onRatioChange={onRatioChange} />
      <section
        className={`split-document-pane${activePane === 'secondary' ? ' is-active' : ''}`}
        role="region"
        aria-label="Secondary document"
        style={{ flexBasis: `${(1 - ratio) * 100}%` }}
        onPointerDown={() => onActivatePane('secondary')}
      >
        <button
          type="button"
          className="split-document-pane__close"
          aria-label="Close secondary pane"
          onClick={onCloseSecondary}
        >
          ×
        </button>
        {secondary}
      </section>
    </div>
  );
}
