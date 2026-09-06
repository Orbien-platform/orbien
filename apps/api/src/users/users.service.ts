import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateUserDto } from './dto/create-user.dto';

const INVITE_TOKEN_TTL_DAYS = 7;

export interface CreatedUserAccount {
  id: string;
  email: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * Concede acesso ao sistema para uma pessoa já cadastrada. Só o dono do
   * tenant (`tenant_admin`) ou `pastor` chamam este método (ver
   * `@Roles` no controller) — mas nenhum dos dois pode promover alguém a um
   * papel que eles mesmos não têm: só `tenant_admin` distribui `tenant_admin`.
   * Sem isso, `pastor` criaria pares no papel mais alto do tenant.
   */
  async create(dto: CreateUserDto, actor: JwtPayload): Promise<CreatedUserAccount> {
    if (dto.role_code === 'tenant_admin' && !actor.roles.includes('tenant_admin')) {
      throw new ForbiddenException('Apenas um admin do tenant pode conceder o papel de admin do tenant.');
    }

    // A leitura roda em `tx` (app_user, RLS): é ela quem decide se o pedido é
    // autorizado, confirmando que a pessoa está no tenant/congregação do
    // ator. Os dados usados nas escritas abaixo (tenant_id do JWT,
    // congregation_id desta leitura) já saem validados daqui.
    const person = await this.prisma.runInTx(async (tx) => {
      const found = await tx.person.findUnique({
        where: { id: dto.person_id },
        include: { userAccounts: { where: { is_active: true }, select: { id: true } } },
      });
      if (!found) throw new NotFoundException('Pessoa não encontrada');
      if (found.userAccounts.length > 0) {
        throw new ConflictException('Esta pessoa já tem acesso ao sistema.');
      }
      return found;
    });

    // Senha aleatória e inutilizável: quem convida nunca vê nem define a
    // senha de terceiros. O convite só destrava a conta pelo link de
    // definição de senha, abaixo.
    const passwordHash = await argon2.hash(randomBytes(32).toString('hex'));
    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    // userAccount, roleAssignment e passwordResetToken gravam juntos numa
    // única transação em `system` (BYPASSRLS). password_reset_tokens só
    // aceita escrita por esse client — a policy nega `app_user` de propósito
    // (ver migration 20260614001415_add_password_reset_tokens) — e ele abre
    // uma conexão própria, separada da transação de `tx` que envolve a
    // requisição inteira (TenantContextInterceptor só dá COMMIT depois que o
    // controller termina). Se o usuário fosse criado em `tx`, `system`
    // tentaria referenciar, de outra conexão, uma linha ainda não commitada
    // — daí o `password_reset_tokens_user_id_fkey` da invocação por
    // `prisma.system` sozinho.
    let user;
    try {
      user = await this.prisma.system.$transaction(async (sysTx) => {
        const created = await sysTx.userAccount.create({
          data: {
            tenant_id: actor.tenant_id,
            congregation_id: person.congregation_id,
            person_id: person.id,
            email: dto.email,
            password_hash: passwordHash,
          },
        });

        await sysTx.roleAssignment.create({
          data: {
            tenant_id: actor.tenant_id,
            congregation_id: person.congregation_id,
            user_account_id: created.id,
            role_code: dto.role_code,
          },
        });

        await sysTx.passwordResetToken.create({
          data: { user_id: created.id, token: rawToken, expires_at: expiresAt },
        });

        return created;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Já existe uma conta com este e-mail neste tenant.');
      }
      throw err;
    }

    // Fora da transação: envio de e-mail não deve segurar a conexão do banco.
    const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3001';
    const inviteUrl = `${frontendUrl}/redefinir-senha?token=${rawToken}`;
    await this.mail.sendInvite(user.email, inviteUrl);

    return { id: user.id, email: user.email };
  }
}
