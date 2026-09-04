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
import { JwtService } from '@nestjs/jwt';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UploadTicketRoute } from '../auth/decorators/upload-ticket.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';

const ALL_ROLES = ['admin_congregation', 'pastor', 'secretary', 'tenant_admin', 'member'] as const;
const WRITE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'] as const;

/** Segundos. Tempo de pegar o ticket e começar a subir, não de subir. */
const UPLOAD_TICKET_TTL = 300;

@Controller('content/posts')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
    private readonly jwtService: JwtService,
  ) {}

  @Post()
  @Roles(...WRITE_ROLES)
  create(@Body() dto: CreatePostDto, @CurrentUser() user: JwtPayload) {
    return this.postsService.create(user.tenant_id, user.congregation_id, user.sub, dto);
  }

  @Get()
  @Roles(...ALL_ROLES)
  findAll(@Query() query: ListPostsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.postsService.findAll(user.tenant_id, user.congregation_id, user.roles, query);
  }

  @Get(':id')
  @Roles(...ALL_ROLES)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.postsService.findOne(user.tenant_id, user.congregation_id, id);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePostDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.postsService.update(user.tenant_id, user.congregation_id, id, dto);
  }

  @Delete(':id')
  @Roles('admin_congregation', 'tenant_admin')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.postsService.remove(user.tenant_id, user.congregation_id, id);
  }

  @Post(':id/publish')
  @Roles(...WRITE_ROLES)
  publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.postsService.publish(user.tenant_id, user.congregation_id, id);
  }

  /**
   * Emite o ticket que autoriza um upload, e só ele.
   *
   * O arquivo não pode subir pelo proxy do `apps/web`: desde que a sessão
   * virou cookie `HttpOnly`, aquele caminho é uma função da Vercel, que tem
   * teto de 4,5 MB de corpo — e o produto aceita 50 MB. O arquivo vai direto
   * para cá, o que exige um `Authorization` que o JavaScript da página
   * consiga montar, e o access token está justamente fora do alcance dele.
   *
   * Daí o ticket: 5 minutos, sem papel nenhum, preso a este post, e recusado
   * em qualquer rota que não seja a de upload (ver `JwtAuthGuard`). Quem
   * autorizou foi esta rota, que exigiu WRITE_ROLES antes de assinar.
   *
   * `findOne` primeiro: emitir ticket para post inexistente faria o usuário
   * descobrir o 404 depois de mandar 50 MB pela rede.
   */
  @Post(':id/upload-ticket')
  @Roles(...WRITE_ROLES)
  async uploadTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ upload_token: string; expires_in: number }> {
    await this.postsService.findOne(user.tenant_id, user.congregation_id, id);

    const payload: JwtPayload = {
      sub: user.sub,
      tenant_id: user.tenant_id,
      congregation_id: user.congregation_id,
      roles: [],
      plan: user.plan,
      scope: 'upload',
      upload_target: id,
      // Copiados para o ticket porque o `AuditInterceptor` lê os dois: sem
      // eles, um upload feito em sessão de suporte não deixaria a linha
      // `support_access` que o resto da sessão deixa.
      ...(user.impersonated_by ? { impersonated_by: user.impersonated_by } : {}),
      ...(user.support_session ? { support_session: true } : {}),
    };

    return {
      upload_token: this.jwtService.sign(payload, { expiresIn: UPLOAD_TICKET_TTL }),
      expires_in: UPLOAD_TICKET_TTL,
    };
  }

  @Post(':id/upload')
  @Roles(...WRITE_ROLES)
  @UploadTicketRoute()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }))
  uploadMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.postsService.uploadMedia(user.tenant_id, user.congregation_id, id, file);
  }
}
