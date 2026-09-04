import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MaterializeInstancesDto } from './materialize-instances.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(MaterializeInstancesDto, payload);
  return validate(dto);
}

describe('MaterializeInstancesDto', () => {
  it('aceita from e to como datas válidas', async () => {
    expect(await errorsFor({ from: '2026-09-01', to: '2026-09-30' })).toHaveLength(0);
  });

  it('rejeita from inválida', async () => {
    const errors = await errorsFor({ from: 'não é data', to: '2026-09-30' });
    expect(errors.some((e) => e.property === 'from')).toBe(true);
  });

  it('rejeita to inválida', async () => {
    const errors = await errorsFor({ from: '2026-09-01', to: 'não é data' });
    expect(errors.some((e) => e.property === 'to')).toBe(true);
  });
});
