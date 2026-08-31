import {
  Body,
  Controller,
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
import { VisitsService } from './visits.service';
import { CreateVisitDto } from './dto/create-visit.dto';

const VISIT_WRITE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'cell_leader'];
const VISIT_READ_ROLES = [...VISIT_WRITE_ROLES, 'treasurer'];

@Controller('persons')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Post('visits')
  @Roles(...VISIT_WRITE_ROLES)
  create(@Body() dto: CreateVisitDto, @CurrentUser() user: JwtPayload) {
    return this.visitsService.create(dto, user);
  }

  @Get(':personId/visits')
  @Roles(...VISIT_READ_ROLES)
  findByPerson(@Param('personId', ParseUUIDPipe) personId: string) {
    return this.visitsService.findByPerson(personId);
  }
}
