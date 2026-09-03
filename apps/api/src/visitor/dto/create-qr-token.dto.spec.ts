import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateQrTokenDto } from './create-qr-token.dto';

describe('CreateQrTokenDto', () => {
  it('aceita apenas origin (todo o resto é opcional)', async () => {
    const dto = plainToInstance(CreateQrTokenDto, { origin: 'service' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita origin fora do enum', async () => {
    const dto = plainToInstance(CreateQrTokenDto, { origin: 'inválido' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'origin')).toBe(true);
  });

  it('aceita small_group_id UUID válido', async () => {
    const dto = plainToInstance(CreateQrTokenDto, {
      origin: 'small_group',
      small_group_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita small_group_id que não é UUID', async () => {
    const dto = plainToInstance(CreateQrTokenDto, { origin: 'service', small_group_id: 'nope' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'small_group_id')).toBe(true);
  });

  it('aceita label como string', async () => {
    const dto = plainToInstance(CreateQrTokenDto, { origin: 'service', label: 'Entrada principal' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita label que não é string', async () => {
    const dto = plainToInstance(CreateQrTokenDto, { origin: 'service', label: 123 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'label')).toBe(true);
  });

  it('aceita is_active booleano', async () => {
    const dto = plainToInstance(CreateQrTokenDto, { origin: 'service', is_active: false });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita is_active que não é booleano', async () => {
    const dto = plainToInstance(CreateQrTokenDto, { origin: 'service', is_active: 'sim' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'is_active')).toBe(true);
  });
});
