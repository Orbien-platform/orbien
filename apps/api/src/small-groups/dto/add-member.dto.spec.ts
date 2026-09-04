import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddMemberDto } from './add-member.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(AddMemberDto, payload);
  return validate(dto);
}

describe('AddMemberDto', () => {
  it('aceita apenas person_id', async () => {
    expect(await errorsFor({ person_id: '11111111-1111-4111-8111-111111111111' })).toHaveLength(0);
  });

  it('aceita role válido', async () => {
    expect(
      await errorsFor({ person_id: '11111111-1111-4111-8111-111111111111', role: 'leader' }),
    ).toHaveLength(0);
  });

  it('rejeita person_id ausente', async () => {
    const errors = await errorsFor({});
    expect(errors.some((e) => e.property === 'person_id')).toBe(true);
  });

  it('rejeita person_id que não é UUID', async () => {
    const errors = await errorsFor({ person_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'person_id')).toBe(true);
  });

  it('rejeita role fora do enum', async () => {
    const errors = await errorsFor({
      person_id: '11111111-1111-4111-8111-111111111111',
      role: 'presidente',
    });
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });
});
