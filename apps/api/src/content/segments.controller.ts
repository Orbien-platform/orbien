import {
  Body,
  Controller,
  Delete,
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
import { SegmentsService } from './segments.service';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';

const READ_ROLES = ['admin_congregation', 'pastor', 'secretary', 'tenant_admin'] as const;
const WRITE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'] as const;

@Controller('content/segments')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class SegmentsController {
  constructor(private readonly segmentsService: SegmentsService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  create(@Body() dto: CreateSegmentDto, @CurrentUser() user: JwtPayload) {
    return this.segmentsService.create(dto, user);
  }

  @Get()
  @Roles(...READ_ROLES)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.segmentsService.findAll(user);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.segmentsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSegmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.segmentsService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('admin_congregation', 'tenant_admin')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.segmentsService.remove(id, user);
  }
}
