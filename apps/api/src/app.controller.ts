import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    // `commit` deixa o CI saber qual versão está no ar (scripts/esperar-deploy.mjs,
    // PEND-25). RENDER_GIT_COMMIT é injetada pelo Render; só o SHA, nada além.
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      commit: process.env.RENDER_GIT_COMMIT ?? null,
    };
  }
}
