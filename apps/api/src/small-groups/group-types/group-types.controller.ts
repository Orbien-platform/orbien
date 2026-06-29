import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { GroupTypesService } from './group-types.service';
import { CreateGroupTypeDto } from './dto/create-group-type.dto';
import { UpdateGroupTypeDto } from './dto/update-group-type.dto';

const WRITE_ROLES = ['tenant_admin', 'admin_congregation'];

@Controller('groups/types')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class GroupTypesController {
  constructor(private readonly groupTypesService: GroupTypesService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('include_inactive') includeInactive?: string,
  ) {
    return this.groupTypesService.findAll(
      user.tenant_id,
      user.congregation_id,
      includeInactive === 'true',
    );
  }

  @Post()
  @Roles(...WRITE_ROLES)
  create(@Body() dto: CreateGroupTypeDto, @CurrentUser() user: JwtPayload) {
    return this.groupTypesService.create(user.tenant_id, user.congregation_id, dto);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupTypeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.groupTypesService.update(user.tenant_id, user.congregation_id, id, dto);
  }

  @Patch(':id/deactivate')
  @Roles('tenant_admin')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.groupTypesService.deactivate(user.tenant_id, user.congregation_id, id);
  }
}
