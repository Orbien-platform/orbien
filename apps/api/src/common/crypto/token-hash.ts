import { createHash } from 'crypto';

/**
 * SHA-256 hex de um token opaco de alta entropia (refresh token, token de
 * redefinição/convite de senha).
 *
 * É SHA-256 e não argon2 de propósito: o token tem 256+ bits de entropia
 * aleatória, então não há dicionário a resistir, e o hash determinístico
 * permite busca por igualdade (O(1), índice único). O salt aleatório do argon2
 * tornaria a busca impossível sem varrer a tabela.
 *
 * O valor em claro só existe na memória do processo e no e-mail/link enviado a
 * quem vai usá-lo; o banco guarda apenas este hash.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
