import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AcceptVolunteerTermDto, UpdateMyVolunteerProfileDto } from './update-my-volunteer-profile.dto';

// Mesmas opções do ValidationPipe global (main.ts).
const check = (cls: new () => object, o: object) =>
  validate(plainToInstance(cls, o), { whitelist: true, forbidNonWhitelisted: true });

describe('UpdateMyVolunteerProfileDto', () => {
  it('aceita só availability', async () => {
    expect(await check(UpdateMyVolunteerProfileDto, { availability: { sunday: ['morning', 'evening'] } })).toHaveLength(0);
    expect(await check(UpdateMyVolunteerProfileDto, { availability: {} })).toHaveLength(0);
  });

  it.each([
    ['skills', { skills: ['OBS'] }],
    ['restrictions', { restrictions: 'x' }],
    ['person_id', { person_id: '9b8d5f04-1c1e-4c5e-9d0e-2b7e5d1f0a11' }],
  ])('habilidade/outro campo (%s) enviado é recusado', async (_n, extra) => {
    const errors = await check(UpdateMyVolunteerProfileDto, { availability: {}, ...extra });
    expect(errors).toHaveLength(1);
    expect(JSON.stringify(errors[0].constraints)).toContain('should not exist');
  });

  it('exige availability e recusa dia ou turno inválido', async () => {
    expect(await check(UpdateMyVolunteerProfileDto, {})).not.toHaveLength(0);
    expect(await check(UpdateMyVolunteerProfileDto, { availability: { someday: ['morning'] } })).not.toHaveLength(0);
    expect(await check(UpdateMyVolunteerProfileDto, { availability: { sunday: ['night'] } })).not.toHaveLength(0);
  });
});

describe('AcceptVolunteerTermDto', () => {
  it('exige a versão do termo', async () => {
    expect(await check(AcceptVolunteerTermDto, { term_version: 'volunteer_term_v1' })).toHaveLength(0);
    expect(await check(AcceptVolunteerTermDto, { term_version: '' })).not.toHaveLength(0);
    expect(await check(AcceptVolunteerTermDto, {})).not.toHaveLength(0);
  });
});
