import { SetMetadata } from '@nestjs/common';

export const UPLOAD_TICKET_KEY = 'upload_ticket_route';

/**
 * Marca a única rota que aceita um ticket de upload.
 *
 * Ticket é um JWT de vida curta, emitido por uma rota normal e **entregue ao
 * JavaScript da página** — é o preço de mandar o arquivo direto para a API,
 * fora do proxy do Next, que na Vercel tem teto de 4,5 MB de corpo. Como ele
 * fica legível, precisa não servir para mais nada: sem esta marca, o
 * `JwtAuthGuard` recusa qualquer token com `scope: 'upload'`.
 */
/**
 * Cada rota de upload declara o tipo de ticket que aceita. O `upload_target`
 * sozinho não basta: ele é só um UUID, e um ticket emitido para um recurso (a
 * reunião) valeria em outra rota de upload cujo `:id` fosse o mesmo UUID.
 */
export type UploadTicketKind = 'post_media' | 'meeting_material' | 'study_material';

export const UploadTicketRoute = (kind: UploadTicketKind = 'post_media') =>
  SetMetadata(UPLOAD_TICKET_KEY, kind);
