import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateNetworkDto } from './update-network.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateNetworkDto, payload);
  return validate(dto);
}

describe('UpdateNetworkDto', () => {
  it('aceita objeto vazio — todos os campos são opcionais (PartialType)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita atualização parcial de um único campo', async () => {
    expect(await errorsFor({ name: 'Rede Renomeada' })).toHaveLength(0);
  });

  it('rejeita health_goal_pct fora de 0-100 mesmo em atualização parcial', async () => {
    const errors = await errorsFor({ health_goal_pct: 150 });
    expect(errors.some((e) => e.property === 'health_goal_pct')).toBe(true);
  });

  it('rejeita leader_person_id que não é UUID', async () => {
    const errors = await errorsFor({ leader_person_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'leader_person_id')).toBe(true);
  });
});
