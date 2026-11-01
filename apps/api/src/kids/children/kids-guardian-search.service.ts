import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KidsActor } from './kids-child-access.service';
import { SearchKidsGuardiansQueryDto } from './dto/search-kids-guardians-query.dto';

const SEARCH_LIMIT = 20;

export type KidsGuardianSearchHit = { id: string; full_name: string; phone_masked: string | null };

/**
 * Telefone sem os 4 últimos dígitos: o líder reconhece o adulto, mas a busca não
 * vira catálogo de contatos. Mantém a pontuação para a máscara parecer com o
 * número. Sem telefone, `null`.
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let keep = 4;
  const chars = [...phone];
  for (let i = chars.length - 1; i >= 0; i--) {
    if (!/\d/.test(chars[i]!)) continue;
    if (keep > 0) keep -= 1;
    else chars[i] = '*';
  }
  // Menos de 4 dígitos: nada a mostrar.
  return phone.replace(/\D/g, '').length <= 4 ? chars.map((c) => (/\d/.test(c) ? '*' : c)).join('') : chars.join('');
}

/**
 * Busca de adultos para o cadastro de criança e de autorizados (R3-4). O
 * `ministry_leader` cadastra crianças mas não lê `GET /persons`; esta rota é a
 * leitura mínima de que ele precisa: id, nome e telefone mascarado. Só adultos
 * (`is_child = false`), vivos, da congregação do ator.
 */
@Injectable()
export class KidsGuardianSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(actor: KidsActor, query: SearchKidsGuardiansQueryDto): Promise<KidsGuardianSearchHit[]> {
    const q = query.q.trim();
    const digits = q.replace(/\D/g, '');
    // O telefone é gravado como o usuário digitou ("(11) 98765-4321"); buscar
    // "119876" exige comparar só os dígitos, o que o Prisma não expressa.
    const byDigits =
      digits.length >= 3
        ? await this.prisma.client.$queryRaw<{ id: string }[]>`
            SELECT id FROM persons
             WHERE tenant_id = ${actor.tenantId}
               AND congregation_id = ${actor.congregationId}
               AND is_child = false AND deleted_at IS NULL AND anonymized_at IS NULL
               AND regexp_replace(coalesce(phone, ''), '\\D', '', 'g') LIKE ${'%' + digits + '%'}
             LIMIT 100`
        : [];
    const rows = await this.prisma.client.person.findMany({
      where: {
        tenant_id: actor.tenantId,
        congregation_id: actor.congregationId,
        is_child: false,
        deleted_at: null,
        anonymized_at: null,
        OR: [
          { full_name: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          ...(byDigits.length > 0 ? [{ id: { in: byDigits.map((r) => r.id) } }] : []),
        ],
      },
      select: { id: true, full_name: true, phone: true },
      orderBy: { full_name: 'asc' },
      take: SEARCH_LIMIT,
    });
    return rows.map((r) => ({ id: r.id, full_name: r.full_name, phone_masked: maskPhone(r.phone) }));
  }
}
