import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUnavailabilityDto } from './create-unavailability.dto';

const BASE = { referenceMonth: 9, referenceYear: 2026, dates: ['2026-09-06'] };

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateUnavailabilityDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateUnavailabilityDto', () => {
  it('aceita um payload válido com uma data única', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita várias datas e notes opcional', async () => {
    expect(
      await errorsFor({ dates: ['2026-09-06', '2026-09-13'], notes: 'Viagem de trabalho' }),
    ).toHaveLength(0);
  });

  it('aceita lista de dates vazia', async () => {
    expect(await errorsFor({ dates: [] })).toHaveLength(0);
  });

  it('rejeita referenceMonth fora de 1..12', async () => {
    const errors = await errorsFor({ referenceMonth: 13 });
    expect(errors.some((e) => e.property === 'referenceMonth')).toBe(true);
  });

  it('rejeita referenceMonth abaixo de 1', async () => {
    const errors = await errorsFor({ referenceMonth: 0 });
    expect(errors.some((e) => e.property === 'referenceMonth')).toBe(true);
  });

  it('rejeita referenceYear abaixo de 2000', async () => {
    const errors = await errorsFor({ referenceYear: 1999 });
    expect(errors.some((e) => e.property === 'referenceYear')).toBe(true);
  });

  it('rejeita dates que não é array', async () => {
    const errors = await errorsFor({ dates: '2026-09-06' });
    expect(errors.some((e) => e.property === 'dates')).toBe(true);
  });

  it('rejeita data fora do formato ISO 8601', async () => {
    const errors = await errorsFor({ dates: ['06/09/2026'] });
    expect(errors.some((e) => e.property === 'dates')).toBe(true);
  });

  it('rejeita notes que não é string', async () => {
    const errors = await errorsFor({ notes: 123 });
    expect(errors.some((e) => e.property === 'notes')).toBe(true);
  });
});
