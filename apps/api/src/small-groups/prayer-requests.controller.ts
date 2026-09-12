import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrayerRequestsService } from './prayer-requests.service';
import { CreatePrayerRequestDto } from './dto/create-prayer-request.dto';

// O `@Roles` aqui é rejeição barata, não a autoridade — mesmo princípio que o
// `CLAUDE.md` declara para as rotas de plataforma. Quem decide é a
// `GroupMembership` conferida no service, que nenhum papel do JWT dispensa:
// `pastor` e `admin_congregation` estão na lista para poderem participar de
// uma célula, não para lerem as dos outros.
const PRAYER_ROLES = [
  'member',
  'cell_leader',
  'secretary',
  'pastor',
  'admin_congregation',
  'tenant_admin',
];

@Controller('small-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class PrayerRequestsController {
  constructor(private readonly prayerRequests: PrayerRequestsService) {}

  @Post(':groupId/prayer-requests')
  @Roles(...PRAYER_ROLES)
  create(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreatePrayerRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.prayerRequests.create(groupId, dto, user);
  }

  @Get(':groupId/prayer-requests')
  @Roles(...PRAYER_ROLES)
  findByGroup(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.prayerRequests.findByGroup(groupId, user);
  }

  @Delete(':groupId/prayer-requests/:requestId')
  @Roles(...PRAYER_ROLES)
  remove(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.prayerRequests.remove(groupId, requestId, user);
  }
}
