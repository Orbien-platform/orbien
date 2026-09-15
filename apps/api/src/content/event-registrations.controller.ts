import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PRODUCT_AREA_READ_ROLES } from '../auth/product-areas';
import { EventRegistrationsService } from './event-registrations.service';
import { CreateEventRegistrationDto } from './dto/create-event-registration.dto';
import { ListEventRegistrationsQueryDto } from './dto/list-event-registrations-query.dto';

// Quem lê conteúdo pode se inscrever — `member` está nesta lista, e é o
// inscrito típico. Ver `auth/product-areas.ts`.
const ALL_ROLES = PRODUCT_AREA_READ_ROLES.content;
// Os mesmos que publicam o post do evento (`PostsController`): quem organiza.
const ORGANIZER_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'] as const;

/**
 * Inscrição em evento — `PROD-16` (Starter, sem pagamento) e `PROD-24`
 * (Premium, com pagamento).
 *
 * Duas portas, de propósito, e não uma rota que muda de forma conforme o papel
 * de quem chama:
 *
 *   `.../registrations/me`  o próprio usuário se inscreve e desiste. Sem
 *                           corpo: nome e pessoa vêm do cadastro, então
 *                           ninguém se inscreve como outra pessoa. Em evento
 *                           pago, é a única porta — ver o guard em
 *                           `EventRegistrationsService.register`.
 *   `.../registrations`     o organizador administra a lista — inclusive
 *                           inscrevendo o visitante que confirmou por
 *                           telefone e ainda não é cadastro. Recusa evento
 *                           pago: não há vínculo de pagamento a gerar para
 *                           quem não é o próprio inscrito.
 *
 * Sem `PlanGuard` neste controller: o preço é o que exige Premium, e quem
 * cobra isso é `PostsService.assertRegistrationPricePlan`, na escrita do
 * post — não aqui. Um evento sem preço continua Starter, dos dois papéis.
 */
@Controller('content/posts/:postId/registrations')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class EventRegistrationsController {
  constructor(private readonly registrations: EventRegistrationsService) {}

  /** A lista de inscritos é do organizador — não de quem se inscreve. */
  @Get()
  @Roles(...ORGANIZER_ROLES)
  list(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Query() query: ListEventRegistrationsQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.registrations.list(user.tenant_id, user.congregation_id, postId, query);
  }

  /**
   * Vagas e prazo, sem a lista de nomes: é o que a tela de quem vai se
   * inscrever precisa saber, e quem se inscreve não tem acesso à lista.
   */
  @Get('summary')
  @Roles(...ALL_ROLES)
  summary(@Param('postId', ParseUUIDPipe) postId: string, @CurrentUser() user: JwtPayload) {
    return this.registrations.summary(user.tenant_id, user.congregation_id, postId);
  }

  @Get('me')
  @Roles(...ALL_ROLES)
  findMine(@Param('postId', ParseUUIDPipe) postId: string, @CurrentUser() user: JwtPayload) {
    return this.registrations.findMine(
      user.tenant_id,
      user.congregation_id,
      postId,
      user.sub,
    );
  }

  @Post('me')
  @Roles(...ALL_ROLES)
  registerSelf(@Param('postId', ParseUUIDPipe) postId: string, @CurrentUser() user: JwtPayload) {
    return this.registrations.registerSelf(
      user.tenant_id,
      user.congregation_id,
      postId,
      user.sub,
    );
  }

  @Delete('me')
  @Roles(...ALL_ROLES)
  cancelMine(@Param('postId', ParseUUIDPipe) postId: string, @CurrentUser() user: JwtPayload) {
    return this.registrations.cancelMine(
      user.tenant_id,
      user.congregation_id,
      postId,
      user.sub,
    );
  }

  @Post()
  @Roles(...ORGANIZER_ROLES)
  register(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() dto: CreateEventRegistrationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.registrations.register(
      user.tenant_id,
      user.congregation_id,
      postId,
      dto,
      user.sub,
    );
  }

  @Delete(':registrationId')
  @Roles(...ORGANIZER_ROLES)
  cancel(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.registrations.cancel(
      user.tenant_id,
      user.congregation_id,
      postId,
      registrationId,
    );
  }
}
