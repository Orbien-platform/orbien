import { ContentPostType } from '@prisma/client';
import { CATEGORY_BY_POST_TYPE, NOTIFICATION_CATEGORIES } from './notification-categories';

describe('CATEGORY_BY_POST_TYPE', () => {
  it('mapeia todos os valores de ContentPostType para uma categoria válida', () => {
    const validCategories = new Set<string>(NOTIFICATION_CATEGORIES);

    for (const postType of Object.values(ContentPostType)) {
      const category = CATEGORY_BY_POST_TYPE[postType];
      expect(category).toBeDefined();
      expect(validCategories.has(category)).toBe(true);
    }
  });

  it('mapeia as 8 categorias amplas conforme a spec (avisos, oracao, eventos, devocional)', () => {
    expect(CATEGORY_BY_POST_TYPE.post).toBe('avisos');
    expect(CATEGORY_BY_POST_TYPE.notice).toBe('avisos');
    expect(CATEGORY_BY_POST_TYPE.prayer).toBe('oracao');
    expect(CATEGORY_BY_POST_TYPE.event).toBe('eventos');
    expect(CATEGORY_BY_POST_TYPE.devotional).toBe('devocional');
    expect(CATEGORY_BY_POST_TYPE.study).toBe('devocional');
    expect(CATEGORY_BY_POST_TYPE.sermon_video).toBe('devocional');
    expect(CATEGORY_BY_POST_TYPE.audio).toBe('devocional');
  });
});
