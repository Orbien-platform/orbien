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

    const { user, rawToken } = await this.prisma.runInTx(async (tx) => {
      const person = await tx.person.findUnique({
        where: { id: dto.person_id },
        include: { userAccounts: { where: { is_active: true }, select: { id: true } } },
      });
      if (!person) throw new NotFoundException('Pessoa não encontrada');
      if (person.userAccounts.length > 0) {
        throw new ConflictException('Esta pessoa já tem acesso ao sistema.');
      }

      // Senha aleatória e inutilizável: quem convida nunca vê nem define a
      // senha de terceiros. O convite só destrava a conta pelo link de
      // definição de senha, abaixo.
      const passwordHash = await argon2.hash(randomBytes(32).toString('hex'));

      let created;
      try {
        created = await tx.userAccount.create({
          data: {
            tenant_id: actor.tenant_id,
            congregation_id: person.congregation_id,
            person_id: person.id,
            email: dto.email,
            password_hash: passwordHash,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException('Já existe uma conta com este e-mail neste tenant.');
        }
        throw err;
      }

      await tx.roleAssignment.create({
        data: {
          tenant_id: actor.tenant_id,
          congregation_id: person.congregation_id,
          user_account_id: created.id,
          role_code: dto.role_code,
        },
      });

      const raw = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
      await tx.passwordResetToken.create({
        data: { user_id: created.id, token: raw, expires_at: expiresAt },
      });

      return { user: created, rawToken: raw };
    });

    // Fora da transação: envio de e-mail não deve segurar a conexão do banco.
    const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3001';
    const inviteUrl = `${frontendUrl}/redefinir-senha?token=${rawToken}`;
    await this.mail.sendInvite(user.email, inviteUrl);

    return { id: user.id, email: user.email };
  }
}
