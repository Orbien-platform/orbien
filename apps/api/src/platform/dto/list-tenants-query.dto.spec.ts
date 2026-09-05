import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListTenantsQueryDto } from './list-tenants-query.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(ListTenantsQueryDto, payload);
  return validate(dto);
}

describe('ListTenantsQueryDto', () => {
  it('aceita payload vazio, com page e limit assumindo os defaults', async () => {
    const dto = plainToInstance(ListTenantsQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('aceita os filtros informados como viriam de query string', async () => {
    expect(await errorsFor({ search: 'doca', page: '2', limit: '50' })).toHaveLength(0);
  });

  // `@Type(() => Number)` é o que separa "2" (string, como chega da query
  // string) de 2. Sem ele o `@IsInt` reprovaria todo request paginado.
  it('converte page e limit de string para número', async () => {
    const dto = plainToInstance(ListTenantsQueryDto, { page: '3', limit: '75' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(75);
  });

  it('rejeita search que não é string', async () => {
    expect((await errorsFor({ search: 42 })).some((e) => e.property === 'search')).toBe(true);
  });

  it('rejeita page abaixo de 1', async () => {
    expect((await errorsFor({ page: '0' })).some((e) => e.property === 'page')).toBe(true);
  });

  // O teto de `page` é deliberado: page alto vira OFFSET profundo na única
  // rota que lê os N tenants. Ver o comentário no DTO.
  it('rejeita page acima de 100', async () => {
    expect((await errorsFor({ page: '101' })).some((e) => e.property === 'page')).toBe(true);
  });

  it('rejeita limit acima de 100', async () => {
    expect((await errorsFor({ limit: '101' })).some((e) => e.property === 'limit')).toBe(true);
  });

  it('rejeita limit fracionário', async () => {
    expect((await errorsFor({ limit: '10.5' })).some((e) => e.property === 'limit')).toBe(true);
  });
});
