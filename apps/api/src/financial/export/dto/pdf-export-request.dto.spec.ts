import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PdfExportRequestDto } from './pdf-export-request.dto';

const BASE = { period_start: '2026-01-01', period_end: '2026-01-31' };

describe('PdfExportRequestDto', () => {
  it('aceita type razao', async () => {
    const dto = plainToInstance(PdfExportRequestDto, { ...BASE, type: 'razao' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('aceita type diario', async () => {
    const dto = plainToInstance(PdfExportRequestDto, { ...BASE, type: 'diario' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita type fora do conjunto permitido', async () => {
    const dto = plainToInstance(PdfExportRequestDto, { ...BASE, type: 'balanco' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('rejeita type ausente', async () => {
    const dto = plainToInstance(PdfExportRequestDto, { ...BASE });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('herda a validação de período da classe base', async () => {
    const dto = plainToInstance(PdfExportRequestDto, {
      period_start: 'não é data',
      period_end: BASE.period_end,
      type: 'razao',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'period_start')).toBe(true);
  });
});
