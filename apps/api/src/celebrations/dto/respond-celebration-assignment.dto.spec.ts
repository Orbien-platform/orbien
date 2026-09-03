import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RespondCelebrationAssignmentDto } from './respond-celebration-assignment.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(RespondCelebrationAssignmentDto, payload);
  return validate(dto);
}

describe('RespondCelebrationAssignmentDto', () => {
  it('aceita status confirmed', async () => {
    expect(await errorsFor({ status: 'confirmed' })).toHaveLength(0);
  });

  it('aceita status declined', async () => {
    expect(await errorsFor({ status: 'declined' })).toHaveLength(0);
  });

  it('rejeita status pending (fora da allowlist de resposta)', async () => {
    const errors = await errorsFor({ status: 'pending' });
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('rejeita status inválido', async () => {
    const errors = await errorsFor({ status: 'invalido' });
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });
});
