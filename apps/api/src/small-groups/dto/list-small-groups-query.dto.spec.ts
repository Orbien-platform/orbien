import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListSmallGroupsQueryDto } from './list-small-groups-query.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(ListSmallGroupsQueryDto, payload);
  return validate(dto);
}

describe('ListSmallGroupsQueryDto', () => {
  it('aceita payload vazio, com page e limit assumindo os defaults', async () => {
    const dto = plainToInstance(ListSmallGroupsQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('aceita todos os filtros informados como viriam de query string', async () => {
    expect(
      await errorsFor({
        group_type_id: '11111111-1111-4111-8111-111111111111',
        is_public: 'true',
        search: 'Célula',
        page: '2',
        limit: '50',
      }),
    ).toHaveLength(0);
  });

  it('converte is_public "false" (string) em boolean', async () => {
    const dto = plainToInstance(ListSmallGroupsQueryDto, { is_public: 'false' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.is_public).toBe(false);
  });

  it('rejeita group_type_id que não é UUID', async () => {
    const errors = await errorsFor({ group_type_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'group_type_id')).toBe(true);
  });

  it('rejeita is_public com valor que não é boolean nem "true"/"false"', async () => {
    const errors = await errorsFor({ is_public: 'talvez' });
    expect(errors.some((e) => e.property === 'is_public')).toBe(true);
  });

  it('rejeita page abaixo de 1', async () => {
    const errors = await errorsFor({ page: '0' });
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('rejeita limit acima de 100', async () => {
    const errors = await errorsFor({ limit: '101' });
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });
});
