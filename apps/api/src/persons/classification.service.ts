import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClassificationHistory, PrismaClient, PersonClassification } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Interactive transaction client — excludes lifecycle/meta methods
type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

@Injectable()
export class ClassificationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs inside the caller's transaction (tx).
   * No-op if the person is already at toClassification.
   */
  async reclassify(
    personId: string,
    toClassification: PersonClassification,
    reason: string,
    changedByUserId: string,
    tx: PrismaTx,
  ): Promise<void> {
    const person = await tx.person.findUnique({
      where: { id: personId },
      select: { id: true, classification: true, tenant_id: true, congregation_id: true },
    });

    if (!person) throw new NotFoundException('Pessoa não encontrada');
    if (person.classification === toClassification) return;

    await tx.person.update({
      where: { id: personId },
      data: { classification: toClassification },
    });

    await tx.classificationHistory.create({
      data: {
        tenant_id: person.tenant_id,
        congregation_id: person.congregation_id,
        person_id: personId,
        from_classification: person.classification,
        to_classification: toClassification,
        changed_by_user_id: changedByUserId,
        reason,
        changed_at: new Date(),
      },
    });
  }

  /**
   * Triggers auto-reclassification: visitor → attendee after 3 visits in 60 days.
   * Runs inside the caller's transaction so the just-created VisitRecord is counted.
   * Returns true if reclassification was applied.
   */
  async checkAutoReclassification(
    personId: string,
    changedByUserId: string,
    tx: PrismaTx,
  ): Promise<boolean> {
    const person = await tx.person.findUnique({
      where: { id: personId },
      select: { classification: true },
    });

    if (!person || person.classification !== PersonClassification.visitor) return false;

    const since = new Date();
    since.setDate(since.getDate() - 60);

    const count = await tx.visitRecord.count({
      where: { person_id: personId, visited_at: { gte: since } },
    });

    if (count >= 3) {
      await this.reclassify(
        personId,
        PersonClassification.attendee,
        'Reclassificação automática — 3 visitas em 60 dias',
        changedByUserId,
        tx,
      );
      return true;
    }

    return false;
  }

  /**
   * Manual reclassification entry point — opens its own transaction.
   * Validates membership_date when promoting to member.
   */
  async manualReclassify(
    personId: string,
    toClassification: PersonClassification,
    reason: string | undefined,
    changedByUserId: string,
  ): Promise<void> {
    if (toClassification === PersonClassification.member) {
      const person = await this.prisma.person.findUnique({
        where: { id: personId },
        select: { membership_date: true },
      });
      if (!person) throw new NotFoundException('Pessoa não encontrada');
      if (!person.membership_date) {
        throw new BadRequestException(
          'Preencha a data de membresia na ficha antes de promover para membro',
        );
      }
    }

    await this.prisma.$transaction(
      async (tx) => {
        await this.reclassify(
          personId,
          toClassification,
          reason ?? 'Reclassificação manual',
          changedByUserId,
          tx,
        );
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }

  async findHistory(personId: string): Promise<ClassificationHistory[]> {
    return this.prisma.classificationHistory.findMany({
      where: { person_id: personId },
      orderBy: { changed_at: 'desc' },
    });
  }
}
