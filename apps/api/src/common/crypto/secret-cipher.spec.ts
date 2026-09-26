import { ServiceUnavailableException } from '@nestjs/common';
import { SecretCipher } from './secret-cipher';

const KEY = 'a'.repeat(64);

describe('SecretCipher', () => {
  afterEach(() => {
    delete process.env['DOMAIN_SECRETS_ENCRYPTION_KEY'];
  });

  it('decifra exatamente o que cifrou', () => {
    process.env['DOMAIN_SECRETS_ENCRYPTION_KEY'] = KEY;
    const cipher = new SecretCipher();
    const encrypted = cipher.encrypt('token-super-secreto');
    expect(encrypted).not.toContain('token-super-secreto');
    expect(cipher.decrypt(encrypted)).toBe('token-super-secreto');
  });

  it('gera cifrados diferentes para o mesmo texto (IV novo a cada chamada)', () => {
    process.env['DOMAIN_SECRETS_ENCRYPTION_KEY'] = KEY;
    const cipher = new SecretCipher();
    expect(cipher.encrypt('x')).not.toBe(cipher.encrypt('x'));
  });

  it('rejeita decifrar com adulteração no authTag', () => {
    process.env['DOMAIN_SECRETS_ENCRYPTION_KEY'] = KEY;
    const cipher = new SecretCipher();
    const [iv, , ciphertext] = cipher.encrypt('token').split(':');
    const tampered = `${iv}:${Buffer.from('adulterado-16by!').toString('base64')}:${ciphertext}`;
    expect(() => cipher.decrypt(tampered)).toThrow();
  });

  it('sem DOMAIN_SECRETS_ENCRYPTION_KEY, lança 503 em vez de cifrar com chave vazia', () => {
    const cipher = new SecretCipher();
    expect(() => cipher.encrypt('token')).toThrow(ServiceUnavailableException);
  });

  it('rejeita decifrar payload sem os três segmentos separados por ":"', () => {
    process.env['DOMAIN_SECRETS_ENCRYPTION_KEY'] = KEY;
    const cipher = new SecretCipher();
    expect(() => cipher.decrypt('só-um-pedaço-sem-separador')).toThrow(ServiceUnavailableException);
  });
});
