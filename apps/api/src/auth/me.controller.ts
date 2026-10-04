import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { readableAreas, upgradeAreas, type ProductArea } from './product-areas';
import { asaasPaymentsEnabled } from '../financial/asaas-payments.flag';

/**
 * O que esta sessão enxerga, segundo o servidor.
 *
 * Existe para o front parar de adivinhar. O `apps/web` repetia em
 * `src/lib/permissions.ts` os papéis de leitura de seis áreas — a mesma
 * informação que vive no `@Roles` de cada controller — só para não desenhar
 * link que levaria a 403. A regra do monorepo impede o import direto (nada da
 * Vercel importa `apps/api`, e um pacote compartilhado acoplaria os deploys
 * por versão), então o caminho é este: a API responde, o front obedece.
 *
 * **Não é autoridade de acesso, é informação sobre ela.** Quem nega continua
 * sendo o `RolesGuard` em cada rota, e o RLS por baixo. Uma resposta errada
 * aqui desenha link a mais (a tela responde "sem acesso") ou link a menos (a
 * tela segue alcançável pela URL) — em nenhum caso abre dado.
 *
 * Sem `@Roles`: qualquer sessão autenticada pergunta o que *ela* alcança, e a
 * resposta é derivada do próprio token de quem pergunta. Está na allowlist de
 * `roles-invariant.spec.ts` por isso.
 */
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  /**
   * `features` diz o que está ligado no produto, independente de papel —
   * hoje só a trava de pagamentos pela Asaas (`asaas-payments.flag.ts`).
   * Os fronts escondem o que depende dela; quem nega de verdade é a API.
   *
   * `plan` é o plano da igreja, lido do mesmo lugar que o `PlanGuard` lê
   * (`user.plan` do token, escrito a partir de `TenantPlan.plan` em todo
   * login, refresh e impersonação — na sessão de suporte, o plano do tenant
   * alvo). Serve ao front para marcar o que é Premium e mostrar o convite no
   * Starter, em vez de esconder. Como o resto desta rota, é informação: quem
   * nega o recurso Premium continua sendo o `PlanGuard`.
   *
   * `upgrade_areas` são as áreas que o papel leria no Premium e o plano atual
   * barra — o que o front mostra com coroa e convite. Vazio no Premium.
   */
  @Get('permissions')
  permissions(@CurrentUser() user: JwtPayload): {
    areas: ProductArea[];
    upgrade_areas: ProductArea[];
    plan: 'starter' | 'premium';
    features: { asaas_payments: boolean };
  } {
    return {
      areas: readableAreas(user),
      upgrade_areas: upgradeAreas(user),
      plan: user.plan,
      features: { asaas_payments: asaasPaymentsEnabled() },
    };
  }
}
