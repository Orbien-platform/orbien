import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { StudyMaterialsService } from './study-materials.service';
import { CreateStudyMaterialDto } from './dto/create-study-material.dto';
import { UpdateStudyMaterialDto } from './dto/update-study-material.dto';
import { ListStudyMaterialsQueryDto } from './dto/list-study-materials-query.dto';

const WRITE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary'];
const READ_ROLES = [...WRITE_ROLES, 'cell_leader'];
const STATS_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'cell_leader'];
const ALL_ROLES = [...READ_ROLES, 'member', 'treasurer'];

@Controller('study-materials')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class StudyMaterialsController {
  constructor(private readonly studyMaterialsService: StudyMaterialsService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  create(
    @Body() dto: CreateStudyMaterialDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.studyMaterialsService.create(dto, file, user);
  }

  @Get()
  @Roles(...READ_ROLES)
  findAll(@Query() query: ListStudyMaterialsQueryDto) {
    return this.studyMaterialsService.findAll(query);
  }

  @Get(':id/stats')
  @Roles(...STATS_ROLES)
  getOpenStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.studyMaterialsService.getOpenStats(id);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.studyMaterialsService.findOne(id);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudyMaterialDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.studyMaterialsService.update(id, dto, file, user);
  }

  @Delete(':id')
  @Roles('tenant_admin', 'admin_congregation')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.studyMaterialsService.remove(id);
  }

  @Post(':id/open')
  @Roles(...ALL_ROLES)
  recordOpen(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.studyMaterialsService.recordOpen(id, user);
  }
}
