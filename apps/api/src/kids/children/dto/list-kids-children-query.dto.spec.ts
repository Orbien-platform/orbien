import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListKidsChildrenQueryDto } from './list-kids-children-query.dto';

const run = (o: object) => {
  const dto = plainToInstance(ListKidsChildrenQueryDto, o);
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true }).then((errors) => ({ errors, dto }));
};

describe('ListKidsChildrenQueryDto', () => {
  it('sem filtros é válido', async () => {
    expect((await run({})).errors).toHaveLength(0);
  });

  it('limit chega como texto na query e vira número', async () => {
    const { errors, dto } = await run({ search: 'ana', limit: '25' });
    expect(errors).toHaveLength(0);
    expect(dto.limit).toBe(25);
  });

  it.each([
    ['limit zero', { limit: '0' }],
    ['limit acima de 100', { limit: '101' }],
    ['limit que não é número', { limit: 'muitos' }],
    ['limit fracionário', { limit: '1.5' }],
    ['busca gigante', { search: 'a'.repeat(101) }],
  ])('400 com %s', async (_l, body) => {
    expect((await run(body)).errors.length).toBeGreaterThan(0);
  });
});
