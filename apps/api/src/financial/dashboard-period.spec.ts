import {
  addDays,
  buildBuckets,
  dayKey,
  previousPeriod,
  resolvePeriod,
  todayInSaoPaulo,
} from './dashboard-period';

describe('resolvePeriod', () => {
  it('sem datas, é o mês corrente de Brasília', () => {
    const p = resolvePeriod(undefined, undefined, new Date('2026-10-15T12:00:00.000Z'));
    expect(dayKey(p.start)).toBe('2026-10-01');
    expect(dayKey(p.end)).toBe('2026-10-31');
    expect(dayKey(p.endExclusive)).toBe('2026-11-01');
  });

  it('às 23h do último dia em Brasília (já é o mês seguinte em UTC), ainda é o mês que acaba', () => {
    const p = resolvePeriod(undefined, undefined, new Date('2026-11-01T02:00:00.000Z'));
    expect(dayKey(p.start)).toBe('2026-10-01');
  });

  it('o fim é inclusivo: o limite exclusivo é o dia seguinte', () => {
    const p = resolvePeriod('2026-10-05', '2026-10-05');
    expect(dayKey(p.endExclusive)).toBe('2026-10-06');
  });

  it('agrupa por semana até 93 dias e por mês acima disso', () => {
    expect(resolvePeriod('2026-07-01', '2026-09-30').granularity).toBe('week'); // 92 dias
    expect(resolvePeriod('2026-07-01', '2026-10-01').granularity).toBe('week'); // 93 dias, o limite
    expect(resolvePeriod('2026-07-01', '2026-10-02').granularity).toBe('month'); // 94 dias
    expect(resolvePeriod('2026-01-01', '2026-12-31').granularity).toBe('month');
  });

  it('exige as duas datas, em ordem, e até 5 anos', () => {
    expect(() => resolvePeriod('2026-10-01')).toThrow();
    expect(() => resolvePeriod('2026-10-31', '2026-10-01')).toThrow();
    expect(() => resolvePeriod('2015-01-01', '2026-01-01')).toThrow();
  });
});

describe('previousPeriod', () => {
  it('mês cheio compara com o mês anterior', () => {
    const prev = previousPeriod(resolvePeriod('2026-03-01', '2026-03-31'));
    expect(dayKey(prev.start)).toBe('2026-02-01');
    expect(dayKey(prev.endExclusive)).toBe('2026-03-01');
  });

  it('trimestre cheio compara com o trimestre anterior', () => {
    const prev = previousPeriod(resolvePeriod('2026-07-01', '2026-09-30'));
    expect(dayKey(prev.start)).toBe('2026-04-01');
    expect(dayKey(prev.endExclusive)).toBe('2026-07-01');
  });

  it('ano cheio compara com o ano anterior', () => {
    const prev = previousPeriod(resolvePeriod('2026-01-01', '2026-12-31'));
    expect(dayKey(prev.start)).toBe('2025-01-01');
  });

  it('intervalo livre compara com os dias imediatamente anteriores, de mesmo tamanho', () => {
    const prev = previousPeriod(resolvePeriod('2026-10-10', '2026-10-19')); // 10 dias
    expect(dayKey(prev.start)).toBe('2026-09-30');
    expect(dayKey(prev.endExclusive)).toBe('2026-10-10');
  });
});

describe('buildBuckets', () => {
  it('semanas começam na segunda-feira e cobrem todo o período', () => {
    const p = resolvePeriod('2026-10-01', '2026-10-31');
    const b = buildBuckets(p);
    expect(b.map((x) => dayKey(x.start))).toEqual([
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
  });

  it('período que termina num domingo não abre uma semana a mais', () => {
    const b = buildBuckets(resolvePeriod('2026-10-05', '2026-10-11'));
    expect(b).toHaveLength(1);
  });

  it('meses para períodos longos', () => {
    const b = buildBuckets(resolvePeriod('2026-01-15', '2026-06-10'));
    expect(b.map((x) => dayKey(x.start))).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
    ]);
  });
});

describe('todayInSaoPaulo', () => {
  it('usa o dia de Brasília, não o de UTC', () => {
    expect(dayKey(todayInSaoPaulo(new Date('2026-10-06T01:00:00.000Z')))).toBe('2026-10-05');
    expect(dayKey(addDays(todayInSaoPaulo(new Date('2026-10-06T04:00:00.000Z')), 0))).toBe('2026-10-06');
  });
});
