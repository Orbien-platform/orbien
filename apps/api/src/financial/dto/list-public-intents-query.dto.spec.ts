import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListPublicIntentsQueryDto } from './list-public-intents-query.dto';

async function check(payload: Record<string, unknown>) {
  const dto = plainToInstance(ListPublicIntentsQueryDto, payload);
  return { dto, errors: await validate(dto) };
}

describe('ListPublicIntentsQueryDto', () => {
  it('sem parâmetros: página 1, 20 por página, sem filtro de estado', async () => {
    const { dto, errors } = await check({});

    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 1, page_size: 20 });
    expect(dto.status).toBeUndefined();
  });

  it('converte os números da query string', async () => {
    const { dto, errors } = await check({ page: '3', page_size: '50' });

    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 3, page_size: 50 });
  });

  it.each(['pending', 'confirmed', 'failed'])('aceita o estado %s', async (status) => {
    expect((await check({ status })).errors).toHaveLength(0);
  });

  it.each([
    ['estado desconhecido', { status: 'paid' }],
    ['página zero', { page: '0' }],
    ['página_size zero', { page_size: '0' }],
    ['page_size acima de 100', { page_size: '101' }],
    ['página não numérica', { page: 'a' }],
  ])('rejeita %s', async (_nome, payload) => {
    expect((await check(payload)).errors.length).toBeGreaterThan(0);
  });
});
