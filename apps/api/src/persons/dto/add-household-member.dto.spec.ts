import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddHouseholdMemberDto } from './add-household-member.dto';

describe('AddHouseholdMemberDto', () => {
  it('aceita person_id UUID e role válidos', async () => {
    const dto = plainToInstance(AddHouseholdMemberDto, {
      person_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      role: 'spouse',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita person_id que não é UUID', async () => {
    const dto = plainToInstance(AddHouseholdMemberDto, { person_id: 'not-a-uuid', role: 'spouse' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'person_id')).toBe(true);
  });

  it('rejeita role fora do enum', async () => {
    const dto = plainToInstance(AddHouseholdMemberDto, {
      person_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      role: 'not-a-role',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });
});
