import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { writeAuditLog } from '../common/audit/write-audit-log';
import { UpdateMyDataDto } from './dto/update-my-data.dto';

/**
 * Direitos do titular em autosserviço (LGPD, Art. 18 — `CONF-03` em
 * docs/PLANO.md, seção 4 de docs/produto/orbien-lgpd-mapping.md).
 *
 * **Quem é o titular** é sempre `user_accounts.person_id` da conta do token,
 * resolvido no banco — nunca um id vindo da requisição. Mesmo desenho de
 * `DonorPixSubscriptionsService`. Conta sem pessoa vinculada (conta de
 * equipe criada sem cadastro) recebe 404: não há dado pessoal de igreja a
 * mostrar, e o pedido segue pelo canal do encarregado (§4.1).
 *
 * **Exclusão** reaproveita o que já existe: o pedido marca `deleted_at` na
 * pessoa, e o job diário `purgeExpiredSoftDeletes` anonimiza 30 dias depois
 * (`PersonsRetentionScheduler`). Até lá o titular cancela — o cadastro volta
 * como estava. A conta de acesso continua ativa nesse intervalo, justamente
 * para que o cancelamento seja possível "entrando no app" (v2).
 *
 * O mesmo `deleted_at` é gravado quando o **admin** remove a pessoa
 * (`PersonsService.remove`, ação `person.deleted`). O titular só pode desfazer
 * o que ele mesmo pediu: quem diz a origem da marca é a última entre
 * `person.deletion_requested` e `person.deleted` em `audit_logs`. Por isso o
 * pedido e o cancelamento gravam a auditoria **dentro** da transação (como
 * `PersonsService.writeAuditLog`) — um registro perdido deixaria o titular
 * sem conseguir cancelar.
 */
export const DELETION_GRACE_DAYS = 30;

const PERSON_FIELDS = {
  id: true,
  full_name: true,
  phone: true,
  email: true,
  birth_date: true,
  gender: true,
  marital_status: true,
  profession: true,
  address_street: true,
  address_number: true,
  address_complement: true,
  address_neighborhood: true,
  address_city: true,
  address_state: true,
  address_zip: true,
  photo_url: true,
  baptism_date: true,
  membership_date: true,
  classification: true,
  created_at: true,
  deleted_at: true,
  anonymized_at: true,
} satisfies Prisma.PersonSelect;

type MyPerson = Prisma.PersonGetPayload<{ select: typeof PERSON_FIELDS }>;

/** Campos que `PATCH /me` aceita — espelho de `UpdateMyDataDto`. */
const EDITABLE_FIELDS = [
  'full_name',
  'phone',
  'birth_date',
  'address_street',
  'address_number',
  'address_complement',
  'address_neighborhood',
  'address_city',
  'address_state',
  'address_zip',
] as const;

export interface DeletionStatus {
  requested_at: Date | null;
  /** Data a partir da qual o job anonimiza. Nulo sem pedido. */
  anonymize_after: Date | null;
  /** O titular pode desfazer: só quando a marca é um pedido dele, não uma
   * remoção feita pela igreja. */
  cancellable: boolean;
}

const SUBJECT_REQUEST = 'person.deletion_requested';
const ADMIN_REMOVAL = 'person.deleted';

export interface PersonalData {
  person: Omit<MyPerson, 'deleted_at' | 'anonymized_at'>;
  consents: Array<{
    id: string;
    version: string;
    consented_at: Date;
    origin: string | null;
    revoked_at: Date | null;
    revocation_reason: string | null;
  }>;
  classification_history: Array<{
    from_classification: string;
    to_classification: string;
    reason: string | null;
    changed_at: Date;
  }>;
  groups: Array<{ small_group_id: string; name: string; role: string; joined_at: Date }>;
  visits: Array<{ origin: string; visited_at: Date }>;
  donations: Array<{
    occurred_at: Date;
    amount: string;
    description: string | null;
    category: string;
    status: string;
  }>;
  deletion: DeletionStatus;
}

@Injectable()
export class MePrivacyService {
  private readonly logger = new Logger(MePrivacyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** `GET /me/personal-data` — confirmação e acesso (Art. 18, I e II). */
  async personalData(user: JwtPayload): Promise<PersonalData> {
    const person = await this.myPerson(user);
    const db = this.prisma.client;

    const [consents, history, memberships, visits, donations] = await Promise.all([
      db.consentRecord.findMany({
        where: { person_id: person.id },
        orderBy: { consented_at: 'desc' },
        select: {
          id: true,
          version: true,
          consented_at: true,
          origin: true,
          revoked_at: true,
          revocation_reason: true,
        },
      }),
      db.classificationHistory.findMany({
        where: { person_id: person.id },
        orderBy: { changed_at: 'desc' },
        select: { from_classification: true, to_classification: true, reason: true, changed_at: true },
      }),
      db.groupMembership.findMany({
        where: { person_id: person.id },
        orderBy: { joined_at: 'desc' },
        select: {
          small_group_id: true,
          role: true,
          joined_at: true,
          smallGroup: { select: { name: true } },
        },
      }),
      db.visitRecord.findMany({
        where: { person_id: person.id },
        orderBy: { visited_at: 'desc' },
        select: { origin: true, visited_at: true },
      }),
      // Só as doações próprias, e nunca as anônimas: a pessoa marcou que não
      // queria o nome ligado àquela doação, e o relatório não religa.
      db.financialTransaction.findMany({
        where: { donor_person_id: person.id, is_anonymous: false },
        orderBy: { occurred_at: 'desc' },
        select: {
          occurred_at: true,
          amount: true,
          description: true,
          status: true,
          category: { select: { name: true } },
        },
      }),
    ]);

    const { deleted_at, anonymized_at: _anonymizedAt, ...publicPerson } = person;

    return {
      person: publicPerson,
      consents,
      classification_history: history,
      groups: memberships.map((m) => ({
        small_group_id: m.small_group_id,
        name: m.smallGroup.name,
        role: m.role,
        joined_at: m.joined_at,
      })),
      visits,
      donations: donations.map((d) => ({
        occurred_at: d.occurred_at,
        amount: d.amount.toFixed(2),
        description: d.description,
        category: d.category.name,
        status: d.status,
      })),
      deletion: deletionStatus(
        deleted_at,
        deleted_at ? await this.requestedBySubject(person.id) : false,
      ),
    };
  }

  /**
   * `GET /me/export` — portabilidade (Art. 18, V). O mesmo conteúdo do
   * acesso, num documento versionado e datado para o titular guardar ou
   * levar a outro lugar. JSON, e não o ZIP do mapeamento (§4.4): não há
   * arquivo de foto guardado pela Orbien para empacotar — `photo_url` já é
   * um link —, e um documento só é o que o app consegue compartilhar sem
   * dependência nativa nova.
   */
  async exportData(user: JwtPayload): Promise<{ format: string; exported_at: Date } & PersonalData> {
    const data = await this.personalData(user);
    await writeAuditLog(
      this.prisma,
      {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        actor_user_id: user.sub,
        subject_person_id: data.person.id,
        entity: 'person',
        action: 'person.data_exported',
      },
      this.logger,
    );
    return { format: 'orbien.personal-data.v1', exported_at: new Date(), ...data };
  }

  /** `PATCH /me` — correção (Art. 18, III), com antes/depois na auditoria. */
  async updateMyData(dto: UpdateMyDataDto, user: JwtPayload) {
    const person = await this.myPerson(user);
    const data: Prisma.PersonUpdateInput = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    for (const field of EDITABLE_FIELDS) {
      const value = dto[field];
      if (value === undefined) continue;
      const normalized = typeof value === 'string' ? value.trim() || null : value;
      if (field === 'full_name' && !normalized) continue;
      (data as Record<string, unknown>)[field] = normalized;
      before[field] = person[field];
      after[field] = normalized;
    }

    if (Object.keys(data).length === 0) {
      const { deleted_at: _d, anonymized_at: _a, ...unchanged } = person;
      return unchanged;
    }

    const { deleted_at: _deletedAt, anonymized_at: _anonymizedAt, ...updated } =
      await this.prisma.client.person.update({
        where: { id: person.id },
        data,
        select: PERSON_FIELDS,
      });

    await writeAuditLog(
      this.prisma,
      {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        actor_user_id: user.sub,
        subject_person_id: person.id,
        entity: 'person',
        action: 'person.self_updated',
        before,
        after,
      },
      this.logger,
    );

    return updated;
  }

  /** `POST /me/revoke-consent` — revogação (Art. 18, IX). */
  async revokeConsent(version: string, user: JwtPayload): Promise<{ revoked: number }> {
    const person = await this.myPerson(user);
    const { count } = await this.prisma.client.consentRecord.updateMany({
      where: { person_id: person.id, version, revoked_at: null },
      data: { revoked_at: new Date(), revocation_reason: 'Revogado pelo titular' },
    });

    if (count === 0) {
      throw new NotFoundException('Não há consentimento ativo com essa versão');
    }

    await writeAuditLog(
      this.prisma,
      {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        actor_user_id: user.sub,
        subject_person_id: person.id,
        entity: 'consent_record',
        action: 'consent.revoked',
        after: { version, revoked: count },
      },
      this.logger,
    );

    return { revoked: count };
  }

  /** `POST /me/deletion-request` — pede a exclusão (Art. 18, VI). */
  async requestDeletion(user: JwtPayload): Promise<DeletionStatus> {
    const person = await this.myPerson(user);
    // Pedir de novo não reinicia o prazo: devolve o pedido que já existe.
    if (person.deleted_at) {
      return deletionStatus(person.deleted_at, await this.requestedBySubject(person.id));
    }

    const requestedAt = new Date();
    await this.prisma.client.person.update({
      where: { id: person.id },
      data: { deleted_at: requestedAt },
    });
    await this.auditInTx(user, person.id, SUBJECT_REQUEST);

    return deletionStatus(requestedAt, true);
  }

  /** `DELETE /me/deletion-request` — cancela o pedido dentro do prazo. */
  async cancelDeletion(user: JwtPayload): Promise<DeletionStatus> {
    const person = await this.myPerson(user);
    if (!person.deleted_at) throw new NotFoundException('Não há pedido de exclusão em aberto');
    if (!(await this.requestedBySubject(person.id))) {
      throw new ConflictException(
        'O cadastro foi removido pela igreja. Para revertê-lo, fale com a secretaria.',
      );
    }

    await this.prisma.client.person.update({
      where: { id: person.id },
      data: { deleted_at: null },
    });
    await this.auditInTx(user, person.id, 'person.deletion_cancelled');

    return deletionStatus(null, false);
  }

  /** A marca de exclusão em aberto é um pedido do próprio titular? A última
   * entre o pedido dele e a remoção pelo admin decide. Sem nenhuma das duas
   * registrada, não é dele — fail-closed: na dúvida, quem desfaz é a igreja. */
  private async requestedBySubject(personId: string): Promise<boolean> {
    const latest = await this.prisma.client.auditLog.findFirst({
      where: { subject_person_id: personId, action: { in: [SUBJECT_REQUEST, ADMIN_REMOVAL] } },
      orderBy: { at: 'desc' },
      select: { action: true },
    });
    return latest?.action === SUBJECT_REQUEST;
  }

  /** Auditoria na transação da requisição, com a falha propagando — ver o
   * cabeçalho deste arquivo e `PersonsService.writeAuditLog`. */
  private async auditInTx(user: JwtPayload, personId: string, action: string): Promise<void> {
    await this.prisma.client.$executeRaw`
      SELECT audit_insert(
        ${user.tenant_id}::text,
        ${user.congregation_id}::text,
        ${user.sub}::text,
        ${personId}::text,
        'person'::text,
        ${action}::text,
        NULL::jsonb,
        NULL::jsonb,
        NULL::text,
        NULL::text,
        NULL::text
      )
    `;
  }

  /**
   * A pessoa da conta do token. Anonimizada conta como inexistente: depois
   * da anonimização não sobra dado do titular para mostrar, corrigir ou
   * exportar — e "cancelar a exclusão" já não é possível.
   */
  private async myPerson(user: JwtPayload): Promise<MyPerson> {
    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: user.sub },
      select: { person_id: true },
    });
    if (!account?.person_id) {
      throw new NotFoundException('Sua conta não tem cadastro de pessoa vinculado');
    }

    const person = await this.prisma.client.person.findUnique({
      where: { id: account.person_id },
      select: PERSON_FIELDS,
    });
    if (!person) {
      throw new NotFoundException('Sua conta não tem cadastro de pessoa vinculado');
    }
    if (person.anonymized_at) {
      throw new ConflictException('Os dados desta conta já foram anonimizados');
    }
    return person;
  }
}

function deletionStatus(requestedAt: Date | null, cancellable: boolean): DeletionStatus {
  if (!requestedAt) return { requested_at: null, anonymize_after: null, cancellable: false };
  const after = new Date(requestedAt);
  after.setDate(after.getDate() + DELETION_GRACE_DAYS);
  return { requested_at: requestedAt, anonymize_after: after, cancellable };
}
