import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RecordAttendanceDto } from './record-attendance.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(RecordAttendanceDto, payload);
  return validate(dto);
}

describe('RecordAttendanceDto', () => {
  it('aceita uma lista com ao menos um UUID', async () => {
    expect(
      await errorsFor({ person_ids: ['11111111-1111-4111-8111-111111111111'] }),
    ).toHaveLength(0);
  });

  it('rejeita lista vazia', async () => {
    const errors = await errorsFor({ person_ids: [] });
    expect(errors.some((e) => e.property === 'person_ids')).toBe(true);
  });

  it('rejeita person_ids ausente', async () => {
    const errors = await errorsFor({});
    expect(errors.some((e) => e.property === 'person_ids')).toBe(true);
  });

  it('rejeita item que não é UUID', async () => {
    const errors = await errorsFor({ person_ids: ['não-uuid'] });
    expect(errors.some((e) => e.property === 'person_ids')).toBe(true);
  });
});
