import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SegmentCriteriaDto, hasBehaviorCriteria } from './segment-criteria.dto';

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

  describe('critérios de comportamento/engajamento/inatividade (PROD-17)', () => {
    it('aceita inactive_since válido', async () => {
      expect(await errorsFor({ inactive_since: { days: 30 } })).toHaveLength(0);
    });

    it('rejeita inactive_since.days zero ou negativo', async () => {
      const errors = await errorsFor({ inactive_since: { days: 0 } });
      expect(errors.some((e) => e.property === 'inactive_since')).toBe(true);
    });

    it('aceita group_attendance_gap válido', async () => {
      expect(await errorsFor({ group_attendance_gap: { days: 60 } })).toHaveLength(0);
    });

    it('rejeita group_attendance_gap.days negativo', async () => {
      const errors = await errorsFor({ group_attendance_gap: { days: -5 } });
      expect(errors.some((e) => e.property === 'group_attendance_gap')).toBe(true);
    });

    it('aceita high_engagement válido', async () => {
      expect(await errorsFor({ high_engagement: { days: 30, min_events: 3 } })).toHaveLength(0);
    });

    it('rejeita high_engagement.min_events zero ou negativo', async () => {
      const errors = await errorsFor({ high_engagement: { days: 30, min_events: 0 } });
      expect(errors.some((e) => e.property === 'high_engagement')).toBe(true);
    });

    it('rejeita high_engagement sem days', async () => {
      const errors = await errorsFor({ high_engagement: { min_events: 3 } });
      expect(errors.some((e) => e.property === 'high_engagement')).toBe(true);
    });
  });
});

describe('hasBehaviorCriteria', () => {
  it('é falso para critérios só básicos', () => {
    expect(hasBehaviorCriteria({ roles: ['member'] } as never)).toBe(false);
    expect(hasBehaviorCriteria({})).toBe(false);
  });

  it('é verdadeiro quando qualquer critério avançado está presente', () => {
    expect(hasBehaviorCriteria({ inactive_since: { days: 30 } })).toBe(true);
    expect(hasBehaviorCriteria({ group_attendance_gap: { days: 30 } })).toBe(true);
    expect(hasBehaviorCriteria({ high_engagement: { days: 30, min_events: 2 } })).toBe(true);
  });
});
