import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DemographicsQueryDto } from './demographics-query.dto';

describe('DemographicsQueryDto', () => {
  it('aceita objeto vazio (todos os campos são opcionais)', async () => {
    const dto = plainToInstance(DemographicsQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('aceita classification, since e until válidos', async () => {
    const dto = plainToInstance(DemographicsQueryDto, {
      classification: 'member',
      since: '2026-01-01T00:00:00Z',
      until: '2026-06-01T00:00:00Z',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita classification fora do enum', async () => {
    const dto = plainToInstance(DemographicsQueryDto, { classification: 'inexistente' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'classification')).toBe(true);
  });

  it('rejeita since que não é ISO 8601', async () => {
    const dto = plainToInstance(DemographicsQueryDto, { since: '15/01/2026' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'since')).toBe(true);
  });

  it('rejeita until que não é ISO 8601', async () => {
    const dto = plainToInstance(DemographicsQueryDto, { until: 'não é data' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'until')).toBe(true);
  });
});
