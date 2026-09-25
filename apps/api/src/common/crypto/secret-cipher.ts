import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM para segredo por tenant que precisa ser lido de volta (ex:
 * access/refresh token da conexão Cloudflare) — diferente de senha/refresh
 * token de sessão, que são hash de mão única. Formato gravado no banco:
 * `<iv base64>:<authTag base64>:<ciphertext base64>`, um IV novo por
 * chamada (GCM não pode reusar IV com a mesma chave).
 *
 * `DOMAIN_SECRETS_ENCRYPTION_KEY` tem que ser 32 bytes em hex (64
 * caracteres) — sem ela, cifrar/decifrar lança 503 em vez de gravar segredo
 * em texto claro ou quebrar em runtime com stack trace confuso.
 */
@Injectable()
export class SecretCipher {
  private get key(): Buffer {
    const hex = process.env['DOMAIN_SECRETS_ENCRYPTION_KEY'];
    if (!hex || hex.length !== 64) {
      throw new ServiceUnavailableException(
        'DOMAIN_SECRETS_ENCRYPTION_KEY ausente ou com tamanho inválido (esperado 64 caracteres hex)',
      );
    }
    return Buffer.from(hex, 'hex');
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  decrypt(payload: string): string {
    const [ivB64, authTagB64, ciphertextB64] = payload.split(':');
    if (!ivB64 || !authTagB64 || !ciphertextB64) {
      throw new ServiceUnavailableException('Segredo cifrado em formato inesperado');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  }
}
