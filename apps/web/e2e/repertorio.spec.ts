/**
 * Repertório do Time de Louvor: catálogo de músicas (tela própria em
 * `/repertorio`, independente de Celebrações/OC) e a visão do músico
 * ("Meus Turnos" em Voluntários).
 *
 * A montagem da Ordem de Celebração/Setlist é feita por chamadas diretas à
 * API (como `upcomingInstance`/`scheduleTemplate` já fazem para outras
 * fixtures) em vez de clicar pela tela de "Ordem de Celebração"
 * (`ServiceOrderView`/`AddItemModal`) — menos passos de UI para montar dado
 * de apoio que não é o que este teste está verificando. O caminho testado
 * aqui via UI é o que importa para esta feature: o catálogo (`/repertorio`)
 * e a visão do músico (`/volunteers/my-celebration-assignments`).
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=... npm run e2e -w orbien-web
 */

import { expect, selectTab, shot, test, realConsoleErrors, unexpectedHttp } from "./fixtures";

interface Identified {
  id: string;
}

interface Ministry extends Identified {
  children?: Ministry[];
}

interface MinistryMember {
  volunteer_profile_id: string;
  volunteerProfile: { person: { email: string | null } };
}

test.describe("repertório do time de louvor", () => {
  test("catálogo de músicas e repertório na escala pessoal", async ({ page, api, errorLog }) => {
    const songTitle = `E2E música ${Date.now()}`;
    const song = await api.call<{ id: string; title: string }>("POST", "/songs", {
      title: songTitle,
      key: "D",
      bpm: 96,
      link: "https://cifraclub.com.br/e2e-repertorio",
    });

    let instanceId: string | null = null;
    const songId: string = song.id;

    try {
      // ── Catálogo: a música criada aparece na tela própria de Repertório ──
      await test.step("tela Repertório lista a música cadastrada", async () => {
        await page.goto("/repertorio", { waitUntil: "domcontentloaded" });
        await expect(
          page.getByText(songTitle, { exact: true }),
          "música criada via API não apareceu no catálogo"
        ).toBeVisible();
        await expect(page.getByText("Tom D")).toBeVisible();
        await expect(page.getByText("96 BPM")).toBeVisible();
        await shot(page, "20-repertorio-catalogo");
      });

      // ── Monta a escala do voluntário (a própria conta de e2e tem perfil) ──
      const ministries = await api.call<Ministry[]>("GET", "/volunteers/ministries");
      const flatMinistries: Ministry[] = [];
      const walk = (nodes: Ministry[]) => {
        for (const n of nodes) {
          flatMinistries.push(n);
          walk(n.children ?? []);
        }
      };
      walk(ministries);
      if (flatMinistries.length === 0) {
        throw new Error("Nenhum ministério cadastrado — impossível montar a escala de teste.");
      }
      const ministry = flatMinistries[0];

      const detail = await api.call<{ leaders: MinistryMember[]; volunteers: MinistryMember[] }>(
        "GET",
        `/volunteers/ministries/${ministry.id}`
      );
      const email = process.env.E2E_EMAIL ?? "";
      const membership = [...detail.leaders, ...detail.volunteers].find(
        (m) => m.volunteerProfile.person.email === email
      );
      if (!membership) {
        throw new Error(
          `A conta de e2e (${email}) não tem perfil de voluntário no ministério "${ministry.id}" — sem isso não dá para montar a escala de teste.`
        );
      }

      const celebrations = await api.call<Identified[]>("GET", "/celebrations");
      if (celebrations.length === 0) {
        throw new Error("Nenhuma celebração cadastrada — impossível criar instância de teste.");
      }
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + 21);
      const instance = await api.call<Identified>("POST", "/celebrations/instances", {
        celebration_id: celebrations[0].id,
        scheduled_date: scheduledDate.toISOString().slice(0, 10),
        notes: "instância temporária de e2e — repertório",
      });
      instanceId = instance.id;

      await api.call("POST", `/celebrations/instances/${instanceId}/schedule`);
      const celebrationMinistry = await api.call<Identified>(
        "POST",
        `/celebrations/instances/${instanceId}/schedule/ministries`,
        { ministry_id: ministry.id, slots: 1 }
      );
      await api.call(
        "POST",
        `/celebrations/instances/${instanceId}/schedule/ministries/${celebrationMinistry.id}/assignments`,
        { volunteer_profile_id: membership.volunteer_profile_id }
      );
      await api.call("PATCH", `/celebrations/instances/${instanceId}/schedule/publish`);

      const cardHeading = page.getByText(scheduledDate.toLocaleDateString("pt-BR"), { exact: false });

      // ── Antes da OC/setlist existir: "ainda não publicado" ──
      await test.step("escala sem setlist mostra 'repertório ainda não publicado'", async () => {
        await page.goto("/voluntarios", { waitUntil: "domcontentloaded" });
        await selectTab(page, "Meus Turnos");
        await expect(cardHeading, "escala criada via API não apareceu em Meus Turnos").toBeVisible();
        await expect(
          page.getByText("Repertório ainda não publicado para este culto.").first()
        ).toBeVisible();
        await shot(page, "21-meus-turnos-sem-repertorio");
      });

      // ── Reaproveita a música do catálogo numa SetlistSong (REPERT-02) ──
      const serviceOrder = await api.call<Identified>("POST", "/celebrations/orders", {
        celebration_instance_id: instanceId,
        title: "OC de teste — repertório",
      });
      const item = await api.call<Identified>("POST", "/celebrations/items", {
        service_order_id: serviceOrder.id,
        sequence: 1,
        name: "Momento de louvor",
        start_offset_minutes: 0,
        duration_minutes: 20,
        responsible_type: "ministry",
        ministry_id: ministry.id,
      });
      const setlist = await api.call<Identified>("POST", "/celebrations/setlists", {
        service_order_item_id: item.id,
      });
      await api.call("POST", "/celebrations/setlists/songs", {
        setlist_id: setlist.id,
        song_id: song.id,
        sequence: 1,
        title: song.title,
      });

      // ── Depois da setlist publicada: o repertório aparece na escala pessoal ──
      await test.step("escala com setlist mostra o repertório reaproveitado do catálogo", async () => {
        await page.goto("/voluntarios", { waitUntil: "domcontentloaded" });
        await selectTab(page, "Meus Turnos");
        await expect(cardHeading).toBeVisible();
        await expect(page.getByText(songTitle, { exact: true })).toBeVisible();
        await expect(page.getByText("D", { exact: true }).first()).toBeVisible();
        await expect(page.getByText("96 BPM")).toBeVisible();
        await expect(
          page.getByRole("button", { name: `Abrir link de ${songTitle}` })
        ).toBeVisible();
        await shot(page, "22-meus-turnos-com-repertorio");
      });

      // ── Erros ──
      await test.step("nenhuma resposta de erro inesperada", async () => {
        expect(unexpectedHttp(errorLog).join(" | ")).toBe("");
      });

      await test.step("nenhum erro de JavaScript", async () => {
        expect(realConsoleErrors(errorLog).join(" | ")).toBe("");
      });
    } finally {
      // A instância cascateia escala/ministérios/atribuições e OC/itens/
      // setlist/setlist_songs — um DELETE limpa tudo que este teste montou.
      if (instanceId) await api.tryCall("DELETE", `/celebrations/instances/${instanceId}`);
      await api.tryCall("DELETE", `/songs/${songId}`);
    }
  });
});
