import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SaveAttendanceDto } from './save-attendance.dto';

const errorsFor = (body: Record<string, unknown>) =>
  validate(plainToInstance(SaveAttendanceDto, { children: 0, members: 0, attendees: 0, visitors: 0, ...body }));

describe('SaveAttendanceDto', () => {
  it('aceita zeros e o limite máximo', async () => {
    expect(await errorsFor({})).toHaveLength(0);
    expect(await errorsFor({ members: 100000 })).toHaveLength(0);
  });

  it.each([
    ['negativo', { visitors: -1 }],
    ['acima do limite', { members: 100001 }],
    ['fracionado', { children: 1.5 }],
    ['texto', { attendees: 'dez' }],
  ])('rejeita valor %s', async (_n, body) => {
    expect((await errorsFor(body)).length).toBeGreaterThan(0);
  });

  it('rejeita campo ausente (zero é informação, vazio não)', async () => {
    expect((await validate(plainToInstance(SaveAttendanceDto, { children: 1, members: 1, attendees: 1 }))).length).toBe(1);
  });
});
