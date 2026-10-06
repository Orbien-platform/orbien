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
import { PlanGuard } from '../auth/guards/plan.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresPlan } from '../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CelebrationSwapService } from './celebration-swap.service';
import { CreateSwapRequestDto } from './dto/create-swap-request.dto';
import { VOLUNTEER_ROLES } from './celebration-volunteer.controller';

/**
 * Troca de escala entre voluntários (v2). Mesmos papéis e plano de
 * `PATCH /assignments/:id/respond`: quem responde a própria escala também
 * pode pedir que outro a assuma.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
export class CelebrationSwapController {
  constructor(private readonly swapService: CelebrationSwapService) {}

  @Get('assignments/:id/swap-candidates')
  @Roles(...VOLUNTEER_ROLES)
  candidates(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.swapService.getCandidates(id, user.sub, user.tenant_id, user.congregation_id);
  }

  @Post('assignments/:id/swap-requests')
  @Roles(...VOLUNTEER_ROLES)
  request(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSwapRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.swapService.createRequest(id, dto, user.sub, user.tenant_id, user.congregation_id);
  }

  @Get('volunteers/my-swap-requests')
  @Roles(...VOLUNTEER_ROLES)
  mine(@CurrentUser() user: JwtPayload) {
    return this.swapService.listMine(user.sub, user.tenant_id, user.congregation_id);
  }

  @Patch('swap-requests/:id/accept')
  @Roles(...VOLUNTEER_ROLES)
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.swapService.accept(id, user.sub, user.tenant_id, user.congregation_id);
  }

  @Patch('swap-requests/:id/decline')
  @Roles(...VOLUNTEER_ROLES)
  decline(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.swapService.decline(id, user.sub, user.tenant_id, user.congregation_id);
  }

  @Patch('swap-requests/:id/cancel')
  @Roles(...VOLUNTEER_ROLES)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.swapService.cancel(id, user.sub, user.tenant_id, user.congregation_id);
  }
}
