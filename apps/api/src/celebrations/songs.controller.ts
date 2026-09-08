import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SongsService } from './songs.service';
import { CreateSongDto } from './dto/create-song.dto';
import { UpdateSongDto } from './dto/update-song.dto';

const EDIT_ROLES = ['admin_congregation', 'pastor', 'tenant_admin', 'ministry_leader'] as const;

@Controller('songs')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class SongsController {
  constructor(private readonly songsService: SongsService) {}

  @Post()
  @Roles(...EDIT_ROLES)
  create(@Body() dto: CreateSongDto, @CurrentUser() user: JwtPayload) {
    return this.songsService.create(user.tenant_id, user.congregation_id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.songsService.findAll(user.tenant_id, user.congregation_id);
  }

  @Patch(':id')
  @Roles(...EDIT_ROLES)
  update(@Param('id') id: string, @Body() dto: UpdateSongDto, @CurrentUser() user: JwtPayload) {
    return this.songsService.update(user.tenant_id, user.congregation_id, id, dto);
  }

  @Delete(':id')
  @Roles(...EDIT_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.songsService.remove(user.tenant_id, user.congregation_id, id);
  }
}
