import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MultiplySmallGroupDto } from './multiply-small-group.dto';

const BASE = {
  name: 'Célula Bairro A',
  leader_person_id: '22222222-2222-4222-8222-222222222222',
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(MultiplySmallGroupDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('MultiplySmallGroupDto', () => {
  it('aceita os campos obrigatórios', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita member_ids ausente — default é lista vazia (AC3 da spec)', async () => {
    const dto = plainToInstance(MultiplySmallGroupDto, BASE);
    expect(dto.member_ids).toEqual([]);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('aceita member_ids vazio explicitamente (AC3 da spec)', async () => {
    expect(await errorsFor({ member_ids: [] })).toHaveLength(0);
  });

  it('aceita member_ids com UUIDs válidos', async () => {
    expect(
      await errorsFor({
        member_ids: [
          '11111111-1111-4111-8111-111111111111',
          '33333333-3333-4333-8333-333333333333',
        ],
      }),
    ).toHaveLength(0);
  });

  it('aceita campos opcionais preenchidos', async () => {
    expect(
      await errorsFor({
        meeting_time: '19:30',
        recurrence: 'weekly',
        address: 'Rua das Flores, 123',
      }),
    ).toHaveLength(0);
  });

  it('rejeita name ausente', async () => {
    const errors = await errorsFor({ name: undefined });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejeita leader_person_id ausente', async () => {
    const errors = await errorsFor({ leader_person_id: undefined });
    expect(errors.some((e) => e.property === 'leader_person_id')).toBe(true);
  });

  it('rejeita leader_person_id que não é UUID', async () => {
    const errors = await errorsFor({ leader_person_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'leader_person_id')).toBe(true);
  });

  it('rejeita member_ids com item que não é UUID', async () => {
    const errors = await errorsFor({ member_ids: ['não-uuid'] });
    expect(errors.some((e) => e.property === 'member_ids')).toBe(true);
  });

  it('rejeita member_ids que não é array', async () => {
    const errors = await errorsFor({ member_ids: 'não-array' });
    expect(errors.some((e) => e.property === 'member_ids')).toBe(true);
  });
});
