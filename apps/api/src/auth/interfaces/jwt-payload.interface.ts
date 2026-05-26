export interface JwtPayload {
  sub: string;
  tenant_id: string;
  congregation_id: string;
  roles: string[];
  plan: 'starter' | 'premium';
  impersonated_by?: string;
  support_session?: boolean;
}
