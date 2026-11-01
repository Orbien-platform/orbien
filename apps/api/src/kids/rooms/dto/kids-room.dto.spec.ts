import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateKidsRoomDto } from './create-kids-room.dto';
import { UpdateKidsRoomDto } from './update-kids-room.dto';
import { ListKidsRoomsQueryDto } from './list-kids-rooms-query.dto';

const BASE = { name: 'Maternal', min_age_months: 24, max_age_months: 47 };

async function create(payload: Record<string, unknown>) {
  return validate(plainToInstance(CreateKidsRoomDto, { ...BASE, ...payload }));
}
const has = (errors: { property: string }[], prop: string) => errors.some((e) => e.property === prop);

describe('CreateKidsRoomDto (spec P1 Turmas, AC 1 e 2)', () => {
  it('aceita nome e faixa; o resto é opcional', async () => {
    expect(await create({})).toHaveLength(0);
  });

  it('aceita todos os campos preenchidos', async () => {
    expect(await create({ allows_out_of_range: true, capacity: 12, min_volunteers: 2 })).toHaveLength(0);
  });

  it('aceita faixa de um único mês (min = max)', async () => {
    expect(await create({ min_age_months: 0, max_age_months: 0 })).toHaveLength(0);
  });

  it.each(['min_age_months', 'max_age_months'])('rejeita %s ausente (faixa obrigatória)', async (field) => {
    expect(has(await create({ [field]: undefined }), field)).toBe(true);
  });

  it.each(['min_age_months', 'max_age_months'])('rejeita %s negativo', async (field) => {
    expect(has(await create({ [field]: -1 }), field)).toBe(true);
  });

  it.each(['min_age_months', 'max_age_months'])('rejeita %s fracionário', async (field) => {
    expect(has(await create({ [field]: 1.5 }), field)).toBe(true);
  });

  it('rejeita faixa que estoura int4 (evita 500 no banco)', async () => {
    expect(has(await create({ max_age_months: 3_000_000_000 }), 'max_age_months')).toBe(true);
  });

  it('rejeita name vazio', async () => {
    expect(has(await create({ name: '' }), 'name')).toBe(true);
  });

  it('rejeita allows_out_of_range que não é booleano', async () => {
    expect(has(await create({ allows_out_of_range: 'sim' }), 'allows_out_of_range')).toBe(true);
  });

  it('rejeita capacity zero ou negativa', async () => {
    expect(has(await create({ capacity: 0 }), 'capacity')).toBe(true);
  });

  it('rejeita min_volunteers negativo', async () => {
    expect(has(await create({ min_volunteers: -1 }), 'min_volunteers')).toBe(true);
  });
});

describe('UpdateKidsRoomDto', () => {
  const upd = (payload: Record<string, unknown>) => validate(plainToInstance(UpdateKidsRoomDto, payload));

  it('aceita corpo vazio e qualquer subconjunto', async () => {
    expect(await upd({})).toHaveLength(0);
    expect(await upd({ is_active: true, min_age_months: 12 })).toHaveLength(0);
  });

  it('aceita capacity null (remove o limite)', async () => {
    expect(await upd({ capacity: null })).toHaveLength(0);
  });

  it('continua rejeitando valor inválido', async () => {
    expect(has(await upd({ min_age_months: -3 }), 'min_age_months')).toBe(true);
    expect(has(await upd({ capacity: 0 }), 'capacity')).toBe(true);
  });
});

describe('ListKidsRoomsQueryDto', () => {
  const q = (payload: Record<string, unknown>) => validate(plainToInstance(ListKidsRoomsQueryDto, payload));

  it('converte "true"/"false" da query string', async () => {
    expect(plainToInstance(ListKidsRoomsQueryDto, { include_inactive: 'true' }).include_inactive).toBe(true);
    expect(plainToInstance(ListKidsRoomsQueryDto, { include_inactive: 'false' }).include_inactive).toBe(false);
    expect(await q({ include_inactive: 'true' })).toHaveLength(0);
  });

  it('rejeita valor que não é booleano', async () => {
    expect(await q({ include_inactive: 'talvez' })).not.toHaveLength(0);
  });
});
