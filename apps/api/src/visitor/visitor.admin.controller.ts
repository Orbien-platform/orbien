import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { VisitorService } from './visitor.service';
import { CreateQrTokenDto } from './dto/create-qr-token.dto';

const MANAGE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary'];

@Controller('admin/visitor/qr')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class VisitorAdminController {
  constructor(private readonly visitorService: VisitorService) {}

  @Post()
  @Roles(...MANAGE_ROLES)
  create(@Body() dto: CreateQrTokenDto, @CurrentUser() user: JwtPayload) {
    return this.visitorService.createQrToken(dto, user);
  }

  @Get()
  @Roles(...MANAGE_ROLES)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.visitorService.listQrTokens(user);
  }

  @Patch(':id/toggle')
  @Roles(...MANAGE_ROLES)
  toggle(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.visitorService.toggleQrToken(id, user);
  }
}
