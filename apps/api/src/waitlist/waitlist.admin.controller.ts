import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { WaitlistService } from './waitlist.service';
import { ListWaitlistQueryDto } from './dto/list-waitlist-query.dto';
import { UpdateWaitlistDto } from './dto/update-waitlist.dto';
import { PlatformRoute } from '../common/decorators/platform-route.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';

// Rota de plataforma: a waitlist não pertence a tenant nenhum (`tenant_id` só
// é preenchido na ativação). Antes de 004_rls_platform_plane.sql a tabela não
// tinha RLS e este controller lia tudo rodando como `orbien_app`, sem contexto.
// Agora ele passa pelo interceptor, vira `app_user` sem tenant fixado, e quem
// responde é o ramo `app_platform_access()` da policy.
@Controller('admin/waitlist')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
@Roles('platform_support')
@PlatformRoute()
export class WaitlistAdminController {
  constructor(private readonly service: WaitlistService) {}

  @Get()
  findAll(@Query() query: ListWaitlistQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWaitlistDto) {
    return this.service.update(id, dto);
  }
}
