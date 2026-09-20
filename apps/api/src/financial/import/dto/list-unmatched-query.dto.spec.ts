import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListUnmatchedQueryDto } from './list-unmatched-query.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(ListUnmatchedQueryDto, payload);
  return { dto, errors: await validate(dto) };
}

describe('ListUnmatchedQueryDto', () => {
  it('aceita vazio e aplica os defaults de paginação', async () => {
    const { dto, errors } = await errorsFor({});
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('aceita import_job_id UUID válido', async () => {
    const { errors } = await errorsFor({ import_job_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' });
    expect(errors).toHaveLength(0);
  });

  it('rejeita import_job_id que não é UUID', async () => {
    const { errors } = await errorsFor({ import_job_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'import_job_id')).toBe(true);
  });

  it('aceita page dentro do limite', async () => {
    const { errors } = await errorsFor({ page: 2 });
    expect(errors).toHaveLength(0);
  });

  it('rejeita page menor que 1', async () => {
    const { errors } = await errorsFor({ page: 0 });
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('aceita limit dentro do intervalo', async () => {
    const { errors } = await errorsFor({ limit: 50 });
    expect(errors).toHaveLength(0);
  });

  it('rejeita limit menor que 1', async () => {
    const { errors } = await errorsFor({ limit: 0 });
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('rejeita limit maior que 100', async () => {
    const { errors } = await errorsFor({ limit: 101 });
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });
});
