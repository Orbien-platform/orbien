import { Injectable } from '@nestjs/common';
import { PlanStatus, PlanType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CrmQueueItem {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  plan: PlanType | null;
  plan_status: PlanStatus | null;
  trial_ends_at: Date | null;
  created_at: Date;
}

export interface CrmQueue {
  trials_expirados: CrmQueueItem[];
  inadimplentes: CrmQueueItem[];
}

/**
 * PROD-06 — fila de CRM para o console de plataforma.
 *
 * Duas listas, mesma leitura que `ListTenantsService` (atravessa tenants,
 * por isso mora aqui e não em `list-tenants.service.ts` — nada aqui muda a
 * RLS nem o contrato daquela rota, só junta outro corte da mesma tabela):
 *
 * - **Trial não convertido**: `plan_status = trial` com `trial_ends_at` no
 *   passado, tenant ainda ativo (`is_active`). Se o tenant foi desativado, já
 *   saiu do funil — não é lead frio, é encerrado.
 * - **Inadimplente**: `plan_status = suspended` — é o valor do enum
 *   `PlanStatus` que marca cobrança que não passou (ver PEND-02 em
 *   `docs/PLANO.md` sobre esse mesmo enum divergir do rótulo do front).
 *
 * `cancelled` fica fora dos dois: é encerramento decidido, não pendência de
 * conversão ou cobrança.
 */
@Injectable()
export class ListCrmQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<CrmQueue> {
    const [trialsExpiradosRows, inadimplentesRows] = await Promise.all([
      this.prisma.client.tenant.findMany({
        where: {
          is_active: true,
          tenantPlan: {
            status: PlanStatus.trial,
            trial_ends_at: { lt: new Date() },
          },
        },
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
          email: true,
          created_at: true,
          tenantPlan: { select: { plan: true, status: true, trial_ends_at: true } },
        },
      }),
      this.prisma.client.tenant.findMany({
        where: {
          is_active: true,
          tenantPlan: { status: PlanStatus.suspended },
        },
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
          email: true,
          created_at: true,
          tenantPlan: { select: { plan: true, status: true, trial_ends_at: true } },
        },
      }),
    ]);

    const toItem = (t: (typeof trialsExpiradosRows)[number]): CrmQueueItem => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      email: t.email,
      plan: t.tenantPlan?.plan ?? null,
      plan_status: t.tenantPlan?.status ?? null,
      trial_ends_at: t.tenantPlan?.trial_ends_at ?? null,
      created_at: t.created_at,
    });

    return {
      trials_expirados: trialsExpiradosRows.map(toItem),
      inadimplentes: inadimplentesRows.map(toItem),
    };
  }
}
