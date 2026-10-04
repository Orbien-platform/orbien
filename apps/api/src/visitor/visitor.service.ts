import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, QrToken } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClassificationService } from '../persons/classification.service';
import { VisitsService } from '../persons/visits.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RegisterVisitorDto } from './dto/register-visitor.dto';
import { CreateQrTokenDto } from './dto/create-qr-token.dto';
import { RegisterVisitorByLeaderDto } from './dto/register-visitor-by-leader.dto';

type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface DuplicateMatch {
  id: string;
  full_name: string;
  classification: string;
  visits: number;
  last_visit_at: Date | null;
}

export type LeaderRegisterResult =
  | { status: 'duplicate'; matches: DuplicateMatch[] }
  | { status: 'registered'; person: { id: string; full_name: string }; reclassified: boolean }
  | { status: 'visit_recorded'; person: { id: string; full_name: string }; reclassified: boolean };

/** Só dígitos e o `+` inicial: "(11) 99999-0000" e "11999990000" são o mesmo
 * telefone. Grava normalizado; procura pelo normalizado e pelo que veio. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

/** Quantos possíveis duplicados a tela mostra — é uma escolha, não uma busca. */
const MAX_DUPLICATE_MATCHES = 5;

/** O que a página pública de autocadastro pode saber do QR antes do envio:
 * de qual igreja ele é e de onde veio. Nada de id, tenant ou contagem. */
export type PublicQrInfo = {
  church_name: string;
  origin: QrToken['origin'];
  label: string | null;
};

type RegisterResult =
  | { status: 'registered'; message: string }
  | { status: 'visit_recorded'; message: string };

@Injectable()
export class VisitorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classificationService: ClassificationService,
    private readonly visitsService: VisitsService,
  ) {}

  /**
   * PROD-34: a página pública de autocadastro mostra o nome da igreja antes
   * de o visitante preencher, e recusa logo um QR desativado — em vez de
   * deixar a pessoa digitar tudo para só então ouvir "inválido". Mesma leitura
   * sem contexto de tenant que `registerViaQr` já faz; devolve só o que a
   * página precisa mostrar.
   */
  async describeQr(token: string): Promise<PublicQrInfo> {
    const qrToken = await this.prisma.client.qrToken.findUnique({
      where: { token },
      select: {
        is_active: true,
        origin: true,
        label: true,
        congregation: { select: { name: true } },
      },
    });

    if (!qrToken || !qrToken.is_active) {
      throw new NotFoundException('QR code inválido ou expirado');
    }

    return {
      church_name: qrToken.congregation.name,
      origin: qrToken.origin,
      label: qrToken.label,
    };
  }

  async registerViaQr(
    dto: RegisterVisitorDto,
    ip: string | undefined,
    userAgent: string | string[] | undefined,
  ): Promise<RegisterResult> {
    const qrToken = await this.prisma.client.qrToken.findUnique({
      where: { token: dto.token },
      include: { congregation: { select: { name: true } } },
    });

    if (!qrToken || !qrToken.is_active) {
      throw new NotFoundException('QR code inválido ou expirado');
    }

    await this.prisma.client.qrToken.update({
      where: { id: qrToken.id },
      data: { scan_count: { increment: 1 } },
    });

    const { person, isNewPerson } = await this.prisma.runInTx(
      async (tx: PrismaTx) => {
        // O contexto de RLS vem do próprio QR token.
        //
        // Esta rota é pública: não há JWT, logo o TenantContextInterceptor não
        // roda e `app.tenant_id` fica nulo. `persons`, `consent_records` e
        // `visit_records` têm FORCE ROW LEVEL SECURITY com policy por tenant,
        // então toda escrita aqui era negada com 42501 — o cadastro de
        // visitante por QR nunca funcionou sob RLS. Ficou escondido atrás de um
        // TypeError anterior (ver PrismaService.client) até 2026-09-03.
        //
        // O que autoriza a escrita é o token: ele é emitido por alguém do
        // tenant, guarda `tenant_id` e `congregation_id`, e já foi validado
        // acima (existe e está ativo). O contexto é escrito a partir dele, e
        // não do que o visitante mandou — o corpo da requisição não influencia
        // qual tenant é gravado. `set_config(..., true)` é local à transação.
        await tx.$executeRaw`
          SELECT
            set_config('app.tenant_id',       ${qrToken.tenant_id},       true),
            set_config('app.congregation_id', ${qrToken.congregation_id}, true)
        `;

        let isNewPerson = true;
        let person: { id: string; full_name: string } | null = null;

        if (dto.phone) {
          person = await tx.person.findFirst({
            where: {
              phone: dto.phone,
              tenant_id: qrToken.tenant_id,
              congregation_id: qrToken.congregation_id,
            },
            select: { id: true, full_name: true },
          });
        }

        if (person) {
          isNewPerson = false;
        } else {
          person = await tx.person.create({
            data: {
              tenant_id: qrToken.tenant_id,
              congregation_id: qrToken.congregation_id,
              full_name: dto.full_name,
              phone: dto.phone ?? null,
              email: dto.email ?? null,
              gender: dto.gender ?? null,
              classification: 'visitor',
            },
            select: { id: true, full_name: true },
          });
        }

        await tx.consentRecord.create({
          data: {
            tenant_id: qrToken.tenant_id,
            congregation_id: qrToken.congregation_id,
            person_id: person.id,
            version: 'visitor_consent_v1',
            consented_at: new Date(),
            ip: ip ?? null,
            user_agent: Array.isArray(userAgent) ? userAgent[0] : (userAgent ?? null),
            origin: qrToken.origin,
          },
        });

        await tx.visitRecord.create({
          data: {
            tenant_id: qrToken.tenant_id,
            congregation_id: qrToken.congregation_id,
            person_id: person.id,
            origin: qrToken.origin,
            small_group_id: qrToken.small_group_id ?? null,
            visited_at: new Date(),
          },
        });

        await this.classificationService.checkAutoReclassification(
          person.id,
          qrToken.created_by,
          tx,
        );

        return { person, isNewPerson };
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    if (isNewPerson) {
      return {
        status: 'registered',
        message: `Cadastro realizado! Bem-vindo à ${qrToken.congregation.name}.`,
      };
    }

    const firstName = person.full_name.split(' ')[0];
    return {
      status: 'visit_recorded',
      message: `Tudo certo, ${firstName}! Sua presença foi registrada.`,
    };
  }

  /**
   * Cadastro de visitante pela liderança, no app (v2). Abre ao líder de
   * célula, que é quem recebe o visitante no encontro — o mesmo conjunto de
   * papéis que já registra visita (`POST /persons/visits`).
   *
   * Diferente do `POST /persons` do painel, que cria e depois avisa do
   * duplicado: aqui o duplicado por telefone vem **antes**, e quem decide é a
   * liderança ("é a mesma pessoa" registra a visita; "é outra pessoa" cria).
   * Em todos os caminhos a visita e o consentimento do visitante são
   * gravados juntos, e a reclassificação automática (3 visitas em 60 dias)
   * roda como no QR.
   */
  async registerByLeader(
    dto: RegisterVisitorByLeaderDto,
    user: JwtPayload,
  ): Promise<LeaderRegisterResult> {
    if (dto.origin === 'small_group' && !dto.small_group_id) {
      throw new BadRequestException('small_group_id é obrigatório quando origin = small_group');
    }

    const db = this.prisma.client;
    const phone = dto.phone ? normalizePhone(dto.phone) : '';

    if (dto.existing_person_id) {
      const existing = await db.person.findFirst({
        where: { id: dto.existing_person_id, deleted_at: null, anonymized_at: null },
        select: { id: true, full_name: true },
      });
      if (!existing) throw new NotFoundException('Pessoa não encontrada');
      const reclassified = await this.recordVisitAndConsent(existing.id, dto, user);
      return { status: 'visit_recorded', person: existing, reclassified };
    }

    if (phone && !dto.force_new) {
      const found = await db.person.findMany({
        where: {
          phone: { in: Array.from(new Set([phone, dto.phone!.trim()])) },
          deleted_at: null,
          anonymized_at: null,
        },
        take: MAX_DUPLICATE_MATCHES,
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          full_name: true,
          classification: true,
          _count: { select: { visitRecords: true } },
          visitRecords: { orderBy: { visited_at: 'desc' }, take: 1, select: { visited_at: true } },
        },
      });
      if (found.length > 0) {
        return {
          status: 'duplicate',
          matches: found.map((p) => ({
            id: p.id,
            full_name: p.full_name,
            classification: p.classification,
            visits: p._count.visitRecords,
            last_visit_at: p.visitRecords[0]?.visited_at ?? null,
          })),
        };
      }
    }

    let reclassified = false;
    const person = await this.prisma.runInTx(async (tx) => {
      const created = await tx.person.create({
        data: {
          tenant_id: user.tenant_id,
          congregation_id: user.congregation_id,
          full_name: dto.full_name!.trim(),
          phone: phone || null,
          email: dto.email?.trim() || null,
          gender: dto.gender ?? null,
          classification: 'visitor',
        },
        select: { id: true, full_name: true },
      });
      reclassified = await this.recordVisitAndConsent(created.id, dto, user, tx);
      return created;
    });

    return { status: 'registered', person, reclassified };
  }

  /** Consentimento do visitante + visita + reclassificação, na mesma
   * transação — o mapeamento LGPD (§3.2) não admite visitante gravado sem o
   * consentimento correspondente. */
  private async recordVisitAndConsent(
    personId: string,
    dto: RegisterVisitorByLeaderDto,
    user: JwtPayload,
    tx?: PrismaTx,
  ): Promise<boolean> {
    const run = async (t: PrismaTx) => {
      const now = new Date();
      await t.consentRecord.create({
        data: {
          tenant_id: user.tenant_id,
          congregation_id: user.congregation_id,
          person_id: personId,
          version: 'visitor_consent_v1',
          consented_at: now,
          ip: null,
          user_agent: 'app: cadastro pela liderança',
          origin: dto.origin,
        },
      });
      await t.visitRecord.create({
        data: {
          tenant_id: user.tenant_id,
          congregation_id: user.congregation_id,
          person_id: personId,
          origin: dto.origin,
          small_group_id: dto.small_group_id ?? null,
          visited_at: now,
        },
      });
      return this.classificationService.checkAutoReclassification(personId, user.sub, t);
    };
    return tx ? run(tx) : this.prisma.runInTx(run);
  }

  async createQrToken(dto: CreateQrTokenDto, user: JwtPayload): Promise<QrToken> {
    return this.prisma.client.qrToken.create({
      data: {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        origin: dto.origin,
        small_group_id: dto.small_group_id ?? null,
        label: dto.label ?? null,
        is_active: dto.is_active ?? true,
        created_by: user.sub,
      },
    });
  }

  async listQrTokens(user: JwtPayload): Promise<QrToken[]> {
    return this.prisma.client.qrToken.findMany({
      where: {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async toggleQrToken(id: string, user: JwtPayload): Promise<QrToken> {
    const qr = await this.prisma.client.qrToken.findFirst({
      where: {
        id,
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
      },
    });

    if (!qr) throw new NotFoundException('QR token não encontrado');

    return this.prisma.client.qrToken.update({
      where: { id },
      data: { is_active: !qr.is_active },
    });
  }
}
