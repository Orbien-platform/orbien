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

  // Vínculo de rede (PROD-20, CEL20-07)
  it('aceita network_id como UUID válido', async () => {
    expect(
      await errorsFor({ network_id: '11111111-1111-4111-8111-111111111111' }),
    ).toHaveLength(0);
  });

  it('aceita network_id explicitamente null (desvínculo)', async () => {
    expect(await errorsFor({ network_id: null })).toHaveLength(0);
  });

  it('rejeita network_id que não é UUID', async () => {
    const errors = await errorsFor({ network_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'network_id')).toBe(true);
  });
});
