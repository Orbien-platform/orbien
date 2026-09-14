import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateVisitRequestDto } from './create-visit-request.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateVisitRequestDto, payload);
  return validate(dto);
}

const VALID = { tenant_slug: 'central', visitor_name: 'Maria Silva', visitor_phone: '11999990000' };

describe('CreateVisitRequestDto', () => {
  it('aceita slug, nome e telefone', async () => {
    expect(await errorsFor(VALID)).toHaveLength(0);
  });

  it('aceita slug, nome e e-mail', async () => {
    expect(
      await errorsFor({
        tenant_slug: 'central',
        visitor_name: 'Maria',
        visitor_email: 'maria@exemplo.com',
      }),
    ).toHaveLength(0);
  });

  it('aceita mensagem e honeypot — o honeypot precisa passar pelo whitelist global', async () => {
    expect(
      await errorsFor({ ...VALID, message: 'posso levar meu filho?', website: '' }),
    ).toHaveLength(0);
  });

  it('rejeita slug ausente', async () => {
    const errors = await errorsFor({ visitor_name: 'Maria', visitor_phone: '11999990000' });
    expect(errors.some((e) => e.property === 'tenant_slug')).toBe(true);
  });

  it('rejeita nome de uma letra só', async () => {
    const errors = await errorsFor({ ...VALID, visitor_name: 'M' });
    expect(errors.some((e) => e.property === 'visitor_name')).toBe(true);
  });

  it('rejeita e-mail inválido', async () => {
    const errors = await errorsFor({ ...VALID, visitor_email: 'nao-e-email' });
    expect(errors.some((e) => e.property === 'visitor_email')).toBe(true);
  });

  it('rejeita mensagem acima de 500 caracteres', async () => {
    const errors = await errorsFor({ ...VALID, message: 'a'.repeat(501) });
    expect(errors.some((e) => e.property === 'message')).toBe(true);
  });

  // A exigência de "ao menos um contato" é do serviço, não do DTO: aqui os
  // dois campos são opcionais de propósito, e o teste registra isso para a
  // regra não ser reescrita em dois lugares.
  it('passa na validação sem nenhum contato — quem barra isso é o serviço', async () => {
    expect(await errorsFor({ tenant_slug: 'central', visitor_name: 'Maria' })).toHaveLength(0);
  });
});
