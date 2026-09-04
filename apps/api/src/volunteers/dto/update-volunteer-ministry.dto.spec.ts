import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateVolunteerMinistryDto } from './update-volunteer-ministry.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateVolunteerMinistryDto, payload);
  return validate(dto);
}

describe('UpdateVolunteerMinistryDto', () => {
  it('aceita payload vazio', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita role e is_primary_leader válidos', async () => {
    expect(await errorsFor({ role: 'volunteer', is_primary_leader: false })).toHaveLength(0);
  });

  it('rejeita role fora do enum', async () => {
    const errors = await errorsFor({ role: 'chefe' });
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });

  it('rejeita is_primary_leader que não é boolean', async () => {
    const errors = await errorsFor({ is_primary_leader: 'sim' });
    expect(errors.some((e) => e.property === 'is_primary_leader')).toBe(true);
  });
});
