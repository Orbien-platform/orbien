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
import { BibleMarkInteractionsService } from './bible-mark-interactions.service';
import { BIBLE_ROLES } from './bible-roles.constant';
import { CreateBibleVerseMarkDto } from './dto/create-bible-verse-mark.dto';
import { UpdateBibleVerseMarkDto } from './dto/update-bible-verse-mark.dto';
import { ListBibleFeedQueryDto } from './dto/list-bible-feed-query.dto';
import { CreateBibleVerseMarkReplyDto } from './dto/create-bible-verse-mark-reply.dto';

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
  constructor(
    private readonly marks: BibleVerseMarksService,
    private readonly interactions: BibleMarkInteractionsService,
  ) {}

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

  @Get('marks/:id')
  @Roles(...BIBLE_ROLES)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.marks.findOne(id, user);
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

  // ── Curtidas e respostas ────────────────────────────────────────────────
  // POST/DELETE e não um toggle: repetir a mesma requisição dá o mesmo
  // resultado (o POST ignora duplicata), então um toque duplo ou um retry de
  // rede não inverte a curtida.

  @Post('marks/:id/like')
  @Roles(...BIBLE_ROLES)
  like(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.interactions.like(id, user);
  }

  @Delete('marks/:id/like')
  @Roles(...BIBLE_ROLES)
  unlike(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.interactions.unlike(id, user);
  }

  @Get('marks/:id/replies')
  @Roles(...BIBLE_ROLES)
  listReplies(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.interactions.listReplies(id, user);
  }

  @Post('marks/:id/replies')
  @Roles(...BIBLE_ROLES)
  createReply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBibleVerseMarkReplyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.interactions.createReply(id, dto, user);
  }

  @Delete('marks/:id/replies/:replyId')
  @Roles(...BIBLE_ROLES)
  removeReply(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('replyId', ParseUUIDPipe) replyId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.interactions.removeReply(id, replyId, user);
  }
}
