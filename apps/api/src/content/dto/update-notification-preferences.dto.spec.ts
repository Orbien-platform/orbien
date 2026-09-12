import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateNotificationPreferencesDto } from './update-notification-preferences.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateNotificationPreferencesDto, payload);
  return validate(dto);
}

describe('UpdateNotificationPreferencesDto', () => {
  it('aceita objeto vazio (todos os 4 campos são opcionais)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita atualização parcial de uma única categoria', async () => {
    expect(await errorsFor({ oracao: false })).toHaveLength(0);
  });

  it('aceita as 4 categorias juntas', async () => {
    expect(
      await errorsFor({ avisos: false, oracao: false, eventos: true, devocional: true }),
    ).toHaveLength(0);
  });

  it('rejeita campo não-boolean, gerando o erro que o ValidationPipe global transforma em 400', async () => {
    const errors = await errorsFor({ avisos: 'sim' });
    expect(errors.some((e) => e.property === 'avisos')).toBe(true);
  });
});
