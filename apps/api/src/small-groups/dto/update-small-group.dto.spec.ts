import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSmallGroupDto } from './update-small-group.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateSmallGroupDto, payload);
  return validate(dto);
}

describe('UpdateSmallGroupDto', () => {
  it('aceita payload vazio', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita atualização parcial válida', async () => {
    expect(await errorsFor({ name: 'Novo nome', is_public: true })).toHaveLength(0);
  });

  it('rejeita leader_person_id que não é UUID quando informado', async () => {
    const errors = await errorsFor({ leader_person_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'leader_person_id')).toBe(true);
  });

  it('rejeita lat que não é número quando informado', async () => {
    const errors = await errorsFor({ lat: 'norte' });
    expect(errors.some((e) => e.property === 'lat')).toBe(true);
  });
});
