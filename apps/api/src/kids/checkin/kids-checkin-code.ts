import { InternalServerErrorException, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';

// Sem 0/O/1/I/L: o código é lido em etiqueta a 3 metros (design, Tech Decisions).
export const KIDS_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const KIDS_CODE_LENGTH = 4;
export const KIDS_CODE_MAX_ATTEMPTS = 5;

const logger = new Logger('KidsCheckinCode');

/** `rng(n)` devolve um inteiro em [0, n); o padrão é o CSPRNG do Node. */
export function randomCode(rng: (max: number) => number = (max) => randomInt(max)): string {
  let code = '';
  for (let i = 0; i < KIDS_CODE_LENGTH; i++) code += KIDS_CODE_ALPHABET[rng(KIDS_CODE_ALPHABET.length)];
  return code;
}

/**
 * Código único dentro da sessão: sorteia de novo na colisão, até 5 vezes.
 * Fora da sessão o código pode repetir. Esgotar as tentativas é 500 logado.
 */
export async function generateUniqueCode(
  isTaken: (code: string) => Promise<boolean>,
  rng?: (max: number) => number,
): Promise<string> {
  for (let attempt = 0; attempt < KIDS_CODE_MAX_ATTEMPTS; attempt++) {
    const code = randomCode(rng);
    if (!(await isTaken(code))) return code;
  }
  logger.error(`sem código livre após ${KIDS_CODE_MAX_ATTEMPTS} tentativas`);
  throw new InternalServerErrorException('Não foi possível gerar o código de retirada');
}
