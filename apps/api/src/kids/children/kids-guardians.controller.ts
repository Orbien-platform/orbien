import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
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
import { KIDS_FAMILY_ROLES, KIDS_MANAGE_ROLES } from '../kids.roles';
import { toKidsActor } from './kids-child-access.service';
import { KidsGuardiansService } from './kids-guardians.service';
import { KidsGuardianSearchService } from './kids-guardian-search.service';
import { SearchKidsGuardiansQueryDto } from './dto/search-kids-guardians-query.dto';
import { AddKidsGuardianDto } from './dto/add-kids-guardian.dto';
import { UpdateKidsGuardianDto } from './dto/update-kids-guardian.dto';

// Caminhos completos nos métodos: a criação é filha da criança
// (`kids/children/:id/guardians`) e a remoção tem raiz própria
// (`kids/guardians/:id`), como em KidsSessionsController.
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
@Roles(...KIDS_FAMILY_ROLES)
export class KidsGuardiansController {
  constructor(
    private readonly guardiansService: KidsGuardiansService,
    private readonly searchService: KidsGuardianSearchService,
  ) {}

  // Só a gestão (inclui o líder kids, que não lê `GET /persons`). O responsável
  // não varre a congregação atrás de adultos: autoriza quem ele cadastra.
  @Get('kids/guardians/search')
  @Roles(...KIDS_MANAGE_ROLES)
  search(@Query() query: SearchKidsGuardiansQueryDto, @CurrentUser() user: JwtPayload) {
    return this.searchService.search(toKidsActor(user), query);
  }

  @Post('kids/children/:id/guardians')
  add(@Param('id', ParseUUIDPipe) childId: string, @Body() dto: AddKidsGuardianDto, @CurrentUser() user: JwtPayload) {
    return this.guardiansService.add(toKidsActor(user), childId, dto);
  }

  @Patch('kids/guardians/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateKidsGuardianDto, @CurrentUser() user: JwtPayload) {
    return this.guardiansService.update(toKidsActor(user), id, dto);
  }

  @Delete('kids/guardians/:id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.guardiansService.remove(toKidsActor(user), id);
  }
}
