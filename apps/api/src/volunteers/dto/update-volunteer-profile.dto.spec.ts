import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateVolunteerProfileDto } from './update-volunteer-profile.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateVolunteerProfileDto, payload);
  return validate(dto);
}

describe('UpdateVolunteerProfileDto', () => {
  it('aceita payload vazio (todos os campos são opcionais)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita availability parcial válida', async () => {
    expect(await errorsFor({ availability: { monday: ['evening'] } })).toHaveLength(0);
  });

  it('rejeita person_id que não é UUID quando informado', async () => {
    const errors = await errorsFor({ person_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'person_id')).toBe(true);
  });

  it('rejeita slot fora do enum em availability', async () => {
    const errors = await errorsFor({ availability: { monday: ['madrugada'] } });
    expect(errors.some((e) => e.property === 'availability')).toBe(true);
  });
});
