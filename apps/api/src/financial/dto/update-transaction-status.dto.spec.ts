import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTransactionStatusDto } from './update-transaction-status.dto';

describe('UpdateTransactionStatusDto', () => {
  it('aceita status pending', async () => {
    const dto = plainToInstance(UpdateTransactionStatusDto, { status: 'pending' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('aceita status paid', async () => {
    const dto = plainToInstance(UpdateTransactionStatusDto, { status: 'paid' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita status fora do conjunto permitido', async () => {
    const dto = plainToInstance(UpdateTransactionStatusDto, { status: 'confirmed' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('rejeita status ausente', async () => {
    const dto = plainToInstance(UpdateTransactionStatusDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });
});
