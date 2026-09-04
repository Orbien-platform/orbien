export interface JwtPayload {
  sub: string;
  tenant_id: string;
  congregation_id: string;
  roles: string[];
  plan: 'starter' | 'premium';
  impersonated_by?: string;
  support_session?: boolean;
  /**
   * Ticket de upload: token de vida curta que só vale na rota marcada com
   * `@UploadTicketRoute()`, e só para o recurso em `upload_target`. Não
   * carrega papéis — quem autorizou foi a rota que o emitiu.
   */
  scope?: 'upload';
  upload_target?: string;
}
