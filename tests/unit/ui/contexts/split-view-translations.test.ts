import { describe, expect, it } from 'vitest';
import { APP_LANGUAGE_OPTIONS } from '../../../../ui/src/contexts/languageOptions';
import { getSplitViewTranslations, SPLIT_VIEW_TRANSLATIONS } from '../../../../ui/src/contexts/splitViewTranslations';

describe('split view translations', () => {
  it('defines every required split label for every supported locale', () => {
    for (const { value } of APP_LANGUAGE_OPTIONS) {
      const translation = SPLIT_VIEW_TRANSLATIONS[value];
      expect(translation).toBeDefined();
      for (const text of Object.values(translation)) expect(text.trim()).not.toBe('');
    }
  });

  it('falls back to English for an unknown language', () => {
    expect(getSplitViewTranslations('unknown')).toBe(SPLIT_VIEW_TRANSLATIONS.en);
  });
});
