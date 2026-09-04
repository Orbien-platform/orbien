import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SegmentCriteriaDto } from './segment-criteria.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(SegmentCriteriaDto, payload);
  return validate(dto);
}

describe('SegmentCriteriaDto', () => {
  it('aceita objeto vazio (todos os campos são opcionais)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita todos os campos preenchidos', async () => {
    expect(
      await errorsFor({
        congregation_ids: ['11111111-1111-4111-8111-111111111111'],
        group_ids: ['22222222-2222-4222-8222-222222222222'],
        ministry_ids: ['33333333-3333-4333-8333-333333333333'],
        age_range: { min: 0, max: 18 },
        roles: ['member'],
      }),
    ).toHaveLength(0);
  });

  it('rejeita congregation_ids com item que não é UUID', async () => {
    const errors = await errorsFor({ congregation_ids: ['não-uuid'] });
    expect(errors.some((e) => e.property === 'congregation_ids')).toBe(true);
  });

  it('rejeita group_ids com item que não é UUID', async () => {
    const errors = await errorsFor({ group_ids: ['não-uuid'] });
    expect(errors.some((e) => e.property === 'group_ids')).toBe(true);
  });

  it('rejeita ministry_ids com item que não é UUID', async () => {
    const errors = await errorsFor({ ministry_ids: ['não-uuid'] });
    expect(errors.some((e) => e.property === 'ministry_ids')).toBe(true);
  });

  it('rejeita roles com item que não é string', async () => {
    const errors = await errorsFor({ roles: [42] });
    expect(errors.some((e) => e.property === 'roles')).toBe(true);
  });

  it('rejeita age_range com min negativo', async () => {
    const errors = await errorsFor({ age_range: { min: -1, max: 10 } });
    expect(errors.some((e) => e.property === 'age_range')).toBe(true);
  });
});
