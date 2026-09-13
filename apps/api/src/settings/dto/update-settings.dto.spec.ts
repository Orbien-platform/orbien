import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSettingsDto } from './update-settings.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateSettingsDto, payload);
  return validate(dto);
}

describe('UpdateSettingsDto', () => {
  it('aceita objeto vazio (tenant e congregation são opcionais)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita tenant e congregation preenchidos', async () => {
    expect(
      await errorsFor({
        tenant: { name: 'Igreja', email: 'contato@igreja.com', phone: '11999999999' },
        congregation: {
          name: 'Sede',
          address: 'Rua 1',
          timezone: 'America/Sao_Paulo',
          email: 'sede@igreja.com',
          phone: '11888888888',
          app_name: 'Igreja App',
          primary_color: '#1E3A7B',
        },
      }),
    ).toHaveLength(0);
  });

  it('rejeita tenant.email inválido', async () => {
    const errors = await errorsFor({ tenant: { email: 'não-é-email' } });
    expect(errors.some((e) => e.property === 'tenant')).toBe(true);
  });

  it('rejeita congregation.email inválido', async () => {
    const errors = await errorsFor({ congregation: { email: 'não-é-email' } });
    expect(errors.some((e) => e.property === 'congregation')).toBe(true);
  });

  it('rejeita tenant.name que não é string', async () => {
    const errors = await errorsFor({ tenant: { name: 42 } });
    expect(errors.some((e) => e.property === 'tenant')).toBe(true);
  });

  // PROD-19 — domínio próprio e termos de uso.
  it('aceita branding com custom_domain e terms_url válidos', async () => {
    expect(
      await errorsFor({
        branding: {
          custom_domain: 'doar.suaigreja.com.br',
          terms_url: 'https://suaigreja.com.br/termos',
        },
      }),
    ).toHaveLength(0);
  });

  it('rejeita custom_domain com formato de hostname inválido', async () => {
    const errors = await errorsFor({ branding: { custom_domain: 'não é um domínio' } });
    expect(errors.some((e) => e.property === 'branding')).toBe(true);
  });

  it('rejeita terms_url sem protocolo', async () => {
    const errors = await errorsFor({ branding: { terms_url: 'suaigreja.com.br/termos' } });
    expect(errors.some((e) => e.property === 'branding')).toBe(true);
  });
});
