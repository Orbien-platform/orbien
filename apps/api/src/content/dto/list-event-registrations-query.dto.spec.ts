import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListEventRegistrationsQueryDto } from './list-event-registrations-query.dto';

async function errorsFor(payload: Record<string, unknown>) {
  return validate(plainToInstance(ListEventRegistrationsQueryDto, payload));
}

describe('ListEventRegistrationsQueryDto', () => {
  it('sem filtro é válido — o serviço decide o padrão', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it.each(['confirmed', 'waitlisted', 'cancelled'])('aceita o status %s', async (status) => {
    expect(await errorsFor({ status })).toHaveLength(0);
  });

  it('status inventado não passa', async () => {
    expect((await errorsFor({ status: 'talvez' })).some((e) => e.property === 'status')).toBe(true);
  });
});
