import 'reflect-metadata';
import { validate } from 'class-validator';
import { IsNotBeforePeriodStart } from './period-range.validator';

class Range {
  period_start?: unknown;

  @IsNotBeforePeriodStart()
  period_end?: unknown;
}

class RangeWithMessage {
  period_start?: unknown;

  @IsNotBeforePeriodStart({ message: 'fim antes do início' })
  period_end?: unknown;
}

async function errorsFor(start: unknown, end: unknown, Cls: new () => { period_start?: unknown; period_end?: unknown } = Range) {
  const dto = new Cls();
  dto.period_start = start;
  dto.period_end = end;
  return validate(dto);
}

describe('IsNotBeforePeriodStart', () => {
  it('fim depois do início passa', async () => {
    expect(await errorsFor('2026-01-01', '2026-01-31')).toHaveLength(0);
  });

  it('fim igual ao início passa (período de um dia)', async () => {
    expect(await errorsFor('2026-01-15', '2026-01-15')).toHaveLength(0);
  });

  it('fim antes do início reprova, com a mensagem padrão', async () => {
    const errors = await errorsFor('2026-02-01', '2026-01-31');

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('period_end');
    expect(Object.values(errors[0]?.constraints ?? {})).toEqual(['period_end não pode ser anterior a period_start']);
  });

  it('a mensagem pode ser trocada pelas opções do decorator', async () => {
    const errors = await errorsFor('2026-02-01', '2026-01-31', RangeWithMessage);

    expect(Object.values(errors[0]?.constraints ?? {})).toEqual(['fim antes do início']);
  });

  // Quando um dos lados nem é uma data, quem reclama é o @IsDateString do próprio campo;
  // este validador só compara quando as DUAS pontas existem e parseiam.
  it.each([
    ['período sem início', undefined, '2026-01-31'],
    ['início que não é string', 20260101, '2026-01-31'],
    ['fim que não é string', '2026-01-01', 20260131],
    ['fim ausente', '2026-01-01', undefined],
    ['início que não parseia', 'não é data', '2026-01-31'],
    ['fim que não parseia', '2026-01-01', 'não é data'],
  ])('%s: não reprova (a outra validação cuida)', async (_nome, start, end) => {
    expect(await errorsFor(start, end)).toHaveLength(0);
  });
});
