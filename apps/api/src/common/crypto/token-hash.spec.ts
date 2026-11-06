import { hashToken } from './token-hash';

describe('hashToken', () => {
  it('é o SHA-256 hex (vetor conhecido) e determinístico', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('entradas diferentes dão hashes diferentes e o hash não contém o token', () => {
    const raw = 'a'.repeat(64);
    expect(hashToken(raw)).not.toBe(hashToken(raw + 'b'));
    expect(hashToken(raw)).not.toContain(raw);
    expect(hashToken(raw)).toMatch(/^[0-9a-f]{64}$/);
  });
});
