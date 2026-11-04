import { BadRequestException } from '@nestjs/common';
import * as path from 'node:path';

type MaterialKind = 'pdf' | 'doc' | 'docx';

// PDF e Word. O mimetype e o nome vêm do cliente, então a extensão confere
// junto, e o conteúdo (magic bytes) confere por último: um executável
// renomeado para .pdf, com mimetype de PDF, só é barrado por ele.
const MATERIAL_FILE_TYPES: Record<string, { ext: string[]; source: 'pdf' | 'doc'; kind: MaterialKind }> = {
  'application/pdf': { ext: ['.pdf'], source: 'pdf', kind: 'pdf' },
  'application/msword': { ext: ['.doc'], source: 'doc', kind: 'doc' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: ['.docx'],
    source: 'doc',
    kind: 'docx',
  },
};

const PDF_MAGIC = Buffer.from('%PDF-');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const DOCX_PART = Buffer.from('word/');

function startsWith(buf: Buffer | undefined, magic: Buffer): boolean {
  return !!buf && buf.length >= magic.length && buf.subarray(0, magic.length).equals(magic);
}

/**
 * Confere o conteúdo contra o tipo declarado. PDF: `%PDF-` no início (o `%PDF-`
 * pode vir até o byte 1024 em arquivos com lixo antes, mas o leitor mais comum
 * exige o início — ficamos com o início). docx: zip (`PK\x03\x04`) com uma
 * parte `word/`, o que separa de um xlsx/pptx/zip qualquer. doc: OLE2.
 */
function contentMatches(kind: MaterialKind, buf: Buffer | undefined): boolean {
  if (kind === 'pdf') return startsWith(buf, PDF_MAGIC);
  if (kind === 'doc') return startsWith(buf, OLE_MAGIC);
  return startsWith(buf, ZIP_MAGIC) && !!buf && buf.includes(DOCX_PART);
}

/** Valida o arquivo de material e devolve a extensão e o `StudyMaterialSource` dele. */
export function assertMaterialFile(file: Express.Multer.File): {
  ext: string;
  source: 'pdf' | 'doc';
} {
  const ext = path.extname(file.originalname).toLowerCase();
  const type = MATERIAL_FILE_TYPES[file.mimetype];
  if (!type || !type.ext.includes(ext)) {
    throw new BadRequestException('Envie um arquivo PDF ou Word (.doc, .docx).');
  }
  if (!contentMatches(type.kind, file.buffer)) {
    throw new BadRequestException(
      'O conteúdo do arquivo não corresponde a um PDF ou Word válido. Confira se ele não está corrompido nem foi renomeado.',
    );
  }
  return { ext, source: type.source };
}
