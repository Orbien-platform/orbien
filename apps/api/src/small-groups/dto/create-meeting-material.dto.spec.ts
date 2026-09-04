import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMeetingMaterialDto } from './create-meeting-material.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateMeetingMaterialDto, payload);
  return validate(dto);
}

describe('CreateMeetingMaterialDto', () => {
  it('aceita apenas material_id', async () => {
    expect(await errorsFor({ material_id: '11111111-1111-4111-8111-111111111111' })).toHaveLength(0);
  });

  it('aceita visibility válida', async () => {
    expect(
      await errorsFor({
        material_id: '11111111-1111-4111-8111-111111111111',
        visibility: 'leaders_only',
      }),
    ).toHaveLength(0);
  });

  it('rejeita material_id ausente', async () => {
    const errors = await errorsFor({});
    expect(errors.some((e) => e.property === 'material_id')).toBe(true);
  });

  it('rejeita material_id que não é UUID', async () => {
    const errors = await errorsFor({ material_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'material_id')).toBe(true);
  });

  it('rejeita visibility fora do enum', async () => {
    const errors = await errorsFor({
      material_id: '11111111-1111-4111-8111-111111111111',
      visibility: 'secreto',
    });
    expect(errors.some((e) => e.property === 'visibility')).toBe(true);
  });
});
