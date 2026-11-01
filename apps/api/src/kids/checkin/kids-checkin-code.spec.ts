import { InternalServerErrorException } from '@nestjs/common';
import { KIDS_CODE_ALPHABET, KIDS_CODE_LENGTH, KIDS_CODE_MAX_ATTEMPTS, generateUniqueCode, randomCode } from './kids-checkin-code';

describe('kids-checkin-code', () => {
  describe('randomCode', () => {
    it('usa o alfabeto do design (sem 0, O, 1, I, L) e tem 4 caracteres', () => {
      expect(KIDS_CODE_ALPHABET).toBe('23456789ABCDEFGHJKMNPQRSTUVWXYZ');
      expect(KIDS_CODE_LENGTH).toBe(4);
      for (let i = 0; i < 500; i++) {
        const code = randomCode();
        expect(code).toHaveLength(4);
        expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
      }
    });

    it('mapeia o sorteio ao alfabeto pelo índice (primeiro e último caracteres)', () => {
      const seq = [0, 0, 0, 0];
      expect(randomCode(() => seq.shift()!)).toBe('2222');
      const last = KIDS_CODE_ALPHABET.length - 1;
      expect(randomCode(() => last)).toBe('ZZZZ');
    });
  });

  describe('generateUniqueCode', () => {
    it('devolve o primeiro código livre, sem consultar de novo', async () => {
      const isTaken = jest.fn().mockResolvedValue(false);
      const code = await generateUniqueCode(isTaken, () => 1);
      expect(code).toBe('3333');
      expect(isTaken).toHaveBeenCalledTimes(1);
      expect(isTaken).toHaveBeenCalledWith('3333');
    });

    it('colisão dentro da sessão: gera de novo até achar um livre', async () => {
      const taken = new Set(['2222']);
      const isTaken = jest.fn(async (c: string) => taken.has(c));
      // 1º código: índices 0,0,0,0 → "2222" (tomado); 2º: índice 5 → "7777"
      const rng2 = jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(5);
      const code = await generateUniqueCode(isTaken, rng2);
      expect(code).toBe('7777');
      expect(isTaken).toHaveBeenNthCalledWith(1, '2222');
      expect(isTaken).toHaveBeenCalledTimes(2);
    });

    it('tenta no máximo 5 vezes e depois falha (500 logado, design)', async () => {
      expect(KIDS_CODE_MAX_ATTEMPTS).toBe(5);
      const isTaken = jest.fn().mockResolvedValue(true);
      await expect(generateUniqueCode(isTaken, () => 0)).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(isTaken).toHaveBeenCalledTimes(5);
    });

    it('a quinta tentativa ainda vale', async () => {
      const isTaken = jest.fn();
      isTaken.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      await expect(generateUniqueCode(isTaken, () => 0)).resolves.toBe('2222');
      expect(isTaken).toHaveBeenCalledTimes(5);
    });
  });
});
