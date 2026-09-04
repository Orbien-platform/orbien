/**
 * Porta de entrada: login, e as duas telas de recuperação de senha.
 *
 * Terceiro item da Fase 13 de docs/TESTES.md. É o único fluxo do produto que
 * roda **sem sessão**, e por isso é o único que o resto da suíte não toca: a
 * fixture `page` entrega a página já autenticada por cookie semeado, justamente
 * para não pagar um login de formulário por spec. Aqui o formulário é o objeto
 * do teste, então o primeiro passo de cada `test` é limpar os cookies que a
 * fixture semeou.
 *
 * O que **não** está coberto, e é limite do ambiente e não esquecimento: a
 * troca de senha de fato. O token de redefinição só existe no e-mail que a API
 * envia (ou no log do `MailService` em dev) — não há rota que o devolva, e
 * mesmo que houvesse, concluir a troca mudaria a senha da conta de e2e e
 * derrubaria todos os outros specs. Ficam cobertos os dois ramos que não
 * dependem do token: pedido de link enviado, e token ausente/inválido.
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=... npm run e2e -w orbien-web
 */

import { expect, shot, test, realConsoleErrors, unexpectedHttp, type Page } from "./fixtures";

/**
 * Descarta a sessão semeada pela fixture.
 *
 * Limpar os cookies do contexto é o equivalente honesto de "abrir o app sem
 * sessão": os cookies de sessão são `HttpOnly`, então não há como um script de
 * página removê-los — que é exatamente o ponto deles (ver o cabeçalho de
 * `fixtures.ts`).
 */
async function comoAnonimo(page: Page): Promise<void> {
  await page.context().clearCookies();
}

const EMAIL = process.env.E2E_EMAIL ?? "";
const SENHA = process.env.E2E_PASSWORD ?? "";
const TENANT = process.env.E2E_TENANT ?? "";

test.describe("login", () => {
  test("credencial errada explica o erro; credencial certa entra no dashboard", async ({
    page,
    errorLog,
  }) => {
    await comoAnonimo(page);

    const slug = page.locator("#tenant_slug");
    const email = page.locator("#email");
    const senha = page.locator("#password");
    const entrar = page.getByRole("button", { name: "Entrar" });

    await test.step("formulário pede os três campos", async () => {
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "orbien" })).toBeVisible();
      await expect(slug).toBeVisible();
      await expect(email).toBeVisible();
      await expect(senha).toBeVisible();
      await shot(page, "40-login-formulario");
    });

    await test.step("campo vazio é barrado antes de chamar a API", async () => {
      // A validação é local: sem os três campos o `handleSubmit` retorna antes
      // do `login()`. Prender isso aqui é o que garante que a tela não manda
      // requisição inútil — e o `unexpectedHttp` no fim confirma que nenhum
      // 4xx foi disparado neste passo.
      await slug.fill(TENANT);
      await email.fill("");
      await senha.fill("");
      await entrar.click();
      await expect(page.getByRole("alert")).toHaveText("Todos os campos são obrigatórios.");
    });

    await test.step("código de igreja inexistente diz que é o código", async () => {
      // Os três erros são mensagens distintas de propósito — a tela ajuda a
      // pessoa a saber qual dado está errado. Trocar uma pela outra é
      // regressão de usabilidade que nenhum teste de unidade pega, porque o
      // mapeamento vive no `catch` desta tela.
      await slug.fill(`tenant-que-nao-existe-${Date.now()}`);
      await email.fill(EMAIL);
      await senha.fill(SENHA);
      await entrar.click();
      await expect(page.getByRole("alert")).toHaveText(
        "Código de igreja não encontrado. Verifique e tente novamente.",
      );
    });

    await test.step("senha errada no tenant certo diz que é e-mail ou senha", async () => {
      await slug.fill(TENANT);
      await email.fill(EMAIL);
      await senha.fill("senha-definitivamente-errada");
      await entrar.click();
      await expect(page.getByRole("alert")).toHaveText("E-mail ou senha incorretos.");
      await shot(page, "41-login-erro");
    });

    await test.step("credencial certa entra e chega no dashboard", async () => {
      await slug.fill(TENANT);
      await email.fill(EMAIL);
      await senha.fill(SENHA);
      await entrar.click();

      await expect(page, "o login não redirecionou para o dashboard").toHaveURL(/\/dashboard$/);
      // O dashboard só renderiza com sessão válida — chegar nele é a prova de
      // que os cookies `HttpOnly` foram gravados pelo Route Handler.
      await expect(page.getByRole("heading").first()).toBeVisible();
      await shot(page, "42-login-dashboard");
    });

    await test.step("sem erro de console; os 4xx vistos são os dois logins reprovados", async () => {
      expect(realConsoleErrors(errorLog), "erros de console na tela de login").toEqual([]);
      // As duas credenciais erradas produzem 4xx **esperados**. Qualquer outra
      // resposta com erro é defeito, e é isso que a asserção separa.
      const inesperados = unexpectedHttp(errorLog).filter(
        (e) => !/^(400|401|404) .*\/auth\/login/.test(e),
      );
      expect(inesperados, "respostas HTTP com erro fora dos logins reprovados").toEqual([]);
    });
  });

  test("pedido de redefinição confirma o envio sem revelar se o e-mail existe", async ({
    page,
    errorLog,
  }) => {
    await comoAnonimo(page);

    await test.step("o link do login leva à recuperação", async () => {
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await page.getByRole("link", { name: "Esqueceu sua senha?" }).click();
      await expect(page).toHaveURL(/\/esqueci-senha$/);
      await expect(page.getByText("Recuperação de acesso")).toBeVisible();
    });

    await test.step("e-mail que não existe recebe a mesma confirmação", async () => {
      // A API responde 200 sempre, e a tela mostra a mesma mensagem nos dois
      // casos. É o mesmo princípio do 401 indistinguível do login de
      // plataforma (ver CLAUDE.md): a tela não deve deixar descobrir quais
      // e-mails estão cadastrados. Usamos um e-mail inexistente de propósito —
      // testar com o real dispararia e-mail de verdade a cada execução.
      await page.getByPlaceholder("ex: doca-church").fill(TENANT);
      await page
        .getByPlaceholder("seu@email.com")
        .fill(`ninguem-${Date.now()}@exemplo.test`);
      await page.getByRole("button", { name: "Enviar link de redefinição" }).click();

      await expect(
        page.getByText("Se o email estiver cadastrado, você receberá um link de redefinição em instantes."),
      ).toBeVisible();
      await shot(page, "43-esqueci-senha-enviado");
    });

    await test.step("dá para voltar ao login", async () => {
      await page.getByRole("link", { name: "Voltar para o login" }).click();
      await expect(page).toHaveURL(/\/login$/);
    });

    await test.step("sem erro de console ou HTTP inesperado", async () => {
      expect(realConsoleErrors(errorLog), "erros de console na recuperação").toEqual([]);
      expect(unexpectedHttp(errorLog), "respostas HTTP com erro").toEqual([]);
    });
  });

  test("redefinir senha sem token volta ao login; com token inválido, explica", async ({
    page,
    errorLog,
  }) => {
    await comoAnonimo(page);

    await test.step("sem token na URL, a tela não abre", async () => {
      // O `router.replace` acontece no corpo do componente, antes de qualquer
      // campo existir. É a barreira que impede a tela de aceitar senha nova
      // sem ter o que autorizar a troca.
      await page.goto("/redefinir-senha", { waitUntil: "domcontentloaded" });
      await expect(page, "a tela sem token não voltou para o login").toHaveURL(/\/login$/);
    });

    await test.step("com token inválido, o formulário abre e a API reprova", async () => {
      await page.goto(`/redefinir-senha?token=token-invalido-${Date.now()}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByText("Crie uma nova senha")).toBeVisible();

      const nova = page.locator("#password");
      const confirma = page.locator("#confirm");
      const submeter = page.getByRole("button", { name: "Redefinir senha" });

      // O botão só habilita com 8+ caracteres e as duas senhas iguais — as
      // duas regras são locais, e este é o passo que as prende.
      await nova.fill("curta");
      await confirma.fill("curta");
      await expect(submeter, "senha curta não deveria habilitar o botão").toBeDisabled();

      await nova.fill("senha-nova-valida-123");
      await confirma.fill("senha-nova-diferente");
      await expect(submeter, "senhas diferentes não deveriam habilitar o botão").toBeDisabled();

      await confirma.fill("senha-nova-valida-123");
      await expect(submeter).toBeEnabled();

      await submeter.click();
      await expect(
        page.getByText("Link inválido ou expirado. Solicite um novo link."),
        "token inválido não foi reportado como tal",
      ).toBeVisible();
      await shot(page, "44-redefinir-senha-token-invalido");
    });

    await test.step("sem erro de console; o 400 visto é o token inválido", async () => {
      expect(realConsoleErrors(errorLog), "erros de console na redefinição").toEqual([]);
      const inesperados = unexpectedHttp(errorLog).filter(
        (e) => !/^400 .*\/auth\/reset-password/.test(e),
      );
      expect(inesperados, "respostas HTTP com erro fora do token inválido").toEqual([]);
    });
  });
});
