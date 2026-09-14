import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { GroupMessagesService } from './group-messages.service';
import { CreateGroupMessageDto } from './dto/create-group-message.dto';
import { ListGroupMessagesQueryDto } from './dto/list-group-messages-query.dto';

// Mesma lista e mesmo motivo do `PrayerRequestsController`: o `@Roles` é
// rejeição barata, não a autoridade. Quem decide é a `GroupMembership`
// conferida no service, que nenhum papel do JWT dispensa — `pastor` e
// `admin_congregation` estão aqui para poderem conversar na célula de que
// participam, não para lerem a dos outros.
const CHAT_ROLES = [
  'member',
  'cell_leader',
  'secretary',
  'pastor',
  'admin_congregation',
  'tenant_admin',
];

@Controller('small-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class GroupMessagesController {
  constructor(private readonly messages: GroupMessagesService) {}

  @Post(':groupId/messages')
  @Roles(...CHAT_ROLES)
  create(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateGroupMessageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.messages.create(groupId, dto, user);
  }

  @Get(':groupId/messages')
  @Roles(...CHAT_ROLES)
  findByGroup(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: ListGroupMessagesQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.messages.findByGroup(groupId, query, user);
  }

  @Delete(':groupId/messages/:messageId')
  @Roles(...CHAT_ROLES)
  remove(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.messages.remove(groupId, messageId, user);
  }
}
