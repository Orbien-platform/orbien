import { Injectable } from '@nestjs/common';
import { PlanStatus, PlanType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto';

export interface TenantListItem {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  plan: PlanType | null;
  plan_status: PlanStatus | null;
  trial_ends_at: Date | null;
  congregations_count: number;
  created_at: Date;
}

export interface TenantListPage {
  data: TenantListItem[];
  total: number;
  page: number;
  limit: number;
}

/**
 * A única leitura do sistema que atravessa tenants.
 *
 * Ela não decide isso: quem decide é o ramo `app_platform_access()` das
 * policies de `tenants` e `tenant_plans` (004_rls_platform_plane.sql), e ele só
 * é verdadeiro quando NÃO há tenant no contexto **e** o usuário corrente tem
 * `platform_support` em `role_assignments`. Por isso a rota precisa de
 * `@PlatformRoute()`: com um tenant fixado — inclusive o token de
 * `POST /auth/impersonate` — o `IS NULL` fecha o ramo e esta consulta devolve
 * um tenant só, sem erro nenhum. Lista curta aqui é sintoma de contexto, não
 * de banco vazio.
 *
 * O formato da página é o mesmo de `WaitlistService.findAll` — `{ data, total,
 * page, limit }` — porque as duas alimentam a mesma tela no `apps/admin`.
 */
@Injectable()
export class ListTenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListTenantsQueryDto): Promise<TenantListPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const search = query.search?.trim();
    const where: Prisma.TenantWhereInput = search
      ? {
          OR: [
            { slug: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.client.tenant.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          slug: true,
          name: true,
          email: true,
          created_at: true,
          tenantPlan: {
            select: { plan: true, status: true, trial_ends_at: true },
          },
          _count: { select: { congregations: true } },
        },
      }),
      this.prisma.client.tenant.count({ where }),
    ]);

    // `phone` fica fora de propósito: a tela lista, e o telefone do tenant é
    // dado de contato que ninguém precisa ver numa listagem de plataforma.
    const data = rows.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      email: t.email,
      plan: t.tenantPlan?.plan ?? null,
      plan_status: t.tenantPlan?.status ?? null,
      trial_ends_at: t.tenantPlan?.trial_ends_at ?? null,
      congregations_count: t._count.congregations,
      created_at: t.created_at,
    }));

    return { data, total, page, limit };
  }
}
