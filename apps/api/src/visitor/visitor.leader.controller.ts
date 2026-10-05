import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { VisitorService } from './visitor.service';
import { RegisterVisitorByLeaderDto } from './dto/register-visitor-by-leader.dto';

/**
 * Quem cadastra visitante pelo app: os mesmos papéis que registram visita
 * (`VISIT_WRITE_ROLES` em persons/visits.controller.ts) — o líder de célula
 * incluso, porque é ele quem recebe o visitante no encontro. Criar pessoa de
 * outra classificação continua sendo do `POST /persons`, que não muda.
 */
export const VISITOR_LEADER_ROLES = [
  'tenant_admin',
  'admin_congregation',
  'pastor',
  'secretary',
  'cell_leader',
];

// Throttle baixo: a resposta de duplicado revela quem tem um telefone, e um
// recepcionista não cadastra mais que alguns visitantes por minuto.
@Controller('visitors')
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
@UseInterceptors(TenantContextInterceptor)
export class VisitorLeaderController {
  constructor(private readonly visitorService: VisitorService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles(...VISITOR_LEADER_ROLES)
  register(@Body() dto: RegisterVisitorByLeaderDto, @CurrentUser() user: JwtPayload) {
    return this.visitorService.registerByLeader(dto, user);
  }
}
