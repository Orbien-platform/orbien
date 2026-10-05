import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DashboardQueryDto } from './dashboard-query.dto';

describe('DashboardQueryDto', () => {
  it('aceita sem nenhum campo', async () => {
    const dto = plainToInstance(DashboardQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('aceita congregation_id UUID válido', async () => {
    const dto = plainToInstance(DashboardQueryDto, {
      congregation_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita congregation_id que não é UUID', async () => {
    const dto = plainToInstance(DashboardQueryDto, { congregation_id: 'não-uuid' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'congregation_id')).toBe(true);
  });

  it('aceita período com as duas datas', async () => {
    const dto = plainToInstance(DashboardQueryDto, {
      period_start: '2026-10-01',
      period_end: '2026-10-31',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita período com só uma das datas', async () => {
    const onlyStart = await validate(plainToInstance(DashboardQueryDto, { period_start: '2026-10-01' }));
    expect(onlyStart.some((e) => e.property === 'period_end')).toBe(true);
    const onlyEnd = await validate(plainToInstance(DashboardQueryDto, { period_end: '2026-10-31' }));
    expect(onlyEnd.some((e) => e.property === 'period_start')).toBe(true);
  });

  it('rejeita data que não é data', async () => {
    const errors = await validate(
      plainToInstance(DashboardQueryDto, { period_start: 'ontem', period_end: '2026-10-31' }),
    );
    expect(errors.some((e) => e.property === 'period_start')).toBe(true);
  });
});
