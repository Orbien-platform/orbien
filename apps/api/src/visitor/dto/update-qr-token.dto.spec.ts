import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateQrTokenDto } from './update-qr-token.dto';

describe('UpdateQrTokenDto', () => {
  it('aceita objeto vazio — todos os campos são opcionais', async () => {
    const dto = plainToInstance(UpdateQrTokenDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('aceita label como string', async () => {
    const dto = plainToInstance(UpdateQrTokenDto, { label: 'Novo rótulo' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita label que não é string', async () => {
    const dto = plainToInstance(UpdateQrTokenDto, { label: 123 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'label')).toBe(true);
  });

  it('aceita is_active booleano', async () => {
    const dto = plainToInstance(UpdateQrTokenDto, { is_active: true });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita is_active que não é booleano', async () => {
    const dto = plainToInstance(UpdateQrTokenDto, { is_active: 'sim' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'is_active')).toBe(true);
  });
});
