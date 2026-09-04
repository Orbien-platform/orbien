import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCategoryDto } from './update-category.dto';

describe('UpdateCategoryDto', () => {
  it('aceita objeto vazio — todo campo é opcional no PartialType', async () => {
    const dto = plainToInstance(UpdateCategoryDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('aceita alteração parcial de name e type', async () => {
    const dto = plainToInstance(UpdateCategoryDto, { name: 'Nova categoria', type: 'expense' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita type fora do enum quando informado', async () => {
    const dto = plainToInstance(UpdateCategoryDto, { type: 'invalido' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });
});
