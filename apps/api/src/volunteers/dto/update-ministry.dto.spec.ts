import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMinistryDto } from './update-ministry.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateMinistryDto, payload);
  return validate(dto);
}

describe('UpdateMinistryDto', () => {
  it('aceita payload vazio (todos os campos são opcionais)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita parent_ministry_id explicitamente null (promove a raiz)', async () => {
    expect(await errorsFor({ parent_ministry_id: null })).toHaveLength(0);
  });

  it('aceita parent_ministry_id como UUID válido', async () => {
    expect(
      await errorsFor({ parent_ministry_id: '11111111-1111-4111-8111-111111111111' }),
    ).toHaveLength(0);
  });

  it('rejeita parent_ministry_id que não é UUID nem null', async () => {
    const errors = await errorsFor({ parent_ministry_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'parent_ministry_id')).toBe(true);
  });

  it('rejeita name vazio quando informado', async () => {
    const errors = await errorsFor({ name: '' });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });
});
