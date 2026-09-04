import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMinistryDto } from './create-ministry.dto';

const BASE = { name: 'Louvor' };

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateMinistryDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateMinistryDto', () => {
  it('aceita apenas o campo obrigatório', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita todos os campos opcionais preenchidos', async () => {
    expect(
      await errorsFor({
        description: 'Ministério de louvor e adoração',
        color: '#FF00AA',
        parent_ministry_id: '11111111-1111-4111-8111-111111111111',
      }),
    ).toHaveLength(0);
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
    const errors = await errorsFor({ color: 'azul' });
    expect(errors.some((e) => e.property === 'color')).toBe(true);
  });

  it('rejeita parent_ministry_id que não é UUID', async () => {
    const errors = await errorsFor({ parent_ministry_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'parent_ministry_id')).toBe(true);
  });
});
