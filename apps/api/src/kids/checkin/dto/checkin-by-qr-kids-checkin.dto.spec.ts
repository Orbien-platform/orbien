import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CheckinByQrKidsCheckinDto } from './checkin-by-qr-kids-checkin.dto';

const check = (o: object) => validate(plainToInstance(CheckinByQrKidsCheckinDto, o), { whitelist: true, forbidNonWhitelisted: true });

describe('CheckinByQrKidsCheckinDto (R3-1)', () => {
  it('aceita o QR e a confirmação de fora da faixa', async () => {
    expect(await check({ qr: 'kidsci1.x.y' })).toHaveLength(0);
    expect(await check({ qr: 'qualquer-formato', confirm_out_of_range: true })).toHaveLength(0);
  });

  it.each([
    ['sem qr', {}],
    ['qr vazio', { qr: '' }],
    ['qr gigante', { qr: 'k'.repeat(201) }],
    ['criança vinda do corpo (vem do QR)', { qr: 'x', child_id: 'c' }],
    ['responsável vindo do corpo (vem do QR)', { qr: 'x', guardian_person_id: 'g' }],
    ['confirmação que não é booleano', { qr: 'x', confirm_out_of_range: 'sim' }],
  ])('recusa %s', async (_l, body) => {
    expect((await check(body)).length).toBeGreaterThan(0);
  });
});
