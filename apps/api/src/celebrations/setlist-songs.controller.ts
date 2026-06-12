import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SetlistSongsService } from './setlist-songs.service';
import { CreateSetlistSongDto } from './dto/create-setlist-song.dto';
import { UpdateSetlistSongDto } from './dto/update-setlist-song.dto';
import { ReorderSongsDto } from './dto/reorder-songs.dto';

const EDIT_ROLES = ['admin_congregation', 'pastor', 'tenant_admin', 'secretary', 'ministry_leader'] as const;

@Controller('celebrations/setlists/songs')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class SetlistSongsController {
  constructor(private readonly setlistSongsService: SetlistSongsService) {}

  @Post()
  @Roles(...EDIT_ROLES)
  create(@Body() dto: CreateSetlistSongDto, @CurrentUser() user: JwtPayload) {
    return this.setlistSongsService.create(user.tenant_id, user.congregation_id, dto);
  }

  @Get()
  @Roles(...EDIT_ROLES)
  findAll(@Query('setlist_id') setlistId: string, @CurrentUser() user: JwtPayload) {
    return this.setlistSongsService.findAll(user.tenant_id, user.congregation_id, setlistId);
  }

  @Get(':id')
  @Roles(...EDIT_ROLES)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.setlistSongsService.findOne(user.tenant_id, user.congregation_id, id);
  }

  @Patch(':id')
  @Roles(...EDIT_ROLES)
  update(@Param('id') id: string, @Body() dto: UpdateSetlistSongDto, @CurrentUser() user: JwtPayload) {
    return this.setlistSongsService.update(user.tenant_id, user.congregation_id, id, dto);
  }

  @Delete(':id')
  @Roles(...EDIT_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.setlistSongsService.remove(user.tenant_id, user.congregation_id, id);
  }

  @Post('reorder')
  @Roles(...EDIT_ROLES)
  reorder(@Body() dto: ReorderSongsDto, @CurrentUser() user: JwtPayload) {
    return this.setlistSongsService.reorder(user.tenant_id, user.congregation_id, dto);
  }
}
