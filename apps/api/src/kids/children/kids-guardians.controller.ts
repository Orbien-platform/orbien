import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PlanGuard } from '../../auth/guards/plan.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequiresPlan } from '../../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { KIDS_FAMILY_ROLES } from '../kids.roles';
import { toKidsActor } from './kids-child-access.service';
import { KidsGuardiansService } from './kids-guardians.service';
import { AddKidsGuardianDto } from './dto/add-kids-guardian.dto';

// Caminhos completos nos métodos: a criação é filha da criança
// (`kids/children/:id/guardians`) e a remoção tem raiz própria
// (`kids/guardians/:id`), como em KidsSessionsController.
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
@Roles(...KIDS_FAMILY_ROLES)
export class KidsGuardiansController {
  constructor(private readonly guardiansService: KidsGuardiansService) {}

  @Post('kids/children/:id/guardians')
  add(@Param('id', ParseUUIDPipe) childId: string, @Body() dto: AddKidsGuardianDto, @CurrentUser() user: JwtPayload) {
    return this.guardiansService.add(toKidsActor(user), childId, dto);
  }

  @Delete('kids/guardians/:id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.guardiansService.remove(toKidsActor(user), id);
  }
}
