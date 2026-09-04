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
});
