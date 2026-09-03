import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListPersonsQueryDto } from './list-persons-query.dto';

describe('ListPersonsQueryDto', () => {
  it('aplica os defaults de page e limit quando ausentes', async () => {
    const dto = plainToInstance(ListPersonsQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('aceita todos os filtros válidos', async () => {
    const dto = plainToInstance(ListPersonsQueryDto, {
      classification: 'member',
      gender: 'female',
      tag: 'jovens',
      search: 'ana',
      page: '2',
      limit: '50',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
  });

  it('rejeita classification fora do enum', async () => {
    const dto = plainToInstance(ListPersonsQueryDto, { classification: 'invalida' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'classification')).toBe(true);
  });

  it('rejeita gender fora do enum', async () => {
    const dto = plainToInstance(ListPersonsQueryDto, { gender: 'invalido' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'gender')).toBe(true);
  });

  it('rejeita page menor que 1', async () => {
    const dto = plainToInstance(ListPersonsQueryDto, { page: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('rejeita limit maior que 100', async () => {
    const dto = plainToInstance(ListPersonsQueryDto, { limit: 101 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });
});
