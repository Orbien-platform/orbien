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
import { BibleVerseMarksService } from './bible-verse-marks.service';
import { BIBLE_ROLES } from './bible-roles.constant';
import { CreateBibleVerseMarkDto } from './dto/create-bible-verse-mark.dto';
import { UpdateBibleVerseMarkDto } from './dto/update-bible-verse-mark.dto';
import { ListBibleFeedQueryDto } from './dto/list-bible-feed-query.dto';

/**
 * Marcação de versículo + feed da congregação (biblia-nvi-marcacoes-mobile,
 * BIB-04, BIB-06, BIB-08, BIB-09, BIB-10). `@Roles(...BIBLE_ROLES)` é
 * rejeição barata, não a autoridade — mesmo princípio de
 * `PrayerRequestsController`: quem decide autoria/moderação é o service
 * (`is_mine`/`can_delete`, `deleted_by_person_id`), nenhum papel do JWT
 * dispensa essa checagem.
 */
@Controller('bible')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class BibleVerseMarksController {
  constructor(private readonly marks: BibleVerseMarksService) {}

  @Post('marks')
  @Roles(...BIBLE_ROLES)
  create(@Body() dto: CreateBibleVerseMarkDto, @CurrentUser() user: JwtPayload) {
    return this.marks.create(dto, user);
  }

  @Get('feed')
  @Roles(...BIBLE_ROLES)
  findFeed(@Query() query: ListBibleFeedQueryDto, @CurrentUser() user: JwtPayload) {
    return this.marks.findFeed(query, user);
  }

  @Patch('marks/:id')
  @Roles(...BIBLE_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBibleVerseMarkDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.marks.update(id, dto, user);
  }

  @Delete('marks/:id')
  @Roles(...BIBLE_ROLES)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.marks.remove(id, user);
  }
}
