/**
 * Tradução do `book_code` canônico (USFM, `bible-books.constant.ts`) para a
 * abreviação em português que o provedor externo configurado
 * (abibliadigital.com.br) espera no path de `GET /verses/:version/:abbrev/:chapter`.
 *
 * Isolada num arquivo próprio — não em `bible-books.constant.ts` — porque é
 * um detalhe DESTE provedor, não um fato estrutural do cânon: trocar de
 * provedor (design.md, Approach A) troca só este arquivo, nunca o
 * `book_code` armazenado em `bible_verse_marks`.
 *
 * CONFIANÇA: só 5 das 66 entradas foram confirmadas contra a documentação
 * real do provedor (gn, ex, mt, 1co, sl — ver DOCUMENTATION.md do
 * repositório omarciovsena/abibliadigital). As demais seguem o padrão de
 * abreviação em português já confirmado nesses 5 casos (2 letras minúsculas,
 * prefixo numérico para livros sequenciais: "1co", não "co1"), mas não foram
 * verificadas uma a uma contra o endpoint `GET /books` ao vivo — o acesso a
 * `abibliadigital.com.br` está bloqueado pela política de rede deste
 * ambiente. Uma abreviação errada faz aquele livro específico falhar sempre
 * (502 tratável, nunca corrompe dado — `BibleReaderService` já trata isso),
 * nunca silenciosamente. Antes de ligar em produção, confirme a lista
 * completa contra `GET https://www.abibliadigital.com.br/api/books`.
 */
export const ABIBLIADIGITAL_BOOK_ABBREV: Readonly<Record<string, string>> = {
  // Antigo Testamento
  GEN: 'gn',
  EXO: 'ex',
  LEV: 'lv',
  NUM: 'nm',
  DEU: 'dt',
  JOS: 'js',
  JDG: 'jz',
  RUT: 'rt',
  '1SA': '1sm',
  '2SA': '2sm',
  '1KI': '1rs',
  '2KI': '2rs',
  '1CH': '1cr',
  '2CH': '2cr',
  EZR: 'ed',
  NEH: 'ne',
  EST: 'et',
  JOB: 'job',
  PSA: 'sl',
  PRO: 'pv',
  ECC: 'ec',
  SNG: 'ct',
  ISA: 'is',
  JER: 'jr',
  LAM: 'lm',
  EZK: 'ez',
  DAN: 'dn',
  HOS: 'os',
  JOL: 'jl',
  AMO: 'am',
  OBA: 'ob',
  JON: 'jn',
  MIC: 'mq',
  NAM: 'na',
  HAB: 'hc',
  ZEP: 'sf',
  HAG: 'ag',
  ZEC: 'zc',
  MAL: 'ml',
  // Novo Testamento
  MAT: 'mt',
  MRK: 'mc',
  LUK: 'lc',
  JHN: 'jo',
  ACT: 'at',
  ROM: 'rm',
  '1CO': '1co',
  '2CO': '2co',
  GAL: 'gl',
  EPH: 'ef',
  PHP: 'fp',
  COL: 'cl',
  '1TH': '1ts',
  '2TH': '2ts',
  '1TI': '1tm',
  '2TI': '2tm',
  TIT: 'tt',
  PHM: 'fm',
  HEB: 'hb',
  JAS: 'tg',
  '1PE': '1pe',
  '2PE': '2pe',
  '1JN': '1jo',
  '2JN': '2jo',
  '3JN': '3jo',
  JUD: 'jd',
  REV: 'ap',
};
