import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGroupTypeDto } from './create-group-type.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateGroupTypeDto, { name: 'Célula', ...payload });
  return validate(dto);
}

describe('CreateGroupTypeDto', () => {
  it('aceita apenas name', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita color válida', async () => {
    expect(await errorsFor({ color: '#AABBCC' })).toHaveLength(0);
  });

  it('rejeita name ausente', async () => {
    const errors = await errorsFor({ name: undefined });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejeita name vazio', async () => {
    const errors = await errorsFor({ name: '' });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejeita color fora do formato hexadecimal', async () => {
    const errors = await errorsFor({ color: 'roxo' });
    expect(errors.some((e) => e.property === 'color')).toBe(true);
  });
});
