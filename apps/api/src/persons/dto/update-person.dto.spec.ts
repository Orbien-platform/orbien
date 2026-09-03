import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePersonDto } from './update-person.dto';

describe('UpdatePersonDto', () => {
  it('aceita objeto vazio — todos os campos herdados viram opcionais', async () => {
    const dto = plainToInstance(UpdatePersonDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('aceita classification member sem membership_date (override remove o ValidateIf herdado)', async () => {
    const dto = plainToInstance(UpdatePersonDto, { classification: 'member' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('aceita membership_date válida junto de classification member', async () => {
    const dto = plainToInstance(UpdatePersonDto, {
      classification: 'member',
      membership_date: '2026-01-01',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita membership_date que não é uma data ISO válida', async () => {
    const dto = plainToInstance(UpdatePersonDto, { membership_date: 'não é data' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'membership_date')).toBe(true);
  });

  it('rejeita email inválido herdado do CreatePersonDto', async () => {
    const dto = plainToInstance(UpdatePersonDto, { email: 'não-é-email' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });
});
