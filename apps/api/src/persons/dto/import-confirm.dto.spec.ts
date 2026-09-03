import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ImportConfirmDto } from './import-confirm.dto';

describe('ImportConfirmDto', () => {
  it('aceita file_id e mapping válidos', async () => {
    const dto = plainToInstance(ImportConfirmDto, {
      file_id: 'abc123.csv',
      mapping: { nome: 'Nome', telefone: 'Telefone' },
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita file_id que não é string', async () => {
    const dto = plainToInstance(ImportConfirmDto, { file_id: 123, mapping: {} });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'file_id')).toBe(true);
  });

  it('rejeita mapping ausente', async () => {
    const dto = plainToInstance(ImportConfirmDto, { file_id: 'abc123.csv' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'mapping')).toBe(true);
  });

  it('rejeita mapping que não é objeto', async () => {
    const dto = plainToInstance(ImportConfirmDto, { file_id: 'abc123.csv', mapping: 'nao-objeto' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'mapping')).toBe(true);
  });
});
