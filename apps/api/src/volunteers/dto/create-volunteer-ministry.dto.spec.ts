import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateVolunteerMinistryDto } from './create-volunteer-ministry.dto';

const BASE = {
  volunteer_profile_id: '11111111-1111-4111-8111-111111111111',
  ministry_id: '22222222-2222-4222-8222-222222222222',
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateVolunteerMinistryDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateVolunteerMinistryDto', () => {
  it('aceita apenas os campos obrigatórios', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita role e is_primary_leader informados', async () => {
    expect(await errorsFor({ role: 'leader', is_primary_leader: true })).toHaveLength(0);
  });

  it('rejeita volunteer_profile_id que não é UUID', async () => {
    const errors = await errorsFor({ volunteer_profile_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'volunteer_profile_id')).toBe(true);
  });

  it('rejeita ministry_id que não é UUID', async () => {
    const errors = await errorsFor({ ministry_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'ministry_id')).toBe(true);
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
