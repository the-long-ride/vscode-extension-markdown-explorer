import { getEditorUiTranslations } from '../../contexts/editorUiTranslations';
import type { DocumentViewMode } from '../../split-view/paneState';
import { PlainMarkdownEditor } from './PlainMarkdownEditor';

interface DocumentSurfaceProps {
  filePath: string;
  relativePath: string;
  mode: DocumentViewMode;
  contentHtml: string;
  source: string;
  stale: boolean;
  language: string;
  onSourceChange: (source: string) => void;
  onSave: () => void | Promise<unknown>;
}

export function DocumentSurface({
  filePath,
  relativePath,
  mode,
  contentHtml,
  source,
  language,
  onSourceChange,
  onSave,
}: DocumentSurfaceProps) {
  const editorT = getEditorUiTranslations(language);
  return (
    <div
      className="mdn-body document-surface"
      data-testid="document-surface"
      data-file-path={filePath}
      data-mdn-source-document-path={relativePath || undefined}
      aria-live="polite"
    >
      {mode === 'plain' ? (
        <PlainMarkdownEditor
          value={source}
          ariaLabel={editorT.plainSourceLabel}
          onChange={onSourceChange}
          onSave={() => { void onSave(); }}
        />
      ) : (
        <div dangerouslySetInnerHTML={{ __html: contentHtml }} />
      )}
    </div>
  );
}
