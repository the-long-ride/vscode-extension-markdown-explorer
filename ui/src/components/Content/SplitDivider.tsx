interface SplitDividerProps {
  ratio: number;
  onRatioChange: (ratio: number) => void;
}

const MIN_RATIO = 0.25;
const MAX_RATIO = 0.75;
const STEP = 0.02;

function clampRatio(value: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, Math.round(value * 100) / 100));
}

export function SplitDivider({ ratio, onRatioChange }: SplitDividerProps) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = ratio - STEP;
    if (event.key === 'ArrowRight') next = ratio + STEP;
    if (event.key === 'Home') next = MIN_RATIO;
    if (event.key === 'End') next = MAX_RATIO;
    if (next === null) return;
    event.preventDefault();
    onRatioChange(clampRatio(next));
  };

  return (
    <div
      className="split-document-divider"
      role="separator"
      aria-label="Resize document panes"
      aria-orientation="vertical"
      aria-valuemin={25}
      aria-valuemax={75}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    />
  );
}
