import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateWaitlistDto } from './update-waitlist.dto';

describe('UpdateWaitlistDto', () => {
  it('aceita objeto vazio — todos os campos são opcionais', async () => {
    const dto = plainToInstance(UpdateWaitlistDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('aceita status válido', async () => {
    const dto = plainToInstance(UpdateWaitlistDto, { status: 'activated' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita status fora do enum', async () => {
    const dto = plainToInstance(UpdateWaitlistDto, { status: 'inválido' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('aceita notes como string', async () => {
    const dto = plainToInstance(UpdateWaitlistDto, { notes: 'observação' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita notes que não é string', async () => {
    const dto = plainToInstance(UpdateWaitlistDto, { notes: 123 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'notes')).toBe(true);
  });

  it('aceita contacted_at como data ISO', async () => {
    const dto = plainToInstance(UpdateWaitlistDto, { contacted_at: '2026-01-01T00:00:00Z' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita contacted_at que não é data ISO', async () => {
    const dto = plainToInstance(UpdateWaitlistDto, { contacted_at: 'não é data' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'contacted_at')).toBe(true);
  });

  it('aceita activated_at como data ISO', async () => {
    const dto = plainToInstance(UpdateWaitlistDto, { activated_at: '2026-02-01T00:00:00Z' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita activated_at que não é data ISO', async () => {
    const dto = plainToInstance(UpdateWaitlistDto, { activated_at: 'não é data' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'activated_at')).toBe(true);
  });

  it('aceita tenant_id como string', async () => {
    const dto = plainToInstance(UpdateWaitlistDto, { tenant_id: 'tenant-1' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita tenant_id que não é string', async () => {
    const dto = plainToInstance(UpdateWaitlistDto, { tenant_id: 123 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'tenant_id')).toBe(true);
  });
});
