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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PlanGuard } from '../../auth/guards/plan.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequiresPlan } from '../../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { KidsRoomsService } from './kids-rooms.service';
import { CreateKidsRoomDto } from './dto/create-kids-room.dto';
import { UpdateKidsRoomDto } from './dto/update-kids-room.dto';
import { ListKidsRoomsQueryDto } from './dto/list-kids-rooms-query.dto';
import { KIDS_MANAGE_ROLES, KIDS_READ_ROLES } from '../kids.roles';

@Controller('kids/rooms')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
export class KidsRoomsController {
  constructor(private readonly roomsService: KidsRoomsService) {}

  @Post()
  @Roles(...KIDS_MANAGE_ROLES)
  create(@Body() dto: CreateKidsRoomDto, @CurrentUser() user: JwtPayload) {
    return this.roomsService.create(user.tenant_id, user.congregation_id, dto);
  }

  @Get()
  @Roles(...KIDS_READ_ROLES)
  findAll(@Query() query: ListKidsRoomsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.roomsService.findAll(user.tenant_id, user.congregation_id, query);
  }

  @Get(':id')
  @Roles(...KIDS_READ_ROLES)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.roomsService.findOne(user.tenant_id, user.congregation_id, id);
  }

  @Patch(':id')
  @Roles(...KIDS_MANAGE_ROLES)
  update(@Param('id') id: string, @Body() dto: UpdateKidsRoomDto, @CurrentUser() user: JwtPayload) {
    return this.roomsService.update(user.tenant_id, user.congregation_id, id, dto);
  }

  // Desativa — turma com sessões e check-ins no histórico não se apaga.
  @Delete(':id')
  @Roles(...KIDS_MANAGE_ROLES)
  deactivate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.roomsService.deactivate(user.tenant_id, user.congregation_id, id);
  }
}
