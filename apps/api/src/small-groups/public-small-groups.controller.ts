import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PublicSmallGroupsService } from './public-small-groups.service';
import { ListPublicSmallGroupsQueryDto } from './dto/list-public-small-groups-query.dto';
import { CreateVisitRequestDto } from './dto/create-visit-request.dto';

// "Encontre uma célula" (PROD-13): rotas SEM login, no mesmo prefixo
// `public/` do cadastro de visitante por QR. Não há JwtAuthGuard nem
// TenantContextInterceptor aqui de propósito — o contexto de RLS é escrito
// pelo serviço a partir do slug da igreja, e é a ausência de `app.user_id`
// que habilita o ramo público das policies (013_rls_small_groups_public.sql).
@Controller('public/small-groups')
@UseGuards(ThrottlerGuard)
export class PublicSmallGroupsController {
  constructor(private readonly publicSmallGroupsService: PublicSmallGroupsService) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  findPublic(@Query() query: ListPublicSmallGroupsQueryDto) {
    return this.publicSmallGroupsService.findPublic(query);
  }

  // Limite bem mais apertado que o da listagem: aqui cada requisição grava
  // uma linha com dado pessoal de quem preencheu.
  @Post(':id/visit-request')
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @HttpCode(HttpStatus.OK)
  requestVisit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateVisitRequestDto) {
    return this.publicSmallGroupsService.requestVisit(id, dto);
  }
}
