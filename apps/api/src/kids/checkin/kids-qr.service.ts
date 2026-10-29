import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { KidsActor, KidsChildAccessService } from '../children/kids-child-access.service';

/** "Poucos minutos": o QR de check-in vive o tempo de chegar ao balcão. */
export const KIDS_QR_TTL_SECONDS = 300;

const CHECKIN_PREFIX = 'kidsci1';
const CHECKOUT_PREFIX = 'kidsco1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_RE = /^[A-Za-z0-9_-]{43}$/;

export type KidsQrConsumeResult =
  | { ok: true; child_id: string; guardian_person_id: string }
  | { ok: false; reason: 'malformed' | 'unknown' | 'forged' | 'expired' | 'used' };

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * QR do Kids (R3-1). O QR é só um PORTADOR dos segredos que já existem; o
 * código de retirada continua sendo o segredo.
 *
 *  - **Check-in** (`kidsci1.<id>.<segredo>`): o responsável pede ao servidor um
 *    QR para UMA criança; vale poucos minutos e uma única leitura, e fica preso
 *    à criança + ao responsável que o emitiu. Só o hash do segredo é guardado.
 *  - **Check-out** (`kidsco1.<checkin_id>.<código>.<assinatura>`): o código do
 *    check-in aberto, embutido e assinado com HMAC; quem o lê tem o mesmo que
 *    teria digitando o código. Dura enquanto o check-in estiver aberto.
 *
 * Quem o lê responde sempre com o mesmo 403 genérico, seja QR expirado, usado
 * ou forjado: o motivo só existe aqui e na auditoria.
 */
@Injectable()
export class KidsQrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KidsChildAccessService,
  ) {}

  // ── Check-out: código assinado ───────────────────────────────────────────

  signCheckout(checkinId: string, code: string): string {
    return `${CHECKOUT_PREFIX}.${checkinId}.${code}.${this.checkoutSignature(checkinId, code)}`;
  }

  /** O código embutido, se a assinatura confere E o QR é do check-in esperado. */
  codeFromCheckoutQr(qr: string, expectedCheckinId: string): string | null {
    const parts = (qr ?? '').trim().split('.');
    if (parts.length !== 4 || parts[0] !== CHECKOUT_PREFIX) return null;
    const [, checkinId, code, signature] = parts as [string, string, string, string];
    if (checkinId !== expectedCheckinId) return null;
    return safeEqual(signature, this.checkoutSignature(checkinId, code)) ? code : null;
  }

  private checkoutSignature(checkinId: string, code: string): string {
    return createHmac('sha256', this.key()).update(`co|${checkinId}|${code}`).digest('base64url');
  }

  // Chave derivada do JWT_SECRET (já obrigatório na API), lida a cada uso para
  // não exigir config no boot do módulo.
  private key(): Buffer {
    const secret = process.env['JWT_SECRET'];
    if (!secret) throw new InternalServerErrorException('Segredo do QR não configurado');
    return createHmac('sha256', secret).update('orbien-kids-qr-v1').digest();
  }

  // ── Check-in: QR emitido pelo servidor ───────────────────────────────────

  /**
   * Emite o QR de check-in da criança para o responsável logado. Só quem é
   * responsável cadastrado (`KidsGuardian`) e membro adulto do Household da
   * criança — sem atalho para a gestão, que usa o check-in normal. Emitir de
   * novo invalida os anteriores ainda não usados do par.
   */
  async issueCheckin(actor: KidsActor, childId: string) {
    const ownId = await this.access.requireOwnPersonId(actor.userId);
    const scope = { tenant_id: actor.tenantId, congregation_id: actor.congregationId };

    const child = await this.prisma.client.person.findFirst({
      where: { id: childId, ...scope, is_child: true, deleted_at: null },
      select: { id: true },
    });
    const link = child
      ? await this.prisma.client.householdMember.findFirst({
          where: {
            person_id: childId,
            role: 'child',
            household: { members: { some: { person_id: ownId, role: { not: 'child' } } } },
          },
          select: { id: true },
        })
      : null;
    const guardian = link
      ? await this.prisma.client.kidsGuardian.findFirst({
          where: { child_id: childId, guardian_person_id: ownId },
          select: { id: true },
        })
      : null;
    if (!child || !link || !guardian) throw new NotFoundException('Criança não encontrada');

    const open = await this.prisma.client.kidsCheckin.findFirst({
      where: { child_id: childId, ...scope, checked_out_at: null },
      select: { id: true },
    });
    if (open) throw new ConflictException('Esta criança já está presente');

    await this.prisma.client.kidsCheckinQrToken.deleteMany({
      where: { child_id: childId, guardian_person_id: ownId, used_at: null },
    });
    const secret = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + KIDS_QR_TTL_SECONDS * 1000);
    const token = await this.prisma.client.kidsCheckinQrToken.create({
      data: {
        ...scope,
        child_id: childId,
        guardian_person_id: ownId,
        issued_by: actor.userId,
        secret_hash: sha256(secret),
        expires_at: expiresAt,
      },
    });
    return {
      qr: `${CHECKIN_PREFIX}.${token.id}.${secret}`,
      child_id: childId,
      guardian_person_id: ownId,
      expires_at: expiresAt,
      ttl_seconds: KIDS_QR_TTL_SECONDS,
    };
  }

  /**
   * Lê e CONSOME o QR de check-in (uso único, atômico). Roda dentro da
   * transação da requisição: se o check-in que vem depois falhar (409, 422…),
   * a leitura é desfeita e o QR segue valendo até expirar.
   */
  async consumeCheckin(actor: KidsActor, qr: string): Promise<KidsQrConsumeResult> {
    const parts = (qr ?? '').trim().split('.');
    if (parts.length !== 3 || parts[0] !== CHECKIN_PREFIX) return { ok: false, reason: 'malformed' };
    const [, id, secret] = parts as [string, string, string];
    if (!UUID_RE.test(id) || !SECRET_RE.test(secret)) return { ok: false, reason: 'malformed' };

    const token = await this.prisma.client.kidsCheckinQrToken.findFirst({
      where: { id, tenant_id: actor.tenantId, congregation_id: actor.congregationId },
    });
    if (!token) return { ok: false, reason: 'unknown' };
    if (!safeEqual(token.secret_hash, sha256(secret))) return { ok: false, reason: 'forged' };
    const now = new Date();
    if (token.used_at) return { ok: false, reason: 'used' };
    if (token.expires_at <= now) return { ok: false, reason: 'expired' };

    const { count } = await this.prisma.client.kidsCheckinQrToken.updateMany({
      where: { id: token.id, used_at: null, expires_at: { gt: now } },
      data: { used_at: now, used_by: actor.userId },
    });
    if (count === 0) return { ok: false, reason: 'used' };
    return { ok: true, child_id: token.child_id, guardian_person_id: token.guardian_person_id };
  }
}
