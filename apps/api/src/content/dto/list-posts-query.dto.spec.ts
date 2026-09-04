import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListPostsQueryDto } from './list-posts-query.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(ListPostsQueryDto, payload);
  return validate(dto);
}

describe('ListPostsQueryDto', () => {
  it('aceita objeto vazio, com page e limit default', async () => {
    const dto = plainToInstance(ListPostsQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('aceita todos os filtros preenchidos', async () => {
    expect(
      await errorsFor({
        type: 'sermon_video',
        is_draft: 'true',
        since: '2026-01-01T00:00:00.000Z',
        page: '2',
        limit: '10',
      }),
    ).toHaveLength(0);
  });

  it('transforma is_draft string "true" em booleano', async () => {
    const dto = plainToInstance(ListPostsQueryDto, { is_draft: 'true' });
    expect(dto.is_draft).toBe(true);
  });

  it('mantém is_draft booleano true como true', async () => {
    const dto = plainToInstance(ListPostsQueryDto, { is_draft: true });
    expect(dto.is_draft).toBe(true);
  });

  it('transforma qualquer outro valor de is_draft em false', async () => {
    const dto = plainToInstance(ListPostsQueryDto, { is_draft: 'false' });
    expect(dto.is_draft).toBe(false);
  });

  it('rejeita type inválido', async () => {
    const errors = await errorsFor({ type: 'nao-existe' });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('rejeita since que não é ISO8601', async () => {
    const errors = await errorsFor({ since: 'ontem' });
    expect(errors.some((e) => e.property === 'since')).toBe(true);
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
