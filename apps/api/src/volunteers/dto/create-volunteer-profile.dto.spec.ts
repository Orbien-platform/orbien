import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateVolunteerProfileDto } from './create-volunteer-profile.dto';

const BASE = {
  person_id: '11111111-1111-4111-8111-111111111111',
  availability: { sunday: ['morning'] },
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateVolunteerProfileDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateVolunteerProfileDto', () => {
  it('aceita os campos obrigatórios', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita skills e restrictions opcionais', async () => {
    expect(
      await errorsFor({ skills: ['som', 'iluminação'], restrictions: 'Não pode em domingos à noite' }),
    ).toHaveLength(0);
  });

  it('rejeita person_id que não é UUID', async () => {
    const errors = await errorsFor({ person_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'person_id')).toBe(true);
  });

  it('rejeita availability ausente', async () => {
    const errors = await errorsFor({ availability: undefined });
    expect(errors.some((e) => e.property === 'availability')).toBe(true);
  });

  it('rejeita slot fora do enum permitido em availability', async () => {
    const errors = await errorsFor({ availability: { sunday: ['madrugada'] } });
    expect(errors.some((e) => e.property === 'availability')).toBe(true);
  });

  it('rejeita skills que não é array de strings', async () => {
    const errors = await errorsFor({ skills: [123] });
    expect(errors.some((e) => e.property === 'skills')).toBe(true);
  });
});
