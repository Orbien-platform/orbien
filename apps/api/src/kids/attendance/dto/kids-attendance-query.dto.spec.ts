import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { KidsAttendanceQueryDto } from './kids-attendance-query.dto';

const run = (o: object) =>
  validate(plainToInstance(KidsAttendanceQueryDto, o), { whitelist: true, forbidNonWhitelisted: true });

describe('KidsAttendanceQueryDto', () => {
  it('tudo é opcional (período padrão e todas as turmas)', async () => {
    expect(await run({})).toHaveLength(0);
  });

  it('aceita período e turma', async () => {
    expect(
      await run({ date_from: '2026-08-01', date_to: '2026-10-26', room_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    ).toHaveLength(0);
  });

  it.each([
    ['data inicial inválida', { date_from: 'ontem' }],
    ['data final inválida', { date_to: '31/12/2026' }],
    ['turma que não é UUID', { room_id: 'abc' }],
    ['campo desconhecido', { tenant_id: 'x' }],
  ])('400 com %s', async (_l, body) => {
    expect((await run(body)).length).toBeGreaterThan(0);
  });
});
