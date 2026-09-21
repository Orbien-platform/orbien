import { BIBLE_BOOKS } from './bible-books.constant';

describe('BIBLE_BOOKS', () => {
  it('tem exatamente 66 livros', () => {
    expect(BIBLE_BOOKS).toHaveLength(66);
  });

  it('tem 39 livros do Antigo Testamento e 27 do Novo Testamento, somando 66', () => {
    const at = BIBLE_BOOKS.filter((b) => b.testament === 'AT');
    const nt = BIBLE_BOOKS.filter((b) => b.testament === 'NT');

    expect(at).toHaveLength(39);
    expect(nt).toHaveLength(27);
    expect(at.length + nt.length).toBe(66);
  });

  it('cada livro tem código, nome, testamento e número de capítulos positivo', () => {
    for (const book of BIBLE_BOOKS) {
      expect(book.code).toEqual(expect.any(String));
      expect(book.code.length).toBeGreaterThan(0);
      expect(book.name).toEqual(expect.any(String));
      expect(book.name.length).toBeGreaterThan(0);
      expect(['AT', 'NT']).toContain(book.testament);
      expect(Number.isInteger(book.chapters)).toBe(true);
      expect(book.chapters).toBeGreaterThan(0);
    }
  });

  it('não tem código de livro repetido', () => {
    const codes = BIBLE_BOOKS.map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
