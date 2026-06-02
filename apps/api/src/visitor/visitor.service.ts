import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, QrToken } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClassificationService } from '../persons/classification.service';
import { VisitsService } from '../persons/visits.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RegisterVisitorDto } from './dto/register-visitor.dto';
import { CreateQrTokenDto } from './dto/create-qr-token.dto';

type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

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

  async registerViaQr(
    dto: RegisterVisitorDto,
    ip: string | undefined,
    userAgent: string | string[] | undefined,
  ): Promise<RegisterResult> {
    const qrToken = await this.prisma.qrToken.findUnique({
      where: { token: dto.token },
      include: { congregation: { select: { name: true } } },
    });

    if (!qrToken || !qrToken.is_active) {
      throw new NotFoundException('QR code inválido ou expirado');
    }

    await this.prisma.qrToken.update({
      where: { id: qrToken.id },
      data: { scan_count: { increment: 1 } },
    });

    const { person, isNewPerson } = await this.prisma.$transaction(
      async (tx: PrismaTx) => {
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

  async createQrToken(dto: CreateQrTokenDto, user: JwtPayload): Promise<QrToken> {
    return this.prisma.qrToken.create({
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
    return this.prisma.qrToken.findMany({
      where: {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async toggleQrToken(id: string, user: JwtPayload): Promise<QrToken> {
    const qr = await this.prisma.qrToken.findFirst({
      where: {
        id,
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
      },
    });

    if (!qr) throw new NotFoundException('QR token não encontrado');

    return this.prisma.qrToken.update({
      where: { id },
      data: { is_active: !qr.is_active },
    });
  }
}
