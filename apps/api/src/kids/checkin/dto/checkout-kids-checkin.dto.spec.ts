import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CheckoutKidsCheckinDto } from './checkout-kids-checkin.dto';
import { CheckoutOverrideKidsCheckinDto } from './checkout-override-kids-checkin.dto';

const U1 = '11111111-1111-4111-8111-111111111111';
const run = (cls: new () => object, o: object) => validate(plainToInstance(cls, o), { whitelist: true, forbidNonWhitelisted: true });

describe('CheckoutKidsCheckinDto', () => {
  it('aceita código com a pessoa por id ou por nome', async () => {
    expect(await run(CheckoutKidsCheckinDto, { code: 'A2B3', picked_up_by_person_id: U1 })).toHaveLength(0);
    expect(await run(CheckoutKidsCheckinDto, { code: 'A2B3', picked_up_by_name: 'Maria' })).toHaveLength(0);
  });

  it('R3-1: aceita o QR no lugar do código (por id ou por nome)', async () => {
    expect(await run(CheckoutKidsCheckinDto, { qr: 'kidsco1.k.A2B3.sig', picked_up_by_person_id: U1 })).toHaveLength(0);
    expect(await run(CheckoutKidsCheckinDto, { qr: 'qualquer-coisa', picked_up_by_name: 'Maria' })).toHaveLength(0);
  });

  it('código de formato errado passa na validação (vira 403 genérico no serviço, não 400)', async () => {
    expect(await run(CheckoutKidsCheckinDto, { code: 'x', picked_up_by_name: 'Maria' })).toHaveLength(0);
  });

  it.each([
    ['sem código nem QR', { picked_up_by_name: 'Maria' }],
    ['QR vazio', { qr: '', picked_up_by_name: 'Maria' }],
    ['QR gigante', { qr: 'k'.repeat(201), picked_up_by_name: 'Maria' }],
    ['código vazio', { code: '', picked_up_by_name: 'Maria' }],
    ['código gigante', { code: 'A'.repeat(17) }],
    ['id que não é UUID', { code: 'A2B3', picked_up_by_person_id: 'x' }],
    ['nome vazio', { code: 'A2B3', picked_up_by_name: '   ' }],
    ['nome que não é texto', { code: 'A2B3', picked_up_by_name: 42 }],
    ['campo desconhecido (quem fecha vem do token)', { code: 'A2B3', checked_out_by: 'u' }],
  ])('400 com %s', async (_l, body) => {
    expect((await run(CheckoutKidsCheckinDto, body)).length).toBeGreaterThan(0);
  });
});

describe('CheckoutOverrideKidsCheckinDto', () => {
  it('aceita motivo e nome', async () => {
    expect(await run(CheckoutOverrideKidsCheckinDto, { reason: 'Perdeu a etiqueta; conferi o RG', picked_up_by_name: 'Maria Souza' })).toHaveLength(0);
  });

  it.each([
    ['sem motivo (AC 8)', { picked_up_by_name: 'Maria' }],
    ['motivo em branco', { reason: '     ', picked_up_by_name: 'Maria' }],
    ['motivo curto demais', { reason: 'ok', picked_up_by_name: 'Maria' }],
    ['sem nome de quem retira', { reason: 'Perdeu a etiqueta' }],
    ['nome em branco', { reason: 'Perdeu a etiqueta', picked_up_by_name: '  ' }],
    ['motivo que não é texto', { reason: 12345678, picked_up_by_name: 'Maria' }],
    ['nome que não é texto', { reason: 'Perdeu a etiqueta', picked_up_by_name: 42 }],
  ])('400 %s', async (_l, body) => {
    expect((await run(CheckoutOverrideKidsCheckinDto, body)).length).toBeGreaterThan(0);
  });
});
