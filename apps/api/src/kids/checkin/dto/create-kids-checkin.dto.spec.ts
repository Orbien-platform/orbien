import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateKidsCheckinDto } from './create-kids-checkin.dto';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const check = (o: object) => validate(plainToInstance(CreateKidsCheckinDto, o), { whitelist: true, forbidNonWhitelisted: true });

describe('CreateKidsCheckinDto', () => {
  it('aceita criança e responsável que entrega', async () => {
    expect(await check({ child_id: U1, guardian_person_id: U2 })).toHaveLength(0);
    expect(await check({ child_id: U1, guardian_person_id: U2, confirm_out_of_range: true })).toHaveLength(0);
  });

  it.each([
    ['sem responsável que entrega (AC 1b)', { child_id: U1 }],
    ['sem criança', { guardian_person_id: U2 }],
    ['responsável que não é UUID', { child_id: U1, guardian_person_id: 'x' }],
    ['confirmação que não é booleano', { child_id: U1, guardian_person_id: U2, confirm_out_of_range: 'sim' }],
    ['quem recebe vindo do corpo (vem do token)', { child_id: U1, guardian_person_id: U2, checked_in_by: 'u' }],
    ['código vindo do corpo (o servidor gera)', { child_id: U1, guardian_person_id: U2, code: 'ABCD' }],
  ])('recusa %s', async (_l, body) => {
    expect((await check(body)).length).toBeGreaterThan(0);
  });
});
