import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { readableAreas, type ProductArea } from './product-areas';

/**
 * O que esta sessão enxerga, segundo o servidor.
 *
 * Existe para o front parar de adivinhar. O `apps/web` repetia em
 * `src/lib/permissions.ts` os papéis de leitura de seis áreas — a mesma
 * informação que vive no `@Roles` de cada controller — só para não desenhar
 * link que levaria a 403. A regra do monorepo impede o import direto (nada da
 * Vercel importa `apps/api`, e um pacote compartilhado acoplaria os deploys
 * por versão), então o caminho é este: a API responde, o front obedece.
 *
 * **Não é autoridade de acesso, é informação sobre ela.** Quem nega continua
 * sendo o `RolesGuard` em cada rota, e o RLS por baixo. Uma resposta errada
 * aqui desenha link a mais (a tela responde "sem acesso") ou link a menos (a
 * tela segue alcançável pela URL) — em nenhum caso abre dado.
 *
 * Sem `@Roles`: qualquer sessão autenticada pergunta o que *ela* alcança, e a
 * resposta é derivada do próprio token de quem pergunta. Está na allowlist de
 * `roles-invariant.spec.ts` por isso.
 */
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  @Get('permissions')
  permissions(@CurrentUser() user: JwtPayload): { areas: ProductArea[] } {
    return { areas: readableAreas(user) };
  }
}
