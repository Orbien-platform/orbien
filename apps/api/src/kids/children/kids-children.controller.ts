import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
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
import { KidsChildrenService } from './kids-children.service';
import { CreateKidsChildDto } from './dto/create-kids-child.dto';
import { UpdateKidsChildDto } from './dto/update-kids-child.dto';
import { ListKidsChildrenQueryDto } from './dto/list-kids-children-query.dto';

@Controller('kids/children')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
@Roles(...KIDS_FAMILY_ROLES)
export class KidsChildrenController {
  constructor(private readonly childrenService: KidsChildrenService) {}

  // Responsável: só os filhos do próprio Household. Equipe: busca na congregação.
  @Get()
  list(@Query() query: ListKidsChildrenQueryDto, @CurrentUser() user: JwtPayload) {
    return this.childrenService.list(toKidsActor(user), query);
  }

  @Post()
  create(@Body() dto: CreateKidsChildDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.childrenService.create(toKidsActor(user), dto, {
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
  }

  // Ficha com saúde e responsáveis. Leitura pela equipe é auditada.
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.childrenService.getFicha(toKidsActor(user), id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateKidsChildDto, @CurrentUser() user: JwtPayload) {
    return this.childrenService.update(toKidsActor(user), id, dto);
  }
}
