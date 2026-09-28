/**
 * Lista canônica dos 66 livros da Bíblia protestante — códigos, nomes
 * pt-BR, testamento e quantidade de capítulos (biblia-nvi-marcacoes-mobile,
 * BIB-01).
 *
 * São FATOS estruturais (metadados públicos sobre a estrutura do cânon),
 * não texto bíblico — sem questão de licença. O texto em si vem da API
 * bíblica externa licenciada (ver `bible-text-provider.interface.ts`).
 *
 * Códigos no padrão USFM de 3 letras (GEN, EXO, ..., JHN, ..., REV), para
 * casar com o identificador que a API bíblica externa espera.
 */

export type BibleTestament = 'AT' | 'NT';

export interface BibleBook {
  code: string;
  name: string;
  testament: BibleTestament;
  chapters: number;
}

export const BIBLE_BOOKS: readonly BibleBook[] = [
  // Antigo Testamento (39 livros)
  { code: 'GEN', name: 'Gênesis', testament: 'AT', chapters: 50 },
  { code: 'EXO', name: 'Êxodo', testament: 'AT', chapters: 40 },
  { code: 'LEV', name: 'Levítico', testament: 'AT', chapters: 27 },
  { code: 'NUM', name: 'Números', testament: 'AT', chapters: 36 },
  { code: 'DEU', name: 'Deuteronômio', testament: 'AT', chapters: 34 },
  { code: 'JOS', name: 'Josué', testament: 'AT', chapters: 24 },
  { code: 'JDG', name: 'Juízes', testament: 'AT', chapters: 21 },
  { code: 'RUT', name: 'Rute', testament: 'AT', chapters: 4 },
  { code: '1SA', name: '1 Samuel', testament: 'AT', chapters: 31 },
  { code: '2SA', name: '2 Samuel', testament: 'AT', chapters: 24 },
  { code: '1KI', name: '1 Reis', testament: 'AT', chapters: 22 },
  { code: '2KI', name: '2 Reis', testament: 'AT', chapters: 25 },
  { code: '1CH', name: '1 Crônicas', testament: 'AT', chapters: 29 },
  { code: '2CH', name: '2 Crônicas', testament: 'AT', chapters: 36 },
  { code: 'EZR', name: 'Esdras', testament: 'AT', chapters: 10 },
  { code: 'NEH', name: 'Neemias', testament: 'AT', chapters: 13 },
  { code: 'EST', name: 'Ester', testament: 'AT', chapters: 10 },
  { code: 'JOB', name: 'Jó', testament: 'AT', chapters: 42 },
  { code: 'PSA', name: 'Salmos', testament: 'AT', chapters: 150 },
  { code: 'PRO', name: 'Provérbios', testament: 'AT', chapters: 31 },
  { code: 'ECC', name: 'Eclesiastes', testament: 'AT', chapters: 12 },
  { code: 'SNG', name: 'Cântico dos Cânticos', testament: 'AT', chapters: 8 },
  { code: 'ISA', name: 'Isaías', testament: 'AT', chapters: 66 },
  { code: 'JER', name: 'Jeremias', testament: 'AT', chapters: 52 },
  { code: 'LAM', name: 'Lamentações', testament: 'AT', chapters: 5 },
  { code: 'EZK', name: 'Ezequiel', testament: 'AT', chapters: 48 },
  { code: 'DAN', name: 'Daniel', testament: 'AT', chapters: 12 },
  { code: 'HOS', name: 'Oseias', testament: 'AT', chapters: 14 },
  { code: 'JOL', name: 'Joel', testament: 'AT', chapters: 3 },
  { code: 'AMO', name: 'Amós', testament: 'AT', chapters: 9 },
  { code: 'OBA', name: 'Obadias', testament: 'AT', chapters: 1 },
  { code: 'JON', name: 'Jonas', testament: 'AT', chapters: 4 },
  { code: 'MIC', name: 'Miqueias', testament: 'AT', chapters: 7 },
  { code: 'NAM', name: 'Naum', testament: 'AT', chapters: 3 },
  { code: 'HAB', name: 'Habacuque', testament: 'AT', chapters: 3 },
  { code: 'ZEP', name: 'Sofonias', testament: 'AT', chapters: 3 },
  { code: 'HAG', name: 'Ageu', testament: 'AT', chapters: 2 },
  { code: 'ZEC', name: 'Zacarias', testament: 'AT', chapters: 14 },
  { code: 'MAL', name: 'Malaquias', testament: 'AT', chapters: 4 },
  // Novo Testamento (27 livros)
  { code: 'MAT', name: 'Mateus', testament: 'NT', chapters: 28 },
  { code: 'MRK', name: 'Marcos', testament: 'NT', chapters: 16 },
  { code: 'LUK', name: 'Lucas', testament: 'NT', chapters: 24 },
  { code: 'JHN', name: 'João', testament: 'NT', chapters: 21 },
  { code: 'ACT', name: 'Atos', testament: 'NT', chapters: 28 },
  { code: 'ROM', name: 'Romanos', testament: 'NT', chapters: 16 },
  { code: '1CO', name: '1 Coríntios', testament: 'NT', chapters: 16 },
  { code: '2CO', name: '2 Coríntios', testament: 'NT', chapters: 13 },
  { code: 'GAL', name: 'Gálatas', testament: 'NT', chapters: 6 },
  { code: 'EPH', name: 'Efésios', testament: 'NT', chapters: 6 },
  { code: 'PHP', name: 'Filipenses', testament: 'NT', chapters: 4 },
  { code: 'COL', name: 'Colossenses', testament: 'NT', chapters: 4 },
  { code: '1TH', name: '1 Tessalonicenses', testament: 'NT', chapters: 5 },
  { code: '2TH', name: '2 Tessalonicenses', testament: 'NT', chapters: 3 },
  { code: '1TI', name: '1 Timóteo', testament: 'NT', chapters: 6 },
  { code: '2TI', name: '2 Timóteo', testament: 'NT', chapters: 4 },
  { code: 'TIT', name: 'Tito', testament: 'NT', chapters: 3 },
  { code: 'PHM', name: 'Filemom', testament: 'NT', chapters: 1 },
  { code: 'HEB', name: 'Hebreus', testament: 'NT', chapters: 13 },
  { code: 'JAS', name: 'Tiago', testament: 'NT', chapters: 5 },
  { code: '1PE', name: '1 Pedro', testament: 'NT', chapters: 5 },
  { code: '2PE', name: '2 Pedro', testament: 'NT', chapters: 3 },
  { code: '1JN', name: '1 João', testament: 'NT', chapters: 5 },
  { code: '2JN', name: '2 João', testament: 'NT', chapters: 1 },
  { code: '3JN', name: '3 João', testament: 'NT', chapters: 1 },
  { code: 'JUD', name: 'Judas', testament: 'NT', chapters: 1 },
  { code: 'REV', name: 'Apocalipse', testament: 'NT', chapters: 22 },
];
