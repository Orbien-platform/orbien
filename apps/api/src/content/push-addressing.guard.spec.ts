import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * PEND-22 — guarda contra a volta do push endereçado por tag `person_id`.
 *
 * O app registra no OneSignal o `external_id` (id da conta) e tags de tenant,
 * congregação, papel e `pref_*`. Tag de pessoa é registrada às cegas (fetch
 * assíncrono sem retry, só em build novo), então não é endereço confiável. Quem
 * manda push a uma PESSOA usa `NotificationsService.sendPushToPersons`, que
 * resolve a conta ativa pelo banco e aplica a preferência, se houver categoria.
 */
const SRC = join(__dirname, '..');
const SELF = __filename;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') && !full.endsWith('.spec.ts') && full !== SELF ? [full] : [];
  });
}

/** `key: 'person_id'` em qualquer aspa, perto de um filtro `field: 'tag'` (nos dois sentidos). */
const TAG_PERSON_ID = /field:\s*['"`]tag['"`][^}]{0,200}key:\s*['"`]person_id['"`]|key:\s*['"`]person_id['"`][^}]{0,200}field:\s*['"`]tag['"`]/;

describe('endereçamento de push por pessoa', () => {
  it('nenhum envio filtra o OneSignal pela tag person_id; use sendPushToPersons', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => TAG_PERSON_ID.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));

    expect(offenders).toEqual([]);
  });

  it('o padrão pega o formato que existia (sanidade da própria guarda)', () => {
    const before = `{ field: 'tag', key: 'person_id', relation: '=', value: id }`;
    const reversed = `{ key: "person_id", field: "tag" }`;
    expect(TAG_PERSON_ID.test(before)).toBe(true);
    expect(TAG_PERSON_ID.test(reversed)).toBe(true);
    expect(TAG_PERSON_ID.test(`{ field: 'tag', key: 'role', relation: '=', value: 'x' }`)).toBe(false);
  });
});
