import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchKidsGuardiansQueryDto } from './search-kids-guardians-query.dto';

const run = async (o: object) => {
  const dto = plainToInstance(SearchKidsGuardiansQueryDto, o);
  return { errors: await validate(dto, { whitelist: true, forbidNonWhitelisted: true }), dto };
};

describe('SearchKidsGuardiansQueryDto', () => {
  it('aceita nome ou telefone e apara os espaços', async () => {
    const { errors, dto } = await run({ q: '  Maria  ' });
    expect(errors).toHaveLength(0);
    expect(dto.q).toBe('Maria');
  });

  it('busca de 1 letra (depois de aparar) é recusada: devolveria a congregação inteira', async () => {
    expect((await run({ q: ' a ' })).errors.length).toBeGreaterThan(0);
    expect((await run({ q: 'a' })).errors.length).toBeGreaterThan(0);
  });

  it.each([
    ['q ausente', {}],
    ['q que não é texto', { q: 12345 }],
    ['q gigante', { q: 'a'.repeat(101) }],
  ])('400 com %s', async (_l, body) => {
    expect((await run(body)).errors.length).toBeGreaterThan(0);
  });
});
