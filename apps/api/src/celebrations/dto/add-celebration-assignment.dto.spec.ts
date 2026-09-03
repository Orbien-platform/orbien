import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddCelebrationAssignmentDto } from './add-celebration-assignment.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(AddCelebrationAssignmentDto, payload);
  return validate(dto);
}

describe('AddCelebrationAssignmentDto', () => {
  it('aceita volunteer_profile_id UUID válido', async () => {
    expect(
      await errorsFor({ volunteer_profile_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    ).toHaveLength(0);
  });

  it('rejeita volunteer_profile_id ausente/inválido', async () => {
    const errors = await errorsFor({ volunteer_profile_id: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'volunteer_profile_id')).toBe(true);
  });
});
