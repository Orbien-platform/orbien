import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OpenKidsSessionsDto } from './open-kids-sessions.dto';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const errors = (payload: Record<string, unknown>) => validate(plainToInstance(OpenKidsSessionsDto, payload));

describe('OpenKidsSessionsDto', () => {
  it('aceita uma ou várias turmas', async () => {
    expect(await errors({ room_ids: [A] })).toHaveLength(0);
    expect(await errors({ room_ids: [A, B] })).toHaveLength(0);
  });

  it.each([
    ['ausente', undefined],
    ['vazio', []],
    ['não é array', A],
    ['id que não é UUID', ['x']],
    ['turma repetida', [A, A]],
  ])('rejeita room_ids %s', async (_label, room_ids) => {
    const e = await errors({ room_ids });
    expect(e.some((x) => x.property === 'room_ids')).toBe(true);
  });
});
