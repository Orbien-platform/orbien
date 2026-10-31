import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConsentRecord } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KidsActor, KidsChildAccessService } from '../children/kids-child-access.service';
import {
  KIDS_CONSENT_ORIGINS,
  KIDS_TERM_TEXT,
  KIDS_TERM_VERSION,
  KidsConsentOrigin,
} from './kids-consent.terms';

/**
 * Consentimento do responsável para o módulo Kids (KIDS-06, LGPD Art. 14).
 * Vigente = existe `ConsentRecord` de origem `kids`/`secretaria` não revogado.
 * Outras origens (formulário de visitante etc.) não valem para criança.
 * Revogar mantém a linha (histórico até a retenção); o bloqueio do check-in
 * usa `hasValidConsent` na F4.
 */
@Injectable()
export class KidsConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KidsChildAccessService,
  ) {}

  /**
   * Quem é o responsável do pedido: o dono da conta, ou — só para a gestão —
   * outra pessoa (a secretaria agindo por ele, origem `secretaria`).
   */
  private async target(actor: KidsActor, guardianPersonId?: string) {
    const own = await this.access.ownPersonId(actor.userId);
    if (!guardianPersonId || guardianPersonId === own) {
      if (!own) throw new ForbiddenException('Conta sem cadastro de pessoa vinculado');
      return { personId: own, onBehalf: false };
    }
    if (!this.access.isManager(actor.roles)) {
      throw new ForbiddenException('Só a equipe registra o consentimento por outra pessoa');
    }
    return { personId: guardianPersonId, onBehalf: true };
  }

  /** Situação do consentimento e o termo vigente (o app mostra antes do aceite). */
  async status(actor: KidsActor, guardianPersonId?: string) {
    const { personId } = await this.target(actor, guardianPersonId);
    return {
      valid: await this.hasValidConsent(personId),
      term_version: KIDS_TERM_VERSION,
      term_text: KIDS_TERM_TEXT,
    };
  }

  /** Aceite do termo. A versão enviada tem de ser a vigente (409 se o termo mudou). */
  async register(
    actor: KidsActor,
    input: { term_version: string; guardian_person_id?: string },
    meta: { ip?: string | null; userAgent?: string | null },
  ) {
    if (input.term_version !== KIDS_TERM_VERSION) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'kids_term_outdated',
        message: 'O termo foi atualizado; leia a versão vigente antes de aceitar',
        term_version: KIDS_TERM_VERSION,
        term_text: KIDS_TERM_TEXT,
      });
    }
    const { personId, onBehalf } = await this.target(actor, input.guardian_person_id);
    const record = await this.grant(actor.tenantId, actor.congregationId, personId, onBehalf ? 'secretaria' : 'kids', meta);
    return { valid: true, version: record.version, origin: record.origin, consented_at: record.consented_at };
  }

  async revokeFor(actor: KidsActor, input: { guardian_person_id?: string; reason?: string }) {
    const { personId } = await this.target(actor, input.guardian_person_id);
    return this.revoke(personId, input.reason);
  }

  async hasValidConsent(guardianPersonId: string): Promise<boolean> {
    const record = await this.prisma.client.consentRecord.findFirst({
      where: { person_id: guardianPersonId, origin: { in: [...KIDS_CONSENT_ORIGINS] }, revoked_at: null },
      select: { id: true },
    });
    return record !== null;
  }

  async assertValidConsent(guardianPersonId: string): Promise<void> {
    if (await this.hasValidConsent(guardianPersonId)) return;
    throw new UnprocessableEntityException({
      statusCode: 422,
      error: 'Unprocessable Entity',
      code: 'kids_consent_required',
      message: 'É preciso o consentimento do responsável para cadastrar a criança',
      term_version: KIDS_TERM_VERSION,
      term_text: KIDS_TERM_TEXT,
    });
  }

  async grant(
    tenantId: string,
    congregationId: string,
    guardianPersonId: string,
    origin: KidsConsentOrigin,
    meta: { ip?: string | null; userAgent?: string | null },
  ): Promise<ConsentRecord> {
    const guardian = await this.prisma.client.person.findFirst({
      where: { id: guardianPersonId, tenant_id: tenantId, congregation_id: congregationId, is_child: false, deleted_at: null },
      select: { id: true },
    });
    if (!guardian) throw new NotFoundException('Responsável não encontrado');

    const current = await this.prisma.client.consentRecord.findFirst({
      where: { person_id: guardianPersonId, origin: { in: [...KIDS_CONSENT_ORIGINS] }, revoked_at: null },
    });
    if (current) return current;

    return this.prisma.client.consentRecord.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        person_id: guardianPersonId,
        version: KIDS_TERM_VERSION,
        consented_at: new Date(),
        origin,
        ip: meta.ip ?? null,
        user_agent: meta.userAgent ?? null,
      },
    });
  }

  async revoke(guardianPersonId: string, reason?: string): Promise<{ revoked: number }> {
    const { count } = await this.prisma.client.consentRecord.updateMany({
      where: { person_id: guardianPersonId, origin: { in: [...KIDS_CONSENT_ORIGINS] }, revoked_at: null },
      data: { revoked_at: new Date(), revocation_reason: reason ?? null },
    });
    return { revoked: count };
  }
}
