import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventRegistration, EventRegistrationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventRegistrationDto } from './dto/create-event-registration.dto';
import { ListEventRegistrationsQueryDto } from './dto/list-event-registrations-query.dto';

export interface EventRegistrationSummary {
  registration_enabled: boolean;
  registration_limit: number | null;
  registration_deadline: Date | null;
  registrations_closed: boolean;
  confirmed_count: number;
  waitlisted_count: number;
  seats_left: number | null;
}

export interface EventRegistrationList extends EventRegistrationSummary {
  data: EventRegistration[];
}

/** O que a fila de espera e a contagem de vagas consideram "ocupando lugar". */
const ACTIVE: EventRegistrationStatus[] = ['confirmed', 'waitlisted'];

/**
 * Inscrição em evento — `PROD-16`, variante Starter (sem pagamento).
 *
 * O evento não ganhou tabela própria: `ContentPostType.event` já existia, e o
 * que faltava era o post carregar data, local e as regras de inscrição. Quem
 * tem tabela é a inscrição.
 *
 * TRÊS REGRAS, E ONDE ELAS SÃO DECIDIDAS
 *
 * 1. **Prazo.** `registration_deadline` fecha as inscrições; sem prazo, elas
 *    seguem abertas até o organizador desligar `registration_enabled`. O
 *    cancelamento **não** respeita o prazo: quem não vai mais precisa poder
 *    dizer isso, e segurar a vaga de quem desistiu é o pior dos dois erros.
 *
 * 2. **Vagas.** `registration_limit` NULL é ilimitado. Cheio, a inscrição não
 *    é recusada: entra como `waitlisted`. Recusar devolveria um erro para
 *    alguém que fez tudo certo, e deixaria o organizador sem saber quantos
 *    ficaram de fora.
 *
 * 3. **Promoção.** Cancelou uma confirmada, a mais antiga da espera sobe, na
 *    mesma transação. É por isso que o índice
 *    `(content_post_id, status, created_at)` existe. Cancelar uma que já
 *    estava na espera não promove ninguém — nenhuma vaga foi liberada.
 *
 * A contagem que decide tudo isso é feita DENTRO da transação de cada escrita,
 * nunca lida antes: duas inscrições simultâneas no último lugar liam o mesmo
 * "tem vaga" e as duas entrariam como confirmadas.
 *
 * O isolamento é do RLS (`012_rls_event_registrations.sql`, escopo de
 * congregação). O `tenant_id`/`congregation_id` no `where` é a redundância de
 * sempre — erra para o lado de não achar nada.
 */
@Injectable()
export class EventRegistrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    congregationId: string,
    postId: string,
    query: ListEventRegistrationsQueryDto,
  ): Promise<EventRegistrationList> {
    const post = await this.requireEventPost(tenantId, congregationId, postId);

    const data = await this.prisma.client.eventRegistration.findMany({
      where: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        content_post_id: postId,
        status: query.status ?? { in: ACTIVE },
      },
      // Confirmadas antes das em espera, e dentro de cada grupo por ordem de
      // chegada: é a ordem em que a fila anda, e a mesma que a tela mostra.
      // `status: 'asc'` ordena pela ordem de DECLARAÇÃO do enum
      // (confirmed, waitlisted, cancelled), não alfabética — é por isso que a
      // ordem no schema não é livre.
      orderBy: [{ status: 'asc' }, { created_at: 'asc' }],
    });

    return { ...(await this.summaryFor(post)), data };
  }

  async summary(
    tenantId: string,
    congregationId: string,
    postId: string,
  ): Promise<EventRegistrationSummary> {
    return this.summaryFor(await this.requireEventPost(tenantId, congregationId, postId));
  }

  /** A inscrição do próprio usuário, ou `null` se ele não se inscreveu. */
  async findMine(
    tenantId: string,
    congregationId: string,
    postId: string,
    userId: string,
  ): Promise<EventRegistration | null> {
    await this.requireEventPost(tenantId, congregationId, postId);
    const personId = await this.requirePersonOf(userId);

    return this.prisma.client.eventRegistration.findFirst({
      where: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        content_post_id: postId,
        person_id: personId,
        status: { in: ACTIVE },
      },
    });
  }

  /** O membro se inscreve. Nome e pessoa vêm do cadastro, nunca do corpo. */
  async registerSelf(
    tenantId: string,
    congregationId: string,
    postId: string,
    userId: string,
  ): Promise<EventRegistration> {
    const personId = await this.requirePersonOf(userId);
    const person = await this.prisma.client.person.findFirst({
      where: { id: personId, tenant_id: tenantId },
      select: { full_name: true, email: true, phone: true },
    });
    if (!person) throw new NotFoundException('Pessoa não encontrada');

    return this.register(tenantId, congregationId, postId, {
      person_id: personId,
      full_name: person.full_name,
      email: person.email ?? undefined,
      phone: person.phone ?? undefined,
    });
  }

  /** O organizador inscreve alguém — membro ou convidado sem cadastro. */
  async register(
    tenantId: string,
    congregationId: string,
    postId: string,
    dto: CreateEventRegistrationDto,
    registeredByUserId?: string,
  ): Promise<EventRegistration> {
    const post = await this.requireEventPost(tenantId, congregationId, postId);

    if (!post.registration_enabled) {
      throw new BadRequestException('Este evento não está com inscrições abertas');
    }
    if (post.registration_deadline && post.registration_deadline.getTime() < Date.now()) {
      throw new BadRequestException('O prazo de inscrição para este evento já encerrou');
    }
    if (dto.person_id) {
      const person = await this.prisma.client.person.findFirst({
        where: { id: dto.person_id, tenant_id: tenantId, congregation_id: congregationId },
        select: { id: true },
      });
      if (!person) throw new NotFoundException('Pessoa não encontrada');
    }

    // Identidade do inscrito, na mesma ordem dos dois índices únicos parciais
    // da migration: `person_id` quando há cadastro, e-mail quando é convidado
    // de fora. Sem nenhum dos dois não há como reconhecer repetição — e nem o
    // banco reconheceria, então a inscrição entra como nova.
    const identity: Prisma.EventRegistrationWhereInput | null = dto.person_id
      ? { person_id: dto.person_id }
      : dto.email
        ? { email: { equals: dto.email, mode: 'insensitive' } }
        : null;

    return this.prisma.runInTx(async (tx) => {
      const existing = identity
        ? await tx.eventRegistration.findFirst({
            where: { content_post_id: postId, ...identity },
            orderBy: { created_at: 'desc' },
          })
        : null;

      if (existing && existing.status !== 'cancelled') {
        throw new ConflictException('Esta pessoa já está inscrita neste evento');
      }

      // Conta DENTRO da transação: é o que impede duas inscrições simultâneas
      // de lerem o mesmo "tem vaga" e entrarem as duas no último lugar.
      const status = await this.nextStatus(tx, postId, post.registration_limit);

      const data = {
        tenant_id: tenantId,
        congregation_id: congregationId,
        content_post_id: postId,
        person_id: dto.person_id ?? null,
        full_name: dto.full_name,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        status,
        registered_by_user_id: registeredByUserId ?? null,
      };

      // Reinscrição depois de cancelar reaproveita a linha: o único parcial
      // ignora `cancelled`, então um INSERT também passaria — mas deixaria
      // duas linhas para a mesma pessoa no mesmo evento, e a listagem de
      // canceladas viraria um histórico confuso de idas e vindas.
      if (existing) {
        return tx.eventRegistration.update({
          where: { id: existing.id },
          data: { ...data, cancelled_at: null },
        });
      }

      return tx.eventRegistration.create({ data });
    });
  }

  /** O próprio inscrito desiste. */
  async cancelMine(
    tenantId: string,
    congregationId: string,
    postId: string,
    userId: string,
  ): Promise<EventRegistration> {
    const mine = await this.findMine(tenantId, congregationId, postId, userId);
    if (!mine) throw new NotFoundException('Você não está inscrito neste evento');

    return this.cancel(tenantId, congregationId, postId, mine.id);
  }

  /**
   * Cancela e, se a vaga liberada era de uma confirmada, promove a mais antiga
   * da fila de espera — tudo na mesma transação.
   */
  async cancel(
    tenantId: string,
    congregationId: string,
    postId: string,
    registrationId: string,
  ): Promise<EventRegistration> {
    const post = await this.requireEventPost(tenantId, congregationId, postId);

    return this.prisma.runInTx(async (tx) => {
      const registration = await tx.eventRegistration.findFirst({
        where: {
          id: registrationId,
          tenant_id: tenantId,
          congregation_id: congregationId,
          content_post_id: postId,
        },
      });
      if (!registration) throw new NotFoundException('Inscrição não encontrada');
      if (registration.status === 'cancelled') return registration;

      const freedSeat = registration.status === 'confirmed';

      const cancelled = await tx.eventRegistration.update({
        where: { id: registration.id },
        data: { status: 'cancelled', cancelled_at: new Date() },
      });

      // Sem limite não há fila: ninguém jamais entrou como `waitlisted`, e
      // cancelar não abre vaga que faltasse a alguém.
      if (freedSeat && post.registration_limit !== null) {
        const next = await tx.eventRegistration.findFirst({
          where: { content_post_id: postId, status: 'waitlisted' },
          orderBy: { created_at: 'asc' },
        });
        if (next) {
          await tx.eventRegistration.update({
            where: { id: next.id },
            data: { status: 'confirmed' },
          });
        }
      }

      return cancelled;
    });
  }

  // ─── Internos ──────────────────────────────────────────────────────────────

  /**
   * O post existe, é do escopo de quem pergunta e é um evento.
   *
   * Post que não é evento responde 404, não 400: para quem chama esta rota,
   * "não existe evento com esse id" é a verdade — o id é de outra coisa.
   */
  private async requireEventPost(tenantId: string, congregationId: string, postId: string) {
    const post = await this.prisma.client.contentPost.findFirst({
      where: { id: postId, tenant_id: tenantId, congregation_id: congregationId },
      select: {
        id: true,
        type: true,
        registration_enabled: true,
        registration_limit: true,
        registration_deadline: true,
      },
    });

    if (!post || post.type !== 'event') throw new NotFoundException('Evento não encontrado');
    return post;
  }

  private async requirePersonOf(userId: string): Promise<string> {
    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: userId },
      select: { person_id: true },
    });
    if (!account?.person_id) throw new NotFoundException('Usuário sem vínculo de pessoa');
    return account.person_id;
  }

  private async nextStatus(
    tx: Prisma.TransactionClient,
    postId: string,
    limit: number | null,
  ): Promise<EventRegistrationStatus> {
    if (limit === null) return 'confirmed';

    const confirmed = await tx.eventRegistration.count({
      where: { content_post_id: postId, status: 'confirmed' },
    });

    return confirmed < limit ? 'confirmed' : 'waitlisted';
  }

  private async summaryFor(post: {
    id: string;
    registration_enabled: boolean;
    registration_limit: number | null;
    registration_deadline: Date | null;
  }): Promise<EventRegistrationSummary> {
    const [confirmed, waitlisted] = await Promise.all([
      this.prisma.client.eventRegistration.count({
        where: { content_post_id: post.id, status: 'confirmed' },
      }),
      this.prisma.client.eventRegistration.count({
        where: { content_post_id: post.id, status: 'waitlisted' },
      }),
    ]);

    const pastDeadline =
      post.registration_deadline !== null &&
      post.registration_deadline.getTime() < Date.now();

    return {
      registration_enabled: post.registration_enabled,
      registration_limit: post.registration_limit,
      registration_deadline: post.registration_deadline,
      registrations_closed: !post.registration_enabled || pastDeadline,
      confirmed_count: confirmed,
      waitlisted_count: waitlisted,
      seats_left:
        post.registration_limit === null
          ? null
          : Math.max(0, post.registration_limit - confirmed),
    };
  }
}
