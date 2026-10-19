import { BadRequestException } from '@nestjs/common';
import * as path from 'node:path';

// PDF e Word. O mimetype vem do cliente, então a extensão confere junto: um
// executável renomeado para .pdf não passa pelos dois.
const MATERIAL_FILE_TYPES: Record<string, { ext: string[]; source: 'pdf' | 'doc' }> = {
  'application/pdf': { ext: ['.pdf'], source: 'pdf' },
  'application/msword': { ext: ['.doc'], source: 'doc' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: ['.docx'],
    source: 'doc',
  },
};

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
  return { ext, source: type.source };
}
