import { ArgumentsHost, Catch, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

/**
 * Traduz "o banco está atrás do código" em resposta legível.
 *
 * Este monorepo não aplica migration no deploy: o Render roda
 * `npm ci --include=dev && npm run build:api` e `node dist/src/main.js`, e
 * nada mais — quem aplica é alguém rodando `prisma migrate deploy` ou o
 * `scripts/bootstrap-db.sh` à mão (ver /DEPLOY.md). Enquanto isso não
 * acontece, a rota nova responde 500 com `{"message":"Internal server
 * error"}`, que é o que o front mostra ao usuário — foi o sintoma relatado em
 * `/repertorio`, com a tabela `songs` ainda ausente em produção.
 *
 * O 500 é o problema: ele diz "erro no servidor" para uma causa que é
 * operacional e conhecida. 503 + mensagem nomeando a pendência dá ao dev o
 * diagnóstico na primeira olhada, em vez de exigir o log do Render.
 *
 * P2021 = tabela não existe; P2022 = coluna não existe. Qualquer outro código
 * do Prisma segue para o tratamento padrão do Nest — este filtro não é o lugar
 * de mapear erro de domínio (unique violation e afins ficam nos services, que
 * já lançam a exceção HTTP certa).
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class SchemaDriftExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(SchemaDriftExceptionFilter.name);

  override catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    if (exception.code !== 'P2021' && exception.code !== 'P2022') {
      super.catch(exception, host);
      return;
    }

    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const missing =
      exception.code === 'P2021'
        ? `tabela ${String(exception.meta?.['table'] ?? 'desconhecida')}`
        : `coluna ${String(exception.meta?.['column'] ?? 'desconhecida')}`;

    // Alto no log: é a informação que resolve, e o corpo da resposta não
    // carrega nome de tabela nem de coluna.
    this.logger.error(
      `Schema desatualizado em ${req.method} ${req.url}: ${missing} não existe no banco ` +
        `(Prisma ${exception.code}). Aplique as migrations pendentes — ver /DEPLOY.md.`,
    );

    res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      message:
        'Recurso indisponível: o banco de dados está desatualizado em relação a esta ' +
        'versão da API. Há migration pendente de aplicação.',
      error: 'Service Unavailable',
    });
  }
}
