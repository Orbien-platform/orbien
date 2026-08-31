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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PersonsService } from './persons.service';
import { ClassificationService } from './classification.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { ListPersonsQueryDto } from './dto/list-persons-query.dto';
import { CreateHouseholdDto } from './dto/create-household.dto';
import { AddHouseholdMemberDto } from './dto/add-household-member.dto';
import { ReclassifyPersonDto } from './dto/reclassify-person.dto';

const READ_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'treasurer'];
const WRITE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary'];

@Controller('persons')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class PersonsController {
  constructor(
    private readonly personsService: PersonsService,
    private readonly classificationService: ClassificationService,
  ) {}

  // ── Households (before /:id to avoid routing conflicts) ──────────────────

  @Post('households')
  @Roles(...WRITE_ROLES)
  createHousehold(
    @Body() dto: CreateHouseholdDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.personsService.createHousehold(dto, user);
  }

  @Get('households/:id')
  @Roles(...READ_ROLES)
  findHousehold(@Param('id', ParseUUIDPipe) id: string) {
    return this.personsService.findHousehold(id);
  }

  @Post('households/:id/members')
  @Roles(...WRITE_ROLES)
  addHouseholdMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddHouseholdMemberDto,
  ) {
    return this.personsService.addHouseholdMember(id, dto);
  }

  // ── Persons ───────────────────────────────────────────────────────────────

  @Post()
  @Roles(...WRITE_ROLES)
  create(@Body() dto: CreatePersonDto, @CurrentUser() user: JwtPayload) {
    return this.personsService.create(dto, user);
  }

  @Get()
  @Roles(...READ_ROLES)
  findAll(@Query() query: ListPersonsQueryDto) {
    return this.personsService.findAll(query);
  }

  @Patch(':id/classification')
  @Roles('tenant_admin', 'admin_congregation', 'pastor', 'secretary')
  reclassify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReclassifyPersonDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.classificationService.manualReclassify(id, dto.classification, dto.reason, user.sub);
  }

  @Get(':id/classification-history')
  @Roles(...READ_ROLES)
  classificationHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.classificationService.findHistory(id);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.personsService.findOne(id);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePersonDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.personsService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('tenant_admin', 'admin_congregation')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.personsService.remove(id);
  }
}
