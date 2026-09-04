import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListStudyMaterialsQueryDto } from './list-study-materials-query.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(ListStudyMaterialsQueryDto, payload);
  return validate(dto);
}

describe('ListStudyMaterialsQueryDto', () => {
  it('aceita objeto vazio, com page e limit default', async () => {
    const dto = plainToInstance(ListStudyMaterialsQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('aceita todos os filtros preenchidos', async () => {
    expect(
      await errorsFor({ status: 'published', search: 'estudo', page: '2', limit: '10' }),
    ).toHaveLength(0);
  });

  it('rejeita status inválido', async () => {
    const errors = await errorsFor({ status: 'nao-existe' });
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('rejeita search que não é string', async () => {
    const errors = await errorsFor({ search: 42 });
    expect(errors.some((e) => e.property === 'search')).toBe(true);
  });

  it('rejeita page menor que 1', async () => {
    const errors = await errorsFor({ page: '0' });
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('rejeita limit maior que 100', async () => {
    const errors = await errorsFor({ limit: '101' });
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });
});
