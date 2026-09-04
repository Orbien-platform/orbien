import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTransactionDto } from './update-transaction.dto';

describe('UpdateTransactionDto', () => {
  it('aceita objeto vazio — todo campo é opcional no PartialType', async () => {
    const dto = plainToInstance(UpdateTransactionDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('aceita alteração parcial de amount', async () => {
    const dto = plainToInstance(UpdateTransactionDto, { amount: 200 });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita amount negativo quando informado', async () => {
    const dto = plainToInstance(UpdateTransactionDto, { amount: -1 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });

  it('rejeita type fora do enum quando informado', async () => {
    const dto = plainToInstance(UpdateTransactionDto, { type: 'invalido' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });
});
