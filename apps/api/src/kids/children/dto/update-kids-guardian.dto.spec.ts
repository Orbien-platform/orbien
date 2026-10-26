import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateKidsGuardianDto } from './update-kids-guardian.dto';

const run = (o: object) => validate(plainToInstance(UpdateKidsGuardianDto, o), { whitelist: true, forbidNonWhitelisted: true });

describe('UpdateKidsGuardianDto', () => {
  it('aceita qualquer subconjunto válido dos três campos', async () => {
    expect(await run({ can_pickup: false })).toHaveLength(0);
    expect(await run({ is_primary: true, relationship: 'avó' })).toHaveLength(0);
  });

  it.each([
    ['can_pickup não booleano', { can_pickup: 'sim' }],
    ['is_primary não booleano', { is_primary: 1 }],
    ['parentesco vazio', { relationship: '' }],
    ['parentesco gigante', { relationship: 'x'.repeat(61) }],
    ['campo fora do contrato (trocar a pessoa)', { guardian_person_id: 'x' }],
  ])('recusa %s', async (_label, body) => {
    expect((await run(body)).length).toBeGreaterThan(0);
  });
});
