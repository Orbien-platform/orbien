/**
 * RLS — `pix_webhook_scope()` (024_rls_pix_webhook_scope.sql)
 *
 * O webhook da Asaas roda como `orbien_app` SEM contexto de tenant, e
 * `pix_payments`/`pix_subscriptions` não aparecem para ele. A função
 * SECURITY DEFINER é o único caminho "id da Asaas → escopo". Estes testes
 * medem as quatro promessas dela: acha o escopo certo, devolve só ids, não
 * abre a tabela, e não é chamável por quem não deve.
 *
 * Só `teste1-church` e `teste2-church` (docs/AMBIENTES.md). As linhas criadas
 * aqui têm `asaas_payment_id` com sufixo único e são apagadas no `afterAll`.
 */

import { prisma, prismaAdmin, runAsTenantWithRole } from '../helpers/rls';
import { loadTestTenant, TestTenant } from '../helpers/test-tenants';

const ts = Date.now();
const payId = `scope-pay-${ts}`;
const subId = `scope-sub-${ts}`;

let t1: TestTenant;
let t2: TestTenant;
let pixPaymentId: string;
let subscriptionId: string;
let donorId: string;

type ScopeRow = { scope_tenant_id: string; scope_congregation_id: string };

async function scopeOf(paymentId: string, subscription?: string): Promise<ScopeRow[]> {
  return prisma.$queryRaw<ScopeRow[]>`
    SELECT * FROM pix_webhook_scope(${paymentId}, ${subscription ?? null})
  `;
}

beforeAll(async () => {
  t1 = await loadTestTenant(prismaAdmin, 'teste1-church');
  t2 = await loadTestTenant(prismaAdmin, 'teste2-church');

  pixPaymentId = (
    await prismaAdmin.pixPayment.create({
      data: {
        tenant_id: t2.tenantId,
        congregation_id: t2.congregationId,
        scenario: 'dynamic',
        status: 'pending',
        amount: '10.00',
        asaas_payment_id: payId,
        category_id: t2.ofertaCategoryId,
      },
    })
  ).id;

  donorId = (
    await prismaAdmin.person.create({
      data: {
        tenant_id: t1.tenantId,
        congregation_id: t1.congregationId,
        full_name: `Dizimista scope ${ts}`,
        classification: 'member',
        gender: 'male',
      },
    })
  ).id;
  subscriptionId = (
    await prismaAdmin.pixSubscription.create({
      data: {
        tenant_id: t1.tenantId,
        congregation_id: t1.congregationId,
        donor_person_id: donorId,
        category_id: t1.ofertaCategoryId,
        amount: '25.00',
        asaas_subscription_id: subId,
        status: 'active',
        created_by_user_id: (
          await prismaAdmin.userAccount.findFirstOrThrow({
            where: { tenant_id: t1.tenantId },
            select: { id: true },
          })
        ).id,
      },
    })
  ).id;
}, 60_000);

afterAll(async () => {
  await prismaAdmin.pixPayment.deleteMany({ where: { id: pixPaymentId } });
  await prismaAdmin.pixSubscription.deleteMany({ where: { id: subscriptionId } });
  await prismaAdmin.person.deleteMany({ where: { id: donorId } });
  await prismaAdmin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

describe('pix_webhook_scope() — webhook sem contexto de tenant', () => {
  it('sem a função, orbien_app sem contexto não enxerga a linha (a razão de ela existir)', async () => {
    const rows = await prisma.pixPayment.findMany({ where: { asaas_payment_id: payId } });

    expect(rows).toHaveLength(0);
  });

  it('devolve tenant e congregação do pagamento, mesmo sem contexto', async () => {
    const rows = await scopeOf(payId);

    expect(rows).toEqual([
      { scope_tenant_id: t2.tenantId, scope_congregation_id: t2.congregationId },
    ]);
  });

  it('devolve só os dois ids — nenhuma coluna da linha (valor, chave, doador)', async () => {
    const rows = await scopeOf(payId);

    expect(Object.keys(rows[0]).sort()).toEqual(['scope_congregation_id', 'scope_tenant_id']);
  });

  it('id da Asaas desconhecido devolve vazio', async () => {
    expect(await scopeOf(`nao-existe-${ts}`)).toEqual([]);
  });

  it('resolve pela assinatura quando o pagamento ainda não existe (cobrança recorrente nova)', async () => {
    const rows = await scopeOf(`cobranca-futura-${ts}`, subId);

    expect(rows).toEqual([
      { scope_tenant_id: t1.tenantId, scope_congregation_id: t1.congregationId },
    ]);
  });

  it('o pagamento tem prioridade sobre a assinatura', async () => {
    const rows = await scopeOf(payId, subId);

    expect(rows).toEqual([
      { scope_tenant_id: t2.tenantId, scope_congregation_id: t2.congregationId },
    ]);
  });

  it('assinatura nula não casa com nada', async () => {
    expect(await scopeOf(`nao-existe-${ts}`, undefined)).toEqual([]);
  });

  it('app_user não executa a função — requisição autenticada não resolve escopo por id da Asaas', async () => {
    await expect(
      runAsTenantWithRole(t1.tenantId, t1.congregationId, (tx) =>
        tx.$queryRaw`SELECT * FROM pix_webhook_scope(${payId}, ${null})`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('com contexto do tenant dono, a linha passa a ser visível (o escopo devolvido serve para a RLS normal)', async () => {
    const row = await runAsTenantWithRole(t2.tenantId, t2.congregationId, (tx) =>
      tx.pixPayment.findFirst({ where: { asaas_payment_id: payId } }),
    );

    expect(row?.id).toBe(pixPaymentId);
  });
});
