import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateWaitlistDto } from './create-waitlist.dto';

const BASE = { email: 'pastor@igreja.test', pastor_name: 'Pastor João', size_range: 'ate_150', lgpd_consent: true };

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateWaitlistDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateWaitlistDto', () => {
  it('aceita os campos obrigatórios mínimos', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita email inválido', async () => {
    const errors = await errorsFor({ email: 'não-é-email' });
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejeita pastor_name com menos de 2 caracteres', async () => {
    const errors = await errorsFor({ pastor_name: 'J' });
    expect(errors.some((e) => e.property === 'pastor_name')).toBe(true);
  });

  it('aceita church_name como string', async () => {
    expect(await errorsFor({ church_name: 'Igreja Teste' })).toHaveLength(0);
  });

  it('rejeita church_name que não é string', async () => {
    const errors = await errorsFor({ church_name: 123 });
    expect(errors.some((e) => e.property === 'church_name')).toBe(true);
  });

  it('aceita city como string', async () => {
    expect(await errorsFor({ city: 'São Paulo' })).toHaveLength(0);
  });

  it('rejeita city que não é string', async () => {
    const errors = await errorsFor({ city: 123 });
    expect(errors.some((e) => e.property === 'city')).toBe(true);
  });

  it('aceita state ausente (ValidateIf só entra quando o campo é informado)', async () => {
    expect(await errorsFor({ state: undefined })).toHaveLength(0);
  });

  it('aceita state com exatamente 2 caracteres', async () => {
    expect(await errorsFor({ state: 'SP' })).toHaveLength(0);
  });

  it('rejeita state com tamanho diferente de 2 quando informado', async () => {
    const errors = await errorsFor({ state: 'São Paulo' });
    expect(errors.some((e) => e.property === 'state')).toBe(true);
  });

  it('rejeita size_range fora do enum', async () => {
    const errors = await errorsFor({ size_range: 'gigante' });
    expect(errors.some((e) => e.property === 'size_range')).toBe(true);
  });

  it('rejeita lgpd_consent falso — é obrigatório aceitar os termos', async () => {
    const errors = await errorsFor({ lgpd_consent: false });
    expect(errors.some((e) => e.property === 'lgpd_consent')).toBe(true);
  });

  it('aceita source como string', async () => {
    expect(await errorsFor({ source: 'landing' })).toHaveLength(0);
  });

  it('rejeita source que não é string', async () => {
    const errors = await errorsFor({ source: 123 });
    expect(errors.some((e) => e.property === 'source')).toBe(true);
  });

  it('aceita utm_source como string', async () => {
    expect(await errorsFor({ utm_source: 'google' })).toHaveLength(0);
  });

  it('rejeita utm_source que não é string', async () => {
    const errors = await errorsFor({ utm_source: 123 });
    expect(errors.some((e) => e.property === 'utm_source')).toBe(true);
  });

  it('aceita utm_medium como string', async () => {
    expect(await errorsFor({ utm_medium: 'cpc' })).toHaveLength(0);
  });

  it('rejeita utm_medium que não é string', async () => {
    const errors = await errorsFor({ utm_medium: 123 });
    expect(errors.some((e) => e.property === 'utm_medium')).toBe(true);
  });

  it('aceita utm_campaign como string', async () => {
    expect(await errorsFor({ utm_campaign: 'lancamento' })).toHaveLength(0);
  });

  it('rejeita utm_campaign que não é string', async () => {
    const errors = await errorsFor({ utm_campaign: 123 });
    expect(errors.some((e) => e.property === 'utm_campaign')).toBe(true);
  });
});
