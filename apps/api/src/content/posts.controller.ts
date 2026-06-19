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
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';

const ALL_ROLES = ['admin_congregation', 'pastor', 'secretary', 'tenant_admin', 'member'] as const;
const WRITE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'] as const;

@Controller('content/posts')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

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

  @Post(':id/upload')
  @Roles(...WRITE_ROLES)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }))
  uploadMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.postsService.uploadMedia(user.tenant_id, user.congregation_id, id, file);
  }
}
