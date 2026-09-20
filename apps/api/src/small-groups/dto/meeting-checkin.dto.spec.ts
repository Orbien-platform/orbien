import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MeetingCheckinDto } from './meeting-checkin.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(MeetingCheckinDto, payload);
  return validate(dto);
}

describe('MeetingCheckinDto', () => {
  it('aceita um token não vazio', async () => {
    expect(await errorsFor({ token: 'algum-token' })).toHaveLength(0);
  });

  it('rejeita token ausente', async () => {
    const errors = await errorsFor({});
    expect(errors.some((e) => e.property === 'token')).toBe(true);
  });

  it('rejeita token vazio', async () => {
    const errors = await errorsFor({ token: '' });
    expect(errors.some((e) => e.property === 'token')).toBe(true);
  });
});
