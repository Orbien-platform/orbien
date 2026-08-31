import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { RecurringRuleService } from './recurring-rule.service';
import { CreateRecurringRuleDto } from './dto/create-recurring-rule.dto';

const READ_ROLES = ['admin_congregation', 'treasurer', 'tenant_admin'];
const WRITE_ROLES = ['admin_congregation', 'treasurer', 'tenant_admin'];

@Controller('financial/recurring-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class RecurringRuleController {
  constructor(private readonly recurringRuleService: RecurringRuleService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  create(@Body() dto: CreateRecurringRuleDto, @CurrentUser() user: JwtPayload) {
    return this.recurringRuleService.create(dto, user);
  }

  @Get()
  @Roles(...READ_ROLES)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.recurringRuleService.findAll(user);
  }

  @Patch(':id/deactivate')
  @Roles(...WRITE_ROLES)
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.recurringRuleService.deactivate(id, user);
  }
}
