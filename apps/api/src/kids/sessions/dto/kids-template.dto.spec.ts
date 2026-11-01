import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetKidsTemplateDto } from './set-kids-template.dto';
import { ApplyKidsTemplateDto } from './apply-kids-template.dto';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const bad = async <T extends object>(cls: new () => T, payload: Record<string, unknown>) =>
  (await validate(plainToInstance(cls, payload))).map((e) => e.property);

describe('SetKidsTemplateDto', () => {
  it('aceita uma lista de turmas, inclusive vazia (limpa o modelo)', async () => {
    expect(await bad(SetKidsTemplateDto, { room_ids: [A, B] })).toEqual([]);
    expect(await bad(SetKidsTemplateDto, { room_ids: [] })).toEqual([]);
  });

  it.each([
    ['ausente', undefined],
    ['não é array', A],
    ['id que não é UUID', ['x']],
    ['turma repetida', [A, A]],
  ])('rejeita room_ids %s', async (_l, room_ids) => {
    expect(await bad(SetKidsTemplateDto, { room_ids })).toContain('room_ids');
  });
});

describe('ApplyKidsTemplateDto', () => {
  it('aceita corpo vazio e janela de datas', async () => {
    expect(await bad(ApplyKidsTemplateDto, {})).toEqual([]);
    expect(await bad(ApplyKidsTemplateDto, { date_from: '2026-11-01', date_to: '2026-12-31' })).toEqual([]);
  });

  it('rejeita data inválida', async () => {
    expect(await bad(ApplyKidsTemplateDto, { date_from: 'amanhã' })).toContain('date_from');
    expect(await bad(ApplyKidsTemplateDto, { date_to: '31/12' })).toContain('date_to');
  });
});
