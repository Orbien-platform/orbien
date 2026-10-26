import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConsentRecord } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

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
