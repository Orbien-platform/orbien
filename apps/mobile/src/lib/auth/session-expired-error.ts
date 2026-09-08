// Erro tipado (MOB-02): renovação de sessão falhou (refresh revogado ou
// expirado). Quem recebe isso navega para a tela de login (AC 4, MOB-01).
export class SessionExpiredError extends Error {
  constructor() {
    super("Sessão expirada");
    this.name = "SessionExpiredError";
  }
}
