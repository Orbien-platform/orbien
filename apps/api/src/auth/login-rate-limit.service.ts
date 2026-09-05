import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Quantas marcações a janela tolera, e por quanto tempo ela dura. */
export interface RateLimitPolicy {
  max: number;
  windowMs: number;
}

/**
 * Login e login de plataforma: 5 **falhas** a cada 15 minutos, por e-mail.
 * Acerto zera — quem sabe a senha nunca esbarra no limite.
 */
export const LOGIN_POLICY: RateLimitPolicy = { max: 5, windowMs: 15 * 60 * 1000 };

/**
 * `forgot-password`: 3 **pedidos** por hora, por e-mail — os mesmos números que
 * o limitador em memória usava. Aqui conta a tentativa, não a falha: o pedido
 * dispara e-mail, e é o envio que se quer limitar.
 */
export const PASSWORD_RESET_POLICY: RateLimitPolicy = { max: 3, windowMs: 60 * 60 * 1000 };

/**
 * Limitador de tentativas das rotas de credencial, compartilhado entre
 * instâncias.
 *
 * O estado vive em `login_attempts`, não em memória. Um `Map` por processo —
 * que era o que `forgot-password` tinha — vale 1/N com N instâncias no Render,
 * e some a cada deploy. A tabela sobrevive aos dois.
 *
 * Escrita e leitura vão por `prisma.system` de propósito: a tabela tem RLS sem
 * policy (`ENABLE` + `FORCE`), então a conexão da aplicação não a alcança. Ela
 * guarda o e-mail tentado, e essa lista não deve estar ao alcance de nenhuma
 * rota autenticada.
 *
 * A contagem é de **falhas**, não de tentativas: acerto zera. Quem sabe a senha
 * nunca esbarra no limite, e quem não sabe tem cinco chances a cada 15 minutos —
 * por e-mail e por rota, que é o mesmo recorte que o limitador antigo usava.
 *
 * O que isto não resolve, e fica dito: o recorte é por identificador, não por
 * origem. Quem varre muitos e-mails diferentes de um mesmo IP não bate no
 * limite. Fechar isso exige `X-Forwarded-For` confiável — decisão de infra que
 * não cabe aqui.
 *
 * **Tabela ausente não derruba o login.** As migrations do projeto são manuais
 * (ver DEPLOY.md) e o deploy da API é automático no push para `main`: entre um
 * e outro existe uma janela em que o código novo roda contra o banco antigo.
 * Sem tratamento, toda tentativa de login responderia 500 nessa janela — o
 * limitador teria virado uma indisponibilidade pior do que a ausência dele.
 * Então falta de tabela (P2021) é registrada como ERROR e o pedido segue **sem
 * limite**, que é exatamente o estado anterior a este serviço. É degradação
 * declarada, e barulhenta: o log diz o que rodar. Qualquer outra falha de banco
 * sobe — se o Postgres está fora, o login não ia funcionar mesmo.
 */
@Injectable()
export class LoginRateLimitService {
  private readonly logger = new Logger(LoginRateLimitService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * A tabela ainda não existe neste banco?
   *
   * P2021 é o "table does not exist" do Prisma. Só ele: qualquer outro erro é
   * problema de verdade e tem que subir.
   */
  private missingTable(error: unknown): boolean {
    const missing =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021';
    if (missing) {
      this.logger.error(
        'Tabela `login_attempts` não existe: o limite de tentativas está DESLIGADO. ' +
          'Rode `prisma migrate deploy` (migration 20260905000000_add_login_attempts).',
      );
    }
    return missing;
  }

  /** Chave da janela. Separa as rotas: bloquear em uma não bloqueia a outra. */
  static key(route: string, identifier: string): string {
    return `${route}:${identifier.trim().toLowerCase()}`;
  }

  /**
   * Lança 429 se a janela estiver estourada. Chamar ANTES de conferir a senha.
   *
   * `check` devolve o veredito em vez de lançar — é o que `forgot-password`
   * usa, porque lá a resposta é genérica de propósito: um 429 contaria que
   * alguém andou pedindo redefinição para aquele e-mail.
   */
  async check(key: string, policy: RateLimitPolicy): Promise<boolean> {
    let row;
    try {
      row = await this.prisma.system.loginAttempt.findUnique({ where: { identifier: key } });
    } catch (error) {
      if (this.missingTable(error)) return true;
      throw error;
    }

    if (!row?.blocked_at) return true;

    if (row.blocked_at.getTime() + policy.windowMs > Date.now()) return false;

    // Bloqueio vencido: a janela recomeça na próxima falha.
    await this.prisma.system.loginAttempt.delete({ where: { identifier: key } }).catch(() => {});
    return true;
  }

  /** Igual a `check`, mas lança o 429 que as rotas de login devolvem. */
  async assert(key: string, policy: RateLimitPolicy): Promise<void> {
    if (await this.check(key, policy)) return;
    throw new HttpException(
      {
        message: 'Muitas tentativas. Tente novamente em alguns minutos.',
        code: 'TOO_MANY_ATTEMPTS',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** Marca uma tentativa e bloqueia quando a conta estoura a política. */
  async register(key: string, policy: RateLimitPolicy): Promise<void> {
    const now = new Date();
    let row;
    try {
      row = await this.prisma.system.loginAttempt.findUnique({ where: { identifier: key } });
    } catch (error) {
      if (this.missingTable(error)) return;
      throw error;
    }

    // Janela vencida (ou inexistente): começa de novo, em 1.
    if (!row || row.window_at.getTime() + policy.windowMs <= now.getTime()) {
      await this.prisma.system.loginAttempt.upsert({
        where: { identifier: key },
        create: { identifier: key, count: 1, window_at: now },
        update: { count: 1, window_at: now, blocked_at: null },
      });
      return;
    }

    const count = row.count + 1;
    await this.prisma.system.loginAttempt.update({
      where: { identifier: key },
      data: { count, blocked_at: count >= policy.max ? now : row.blocked_at },
    });
  }

  /** Credencial correta zera a janela. */
  async clear(key: string): Promise<void> {
    try {
      await this.prisma.system.loginAttempt.deleteMany({ where: { identifier: key } });
    } catch (error) {
      if (this.missingTable(error)) return;
      throw error;
    }
  }
}
