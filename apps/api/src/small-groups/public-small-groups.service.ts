import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListPublicSmallGroupsQueryDto } from './dto/list-public-small-groups-query.dto';
import { CreateVisitRequestDto } from './dto/create-visit-request.dto';

export type PublicSmallGroup = {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  meeting_time: string | null;
  recurrence: string | null;
  group_type: { id: string; name: string; color: string | null };
  congregation: { id: string; name: string };
};

export type PublicSmallGroupsResult = {
  church_name: string;
  groups: PublicSmallGroup[];
};

// Teto da listagem pública. Uma igreja com mais células públicas do que isto
// existe, mas a página as mostra todas de uma vez (mapa + lista, filtro no
// cliente) — o limite é o que impede a rota sem login de virar um dump
// arbitrariamente grande. Se um tenant chegar aqui, o caminho é paginar ou
// filtrar no servidor, não aumentar o número.
const MAX_PUBLIC_GROUPS = 200;

const RECEIVED_MESSAGE = 'Pedido enviado! A liderança da célula vai entrar em contato.';

@Injectable()
export class PublicSmallGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async findPublic(query: ListPublicSmallGroupsQueryDto): Promise<PublicSmallGroupsResult> {
    const tenant = await this.resolveTenant(query.tenant_slug);

    const groups = await this.prisma.runInTx(async (tx) => {
      // Rota pública: não há JWT, o TenantContextInterceptor não roda e o
      // contexto de RLS é escrito aqui — a partir do tenant resolvido pelo
      // slug, nunca de algo que o visitante mandou. Mesmo princípio do
      // cadastro de visitante por QR (visitor.service.ts), que tira o
      // contexto do token.
      //
      // Só `app.tenant_id`: é a ausência de `app.user_id` que habilita a
      // policy `public_discovery_read`
      // (012_rls_small_groups_public.sql), e é ela que limita esta leitura
      // às células marcadas como públicas. O `is_public` do WHERE abaixo é
      // redundante de propósito — se a policy sumir, a listagem some junto
      // em vez de vazar célula privada.
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;

      return tx.smallGroup.findMany({
        where: { tenant_id: tenant.id, is_public: true },
        select: {
          id: true,
          name: true,
          public_description: true,
          public_photo_url: true,
          address: true,
          lat: true,
          lng: true,
          meeting_time: true,
          recurrence: true,
          groupType: { select: { id: true, name: true, color: true } },
          congregation: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
        take: MAX_PUBLIC_GROUPS,
      });
    });

    return {
      church_name: tenant.name,
      // Nada de líder aqui, nem nome nem contato: quem decide o que a célula
      // mostra em público é a igreja, pelos campos `public_*`. O contato de
      // uma pessoa não vira dado público por ela liderar uma célula.
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.public_description,
        photo_url: g.public_photo_url,
        address: g.address,
        lat: g.lat === null ? null : Number(g.lat),
        lng: g.lng === null ? null : Number(g.lng),
        meeting_time: g.meeting_time,
        recurrence: g.recurrence,
        group_type: g.groupType,
        congregation: g.congregation,
      })),
    };
  }

  async requestVisit(
    smallGroupId: string,
    dto: CreateVisitRequestDto,
  ): Promise<{ status: 'received'; message: string }> {
    // Honeypot preenchido: responde como se tivesse dado certo e não grava
    // nada — mesmo comportamento da doação pública (pix.service.ts).
    if (dto.website) {
      return { status: 'received', message: RECEIVED_MESSAGE };
    }

    const phone = dto.visitor_phone?.trim() || null;
    const email = dto.visitor_email?.trim() || null;
    if (!phone && !email) {
      throw new BadRequestException('Informe um telefone ou e-mail para a célula entrar em contato');
    }

    const tenant = await this.resolveTenant(dto.tenant_slug);

    await this.prisma.runInTx(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;

      // A célula é lida pelo mesmo ramo público da listagem: célula de outro
      // tenant, ou não marcada como pública, simplesmente não existe daqui.
      const group = await tx.smallGroup.findFirst({
        where: { id: smallGroupId, tenant_id: tenant.id, is_public: true },
        select: { id: true, congregation_id: true },
      });
      if (!group) throw new NotFoundException('Célula não encontrada');

      // A congregação entra no contexto AGORA, tirada da célula — antes dela
      // ser lida não havia como saber qual é. É o que satisfaz o WITH CHECK
      // de `public_visit_request_insert`
      // (013_rls_small_group_visit_requests.sql), que compara
      // `congregation_id` com `app_current_congregation()`: o pedido cai na
      // congregação da célula, não numa escolhida por quem preencheu o
      // formulário.
      await tx.$executeRaw`SELECT set_config('app.congregation_id', ${group.congregation_id}, true)`;

      // INSERT cru, e não `tx.smallGroupVisitRequest.create()`, por causa do
      // RETURNING: o Prisma sempre devolve a linha criada, e o Postgres exige
      // que ela seja visível por alguma policy de SELECT para fazer isso. O
      // plano público não lê pedido de visita nenhum, de propósito
      // (013_rls_small_group_visit_requests.sql), então o create do Prisma
      // morre com 42501 — "new row violates row-level security policy" —
      // mesmo com o WITH CHECK satisfeito. Sem RETURNING não há o que ler.
      //
      // O `id` vem do banco porque `@default(uuid())` do Prisma é gerado no
      // cliente, não no Postgres; `created_at` tem DEFAULT na tabela.
      await tx.$executeRaw`
        INSERT INTO small_group_visit_requests
          (id, tenant_id, congregation_id, small_group_id,
           visitor_name, visitor_phone, visitor_email, message)
        VALUES
          (gen_random_uuid()::text, ${tenant.id}, ${group.congregation_id}, ${group.id},
           ${dto.visitor_name.trim()}, ${phone}, ${email}, ${dto.message?.trim() || null})
      `;
    });

    return { status: 'received', message: RECEIVED_MESSAGE };
  }

  private async resolveTenant(slug: string): Promise<{ id: string; name: string }> {
    // `tenants` tem a policy `orbien_app_auth ... USING (true)`, então esta
    // leitura funciona antes de existir qualquer contexto — é o mesmo passo
    // que o PIX público faz para resolver a igreja pelo slug.
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true, is_active: true },
    });
    if (!tenant || !tenant.is_active) throw new NotFoundException('Igreja não encontrada');

    const branding = await this.prisma.client.brandingConfig.findUnique({
      where: { tenant_id: tenant.id },
      select: { app_name: true },
    });

    return { id: tenant.id, name: branding?.app_name ?? tenant.name };
  }
}
