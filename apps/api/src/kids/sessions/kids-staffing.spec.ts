import { countScheduledVolunteers, volunteersMissing } from './kids-staffing';

describe('volunteersMissing (spec P2 Escala, AC 2)', () => {
  it('falta a diferença entre o mínimo da turma e os escalados', () => {
    expect(volunteersMissing(3, 1)).toBe(2);
  });

  it('é 0 quando os escalados atingem o mínimo', () => {
    expect(volunteersMissing(2, 2)).toBe(0);
  });

  it('nunca é negativo quando há mais escalados que o mínimo', () => {
    expect(volunteersMissing(2, 5)).toBe(0);
  });

  it('turma sem mínimo (0) nunca sinaliza falta', () => {
    expect(volunteersMissing(0, 0)).toBe(0);
  });

  it('sessão sem ninguém escalado falta o mínimo inteiro', () => {
    expect(volunteersMissing(4, 0)).toBe(4);
  });
});

describe('countScheduledVolunteers', () => {
  const row = (session: string, vol: string, status: string) => ({
    status,
    volunteer_profile_id: vol,
    celebrationMinistry: { kids_session_id: session },
  });

  it('conta só pending e confirmed da sessão pedida', () => {
    const rows = [
      row('s1', 'v1', 'pending'),
      row('s1', 'v2', 'confirmed'),
      row('s1', 'v3', 'declined'),
      row('s1', 'v4', 'swapped'),
      row('s2', 'v5', 'confirmed'),
    ];
    expect(countScheduledVolunteers(rows, 's1')).toBe(2);
    expect(countScheduledVolunteers(rows, 's2')).toBe(1);
  });

  it('o mesmo voluntário em dois ministérios da sessão conta uma vez', () => {
    const rows = [row('s1', 'v1', 'pending'), row('s1', 'v1', 'confirmed')];
    expect(countScheduledVolunteers(rows, 's1')).toBe(1);
  });

  it('sessão sem linhas tem 0 escalados', () => {
    expect(countScheduledVolunteers([], 's1')).toBe(0);
  });
});
