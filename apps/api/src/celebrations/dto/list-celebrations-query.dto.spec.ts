import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListCelebrationsQueryDto } from './list-celebrations-query.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(ListCelebrationsQueryDto, payload);
  return validate(dto);
}

describe('ListCelebrationsQueryDto', () => {
  it('aceita objeto vazio', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita type fora do enum', async () => {
    const errors = await errorsFor({ type: 'invalido' });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('transforma is_active "true" (string) em booleano true', async () => {
    const dto = plainToInstance(ListCelebrationsQueryDto, { is_active: 'true' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.is_active).toBe(true);
  });

  it('transforma is_active boolean true em true', async () => {
    const dto = plainToInstance(ListCelebrationsQueryDto, { is_active: true });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.is_active).toBe(true);
  });

  it('transforma is_active "false" (string) em booleano false', async () => {
    const dto = plainToInstance(ListCelebrationsQueryDto, { is_active: 'false' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.is_active).toBe(false);
  });
});
