import { Body, Controller, Param, ParseUUIDPipe, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserRoleDto } from './dto/create-user.dto';

// Quem concede acesso ao sistema: o dono do tenant ou o pastor — nunca o
// console da plataforma, que não enxerga dado de igreja (ver CLAUDE.md).
const CREATE_ROLES = ['tenant_admin', 'pastor'];

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(...CREATE_ROLES)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtPayload) {
    return this.usersService.create(dto, user);
  }

  @Patch('by-person/:personId/role')
  @Roles(...CREATE_ROLES)
  updateRole(
    @Param('personId', ParseUUIDPipe) personId: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.updateRole(personId, dto, user);
  }
}
