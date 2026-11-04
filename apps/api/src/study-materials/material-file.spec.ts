import { BadRequestException } from '@nestjs/common';
import { assertMaterialFile } from './material-file';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const file = (originalname: string, mimetype: string, buffer?: Buffer) =>
  ({ originalname, mimetype, buffer }) as Express.Multer.File;

describe('assertMaterialFile', () => {
  it('aceita PDF, doc e docx com o conteúdo certo', () => {
    expect(assertMaterialFile(file('a.pdf', 'application/pdf', Buffer.from('%PDF-1.7\n')))).toEqual({
      ext: '.pdf',
      source: 'pdf',
    });
    expect(assertMaterialFile(file('a.doc', 'application/msword', OLE))).toEqual({ ext: '.doc', source: 'doc' });
    expect(
      assertMaterialFile(file('A.DOCX', DOCX, Buffer.concat([ZIP, Buffer.from('....word/document.xml')]))),
    ).toEqual({ ext: '.docx', source: 'doc' });
  });

  it.each([
    ['executável (MZ) com nome e mimetype de PDF', file('x.pdf', 'application/pdf', Buffer.from('MZ\x90\x00'))],
    ['texto com nome e mimetype de PDF', file('x.pdf', 'application/pdf', Buffer.from('oi'))],
    ['PDF dentro de um .doc', file('x.doc', 'application/msword', Buffer.from('%PDF-1.4'))],
    ['PDF dentro de um .docx', file('x.docx', DOCX, Buffer.from('%PDF-1.4 word/'))],
    ['zip qualquer (sem word/) como .docx', file('x.docx', DOCX, Buffer.concat([ZIP, Buffer.from('xl/workbook.xml')]))],
    ['OLE como .docx', file('x.docx', DOCX, OLE)],
    ['zip como .doc', file('x.doc', 'application/msword', Buffer.concat([ZIP, Buffer.from('word/')]))],
    ['arquivo vazio', file('x.pdf', 'application/pdf', Buffer.alloc(0))],
    ['sem buffer', file('x.pdf', 'application/pdf')],
  ])('recusa %s', (_n, f) => {
    expect(() => assertMaterialFile(f)).toThrow(BadRequestException);
    expect(() => assertMaterialFile(f)).toThrow(/conteúdo do arquivo/);
  });

  it('continua recusando mimetype ou extensão fora da lista', () => {
    expect(() => assertMaterialFile(file('x.png', 'image/png', Buffer.from('%PDF-')))).toThrow(/PDF ou Word/);
    expect(() => assertMaterialFile(file('x.exe', 'application/pdf', Buffer.from('%PDF-')))).toThrow(/PDF ou Word/);
  });
});
