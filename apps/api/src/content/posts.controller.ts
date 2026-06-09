import { Controller } from '@nestjs/common';
import { PostsService } from './posts.service';

// Stub — implementado no Sprint 6 Passo 2
@Controller('content/posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}
}
