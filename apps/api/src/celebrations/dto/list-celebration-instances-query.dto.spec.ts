import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListCelebrationInstancesQueryDto } from './list-celebration-instances-query.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(ListCelebrationInstancesQueryDto, payload);
  return validate(dto);
}

describe('ListCelebrationInstancesQueryDto', () => {
  it('aceita objeto vazio (todos os filtros são opcionais)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita todos os filtros válidos', async () => {
    expect(
      await errorsFor({
        celebration_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        status: 'draft',
        date_from: '2026-09-01',
        date_to: '2026-09-30',
      }),
    ).toHaveLength(0);
  });

  it('rejeita celebration_id que não é UUID', async () => {
    const errors = await errorsFor({ celebration_id: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'celebration_id')).toBe(true);
  });

  it('rejeita status fora do enum', async () => {
    const errors = await errorsFor({ status: 'invalido' });
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('rejeita date_from inválida', async () => {
    const errors = await errorsFor({ date_from: 'não é data' });
    expect(errors.some((e) => e.property === 'date_from')).toBe(true);
  });

  it('rejeita date_to inválida', async () => {
    const errors = await errorsFor({ date_to: 'não é data' });
    expect(errors.some((e) => e.property === 'date_to')).toBe(true);
  });
});
