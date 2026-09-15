import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateNetworkDto } from './create-network.dto';

const BASE = {
  name: 'Rede Central',
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateNetworkDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateNetworkDto', () => {
  it('aceita os campos obrigatórios', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita campos opcionais preenchidos', async () => {
    expect(
      await errorsFor({
        leader_person_id: '22222222-2222-4222-8222-222222222222',
        health_goal_pct: 80,
      }),
    ).toHaveLength(0);
  });

  it('rejeita name ausente', async () => {
    const errors = await errorsFor({ name: undefined });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejeita leader_person_id que não é UUID', async () => {
    const errors = await errorsFor({ leader_person_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'leader_person_id')).toBe(true);
  });

  it('aceita health_goal_pct no limite inferior (0)', async () => {
    expect(await errorsFor({ health_goal_pct: 0 })).toHaveLength(0);
  });

  it('aceita health_goal_pct no limite superior (100)', async () => {
    expect(await errorsFor({ health_goal_pct: 100 })).toHaveLength(0);
  });

  it('rejeita health_goal_pct abaixo de 0', async () => {
    const errors = await errorsFor({ health_goal_pct: -1 });
    expect(errors.some((e) => e.property === 'health_goal_pct')).toBe(true);
  });

  it('rejeita health_goal_pct acima de 100', async () => {
    const errors = await errorsFor({ health_goal_pct: 101 });
    expect(errors.some((e) => e.property === 'health_goal_pct')).toBe(true);
  });

  it('rejeita health_goal_pct que não é número inteiro', async () => {
    const errors = await errorsFor({ health_goal_pct: 'oitenta' });
    expect(errors.some((e) => e.property === 'health_goal_pct')).toBe(true);
  });
});
