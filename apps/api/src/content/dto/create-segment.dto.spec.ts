import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSegmentDto } from './create-segment.dto';

const BASE = {
  name: 'Jovens',
  criteria: { roles: ['member'] },
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateSegmentDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateSegmentDto', () => {
  it('aceita os campos obrigatórios', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita name ausente', async () => {
    const errors = await errorsFor({ name: undefined });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejeita criteria ausente', async () => {
    const errors = await errorsFor({ criteria: undefined });
    expect(errors.some((e) => e.property === 'criteria')).toBe(true);
  });

  it('rejeita criteria com campo interno inválido', async () => {
    const errors = await errorsFor({ criteria: { roles: [42] } });
    expect(errors.some((e) => e.property === 'criteria')).toBe(true);
  });
});
