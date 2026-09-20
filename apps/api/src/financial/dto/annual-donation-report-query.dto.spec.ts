import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AnnualDonationReportQueryDto } from './annual-donation-report-query.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(AnnualDonationReportQueryDto, payload);
  return { dto, errors: await validate(dto) };
}

describe('AnnualDonationReportQueryDto', () => {
  it('aceita vazio e aplica o ano corrente como default', async () => {
    const { dto, errors } = await errorsFor({});
    expect(errors).toHaveLength(0);
    expect(dto.year).toBe(new Date().getUTCFullYear());
  });

  it('aceita year dentro do limite, convertendo string em number', async () => {
    const { dto, errors } = await errorsFor({ year: '2026' });
    expect(errors).toHaveLength(0);
    expect(dto.year).toBe(2026);
  });

  it('rejeita year menor que 2000', async () => {
    const { errors } = await errorsFor({ year: 1999 });
    expect(errors.some((e) => e.property === 'year')).toBe(true);
  });

  it('rejeita year maior que 2100', async () => {
    const { errors } = await errorsFor({ year: 2101 });
    expect(errors.some((e) => e.property === 'year')).toBe(true);
  });
});
