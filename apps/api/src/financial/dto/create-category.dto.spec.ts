import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCategoryDto } from './create-category.dto';

const BASE = { name: 'Dízimos', type: 'income' };

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateCategoryDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateCategoryDto', () => {
  it('aceita name e type válidos, sem os opcionais', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita name vazio', async () => {
    const errors = await errorsFor({ name: '' });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejeita name ausente', async () => {
    const dto = plainToInstance(CreateCategoryDto, { type: 'income' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejeita type fora do enum', async () => {
    const errors = await errorsFor({ type: 'transfer' });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('aceita type expense', async () => {
    expect(await errorsFor({ type: 'expense' })).toHaveLength(0);
  });

  it('aceita parent_id UUID válido', async () => {
    expect(await errorsFor({ parent_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })).toHaveLength(0);
  });

  it('rejeita parent_id que não é UUID', async () => {
    const errors = await errorsFor({ parent_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'parent_id')).toBe(true);
  });

  it('aceita description como string', async () => {
    expect(await errorsFor({ description: 'Categoria de teste' })).toHaveLength(0);
  });

  it('rejeita description que não é string', async () => {
    const errors = await errorsFor({ description: 123 });
    expect(errors.some((e) => e.property === 'description')).toBe(true);
  });
});
