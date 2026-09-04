import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateGroupTypeDto } from './update-group-type.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateGroupTypeDto, payload);
  return validate(dto);
}

describe('UpdateGroupTypeDto', () => {
  it('aceita payload vazio', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita name e color válidos', async () => {
    expect(await errorsFor({ name: 'Novo nome', color: '#112233' })).toHaveLength(0);
  });

  it('rejeita name vazio quando informado', async () => {
    const errors = await errorsFor({ name: '' });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejeita color fora do formato hexadecimal quando informada', async () => {
    const errors = await errorsFor({ color: 'roxo' });
    expect(errors.some((e) => e.property === 'color')).toBe(true);
  });
});
