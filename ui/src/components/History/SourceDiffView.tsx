import { useMemo } from 'react';
import { diffLines } from '../../history/lineDiff';

interface SourceDiffViewProps {
  leftSource: string;
  rightSource: string;
  leftLabel?: string;
  rightLabel?: string;
}

function statusFor(type: 'context' | 'remove' | 'add'): string {
  if (type === 'remove') return 'Removed';
  if (type === 'add') return 'Added';
  return 'Unchanged';
}

export function SourceDiffView({ leftSource, rightSource, leftLabel = 'Left', rightLabel = 'Right' }: SourceDiffViewProps) {
  const lines = useMemo(() => diffLines(leftSource, rightSource).flatMap((hunk) => hunk.lines), [leftSource, rightSource]);
  return (
    <section className="source-diff-view" aria-label="Source diff">
      <header className="document-diff-view__labels">
        <span>Left — {leftLabel}</span>
        <span>Right — {rightLabel}</span>
      </header>
      <div className="source-diff-view__scroll">
        <table className="source-diff-view__table">
          <thead><tr><th>Status</th><th>Left</th><th>Right</th><th>Source</th></tr></thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={`${line.type}-${index}`} data-diff-type={line.type}>
                <td className="source-diff-view__status">{statusFor(line.type)}</td>
                <td className="source-diff-view__line-number">{'left' in line ? line.left : ''}</td>
                <td className="source-diff-view__line-number">{'right' in line ? line.right : ''}</td>
                <td className="source-diff-view__source"><code>{line.text || ' '}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
