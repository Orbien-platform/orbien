import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PlanStatus, PlanType, Prisma, WaitlistStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';

/** Dias de trial de um tenant recém-provisionado. Mesmo valor do seed. */
const TRIAL_DAYS = 30;

/** Papel da conta inicial: transversal às congregações do tenant. */
const INITIAL_ADMIN_ROLE = 'tenant_admin';

export interface ProvisionedTenant {
  tenant_id: string;
  slug: string;
  congregation_id: string;
  admin_user_id: string;
}

/**
 * Cria um tenant inteiro — tenant, plano, branding, congregação, conta admin e
 * o papel dela — numa transação só.
 *
 * Até aqui isso só existia em `prisma/seed.ts`, rodando como `postgres` com
 * BYPASSRLS e fora da aplicação: não havia nenhum caminho pelo produto para
 * abrir uma igreja nova. Aqui roda como `app_user`, sob RLS, pelo ramo
 * `app_platform_access()` das policies — o que só funciona sem tenant no
 * contexto, ou seja, a partir de uma rota marcada com `@PlatformRoute()`.
 *
 * Atômico de propósito: um tenant com plano e sem congregação, ou com
 * congregação e sem conta admin, é pior que nenhum tenant — fica invisível
 * para quem provisionou e quebra o login de quem recebeu o convite. Pelo
 * mesmo motivo, quando `waitlist_lead_id` vem preenchido o lead é ativado
 * dentro da mesma transação: um tenant criado sem o lead marcado é o mesmo
 * tipo de estado meio-feito.
 */
@Injectable()
export class ProvisionTenantService {
  constructor(private readonly prisma: PrismaService) {}

  async provision(dto: ProvisionTenantDto): Promise<ProvisionedTenant> {
    const passwordHash = await argon2.hash(dto.admin_password);

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

    try {
      // runInTx reaproveita a transação que o TenantContextInterceptor já
      // abriu — se abrisse outra, ela não teria o `SET LOCAL ROLE app_user`
      // nem o `app.user_id`, e toda escrita cairia no ramo estrito da policy.
      return await this.prisma.runInTx(async (tx) => {
        // O papel é dado de referência global (`roles`), não do tenant. Se
        // faltar, a FK de role_assignments falharia no fim da transação com
        // uma mensagem sobre constraint; checar antes dá o motivo real.
        const role = await tx.role.findUnique({ where: { code: INITIAL_ADMIN_ROLE } });
        if (!role) {
          throw new InternalServerErrorException(
            `Papel '${INITIAL_ADMIN_ROLE}' não existe na tabela roles — banco não semeado.`,
          );
        }

        // Falhar cedo, antes de criar qualquer coisa: lead inexistente ou já
        // vinculado a outro tenant não deve custar um tenant órfão.
        if (dto.waitlist_lead_id) {
          const lead = await tx.waitlistSubscriber.findUnique({
            where: { id: dto.waitlist_lead_id },
          });
          if (!lead) {
            throw new NotFoundException(
              `Lead '${dto.waitlist_lead_id}' não encontrado na waitlist.`,
            );
          }
          if (lead.tenant_id) {
            throw new ConflictException(
              `Lead '${dto.waitlist_lead_id}' já está vinculado a outro tenant.`,
            );
          }
        }

        const tenant = await tx.tenant.create({
          data: {
            slug: dto.slug,
            name: dto.name,
            email: dto.email,
            phone: dto.phone,
          },
        });

        await tx.tenantPlan.create({
          data: {
            tenant_id: tenant.id,
            plan: dto.plan ?? PlanType.starter,
            status: PlanStatus.trial,
            trial_ends_at: trialEndsAt,
          },
        });

        await tx.brandingConfig.create({
          data: {
            tenant_id: tenant.id,
            app_name: dto.name,
          },
        });

        const congregation = await tx.congregation.create({
          data: {
            tenant_id: tenant.id,
            name: dto.congregation_name,
            timezone: dto.congregation_timezone ?? 'America/Sao_Paulo',
          },
        });

        const adminUser = await tx.userAccount.create({
          data: {
            tenant_id: tenant.id,
            congregation_id: congregation.id,
            email: dto.admin_email,
            password_hash: passwordHash,
          },
        });

        await tx.roleAssignment.create({
          data: {
            tenant_id: tenant.id,
            congregation_id: congregation.id,
            user_account_id: adminUser.id,
            role_code: INITIAL_ADMIN_ROLE,
          },
        });

        if (dto.waitlist_lead_id) {
          await tx.waitlistSubscriber.update({
            where: { id: dto.waitlist_lead_id },
            data: {
              status: WaitlistStatus.activated,
              activated_at: new Date(),
              tenant_id: tenant.id,
            },
          });
        }

        return {
          tenant_id: tenant.id,
          slug: tenant.slug,
          congregation_id: congregation.id,
          admin_user_id: adminUser.id,
        };
      });
    } catch (err) {
      // P2002 = unique constraint. O único campo único alcançável aqui é o
      // slug do tenant (o email do admin é único por tenant, e o tenant é
      // novo). Vira 409 em vez de 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Já existe um tenant com o slug '${dto.slug}'`);
      }
      throw err;
    }
  }
}
