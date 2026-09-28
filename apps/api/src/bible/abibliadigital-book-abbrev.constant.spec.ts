import { BIBLE_BOOKS } from './bible-books.constant';
import { ABIBLIADIGITAL_BOOK_ABBREV } from './abibliadigital-book-abbrev.constant';

describe('ABIBLIADIGITAL_BOOK_ABBREV', () => {
  it('tem exatamente uma entrada para cada um dos 66 book_code de BIBLE_BOOKS', () => {
    const codes = BIBLE_BOOKS.map((b) => b.code);
    expect(Object.keys(ABIBLIADIGITAL_BOOK_ABBREV).sort()).toEqual([...codes].sort());
  });

  it('não tem book_code sem abreviação (nenhum valor vazio)', () => {
    for (const abbrev of Object.values(ABIBLIADIGITAL_BOOK_ABBREV)) {
      expect(abbrev.length).toBeGreaterThan(0);
    }
  });

  it('não repete a mesma abreviação para dois livros diferentes', () => {
    const abbrevs = Object.values(ABIBLIADIGITAL_BOOK_ABBREV);
    expect(new Set(abbrevs).size).toBe(abbrevs.length);
  });

  it('as 5 abreviações confirmadas contra a documentação real batem exatamente', () => {
    expect(ABIBLIADIGITAL_BOOK_ABBREV['GEN']).toBe('gn');
    expect(ABIBLIADIGITAL_BOOK_ABBREV['EXO']).toBe('ex');
    expect(ABIBLIADIGITAL_BOOK_ABBREV['MAT']).toBe('mt');
    expect(ABIBLIADIGITAL_BOOK_ABBREV['1CO']).toBe('1co');
    expect(ABIBLIADIGITAL_BOOK_ABBREV['PSA']).toBe('sl');
  });
});
