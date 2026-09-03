import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListWaitlistQueryDto } from './list-waitlist-query.dto';

describe('ListWaitlistQueryDto', () => {
  it('aplica os defaults de page e limit quando ausentes', async () => {
    const dto = plainToInstance(ListWaitlistQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('aceita status, size_range e source válidos', async () => {
    const dto = plainToInstance(ListWaitlistQueryDto, {
      status: 'contacted',
      size_range: 'ate_150',
      source: 'landing',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita status fora do enum', async () => {
    const dto = plainToInstance(ListWaitlistQueryDto, { status: 'inválido' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('rejeita size_range fora do enum', async () => {
    const dto = plainToInstance(ListWaitlistQueryDto, { size_range: 'gigante' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'size_range')).toBe(true);
  });

  it('rejeita source que não é string', async () => {
    const dto = plainToInstance(ListWaitlistQueryDto, { source: 123 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'source')).toBe(true);
  });

  it('rejeita page menor que 1', async () => {
    const dto = plainToInstance(ListWaitlistQueryDto, { page: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('rejeita limit menor que 1', async () => {
    const dto = plainToInstance(ListWaitlistQueryDto, { limit: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });
});
