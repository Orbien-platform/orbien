import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyTemplate, getTemplate, listRooms, setTemplate, type KidsRoom } from "@/lib/kids";
import { KidsTemplateSection } from "./KidsTemplateSection";

vi.mock("@/lib/kids", async (orig) => ({
  ...(await orig<typeof import("@/lib/kids")>()),
  getTemplate: vi.fn(),
  listRooms: vi.fn(),
  setTemplate: vi.fn(),
  applyTemplate: vi.fn(),
}));

const room = (id: string, name: string): KidsRoom => ({
  id,
  name,
  min_age_months: 24,
  max_age_months: 47,
  allows_out_of_range: false,
  capacity: null,
  min_volunteers: 0,
  is_active: true,
});
const M = room("r1", "Maternal");
const J = room("r2", "Júnior");

const tpl = (rooms: KidsRoom[]) => ({ celebration_id: "c1", room_ids: rooms.map((r) => r.id), rooms });
const httpError = (message: string) =>
  Object.assign(new Error("x"), { isAxiosError: true, response: { status: 422, data: { message } } });

describe("KidsTemplateSection", () => {
  beforeEach(() => {
    for (const fn of [getTemplate, listRooms, setTemplate, applyTemplate]) vi.mocked(fn).mockReset();
  });

  it("sem modelo, explica e oferece defini-lo", async () => {
    vi.mocked(getTemplate).mockResolvedValue(tpl([]));
    render(<KidsTemplateSection celebrationId="c1" />);
    expect(await screen.findByText(/Sem modelo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Definir modelo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir nas próximas datas" })).not.toBeInTheDocument();
  });

  it("falha ao carregar o modelo avisa", async () => {
    vi.mocked(getTemplate).mockRejectedValue(new Error("x"));
    render(<KidsTemplateSection celebrationId="c1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar o modelo de turmas");
  });

  it("define o modelo marcando turmas e recarrega", async () => {
    const user = userEvent.setup();
    vi.mocked(getTemplate).mockResolvedValueOnce(tpl([])).mockResolvedValueOnce(tpl([M, J]));
    vi.mocked(listRooms).mockResolvedValue([M, J]);
    vi.mocked(setTemplate).mockResolvedValue();
    render(<KidsTemplateSection celebrationId="c1" />);

    await user.click(await screen.findByRole("button", { name: "Definir modelo" }));
    await user.click(await screen.findByRole("checkbox", { name: /Maternal/ }));
    await user.click(screen.getByRole("checkbox", { name: /Júnior/ }));
    await user.click(screen.getByRole("checkbox", { name: /Júnior/ }));
    await user.click(screen.getByRole("button", { name: "Salvar modelo" }));

    await waitFor(() => expect(setTemplate).toHaveBeenCalledWith("c1", ["r1"]));
    expect(await screen.findByText("Maternal, Júnior")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar modelo" })).toBeInTheDocument();
  });

  it("sem turma cadastrada, o diálogo manda cadastrar; Voltar fecha", async () => {
    const user = userEvent.setup();
    vi.mocked(getTemplate).mockResolvedValue(tpl([]));
    vi.mocked(listRooms).mockResolvedValue([]);
    render(<KidsTemplateSection celebrationId="c1" />);
    await user.click(await screen.findByRole("button", { name: "Definir modelo" }));
    expect(await screen.findByText(/Não há turma cadastrada/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.queryByText(/Não há turma cadastrada/)).not.toBeInTheDocument();
  });

  it("erro ao listar as turmas e ao salvar aparece no diálogo", async () => {
    const user = userEvent.setup();
    vi.mocked(getTemplate).mockResolvedValue(tpl([M]));
    vi.mocked(listRooms).mockRejectedValueOnce(httpError("Sem acesso às turmas")).mockResolvedValueOnce([M]);
    vi.mocked(setTemplate).mockRejectedValue(httpError("Turma desativada"));
    render(<KidsTemplateSection celebrationId="c1" />);
    await user.click(await screen.findByRole("button", { name: "Editar modelo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem acesso às turmas");
    await user.click(screen.getByRole("button", { name: "Voltar" }));

    await user.click(screen.getByRole("button", { name: "Editar modelo" }));
    expect(await screen.findByRole("checkbox", { name: /Maternal/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Salvar modelo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Turma desativada");
  });

  it.each([
    [{ instances: 3, created: 5, already_open: 1, skipped_rooms: 1 }, "5 sessões abertas em 3 datas, 1 já estavam abertas. 1 turma desativada ficou de fora."],
    [{ instances: 1, created: 1, already_open: 0, skipped_rooms: 2 }, "1 sessão aberta em 1 data. 2 turmas desativadas ficaram de fora."],
    [{ instances: 0, created: 0, already_open: 0, skipped_rooms: 0 }, "Não há datas futuras para abrir."],
  ])("abre nas próximas datas e conta o que aconteceu", async (applied, text) => {
    const user = userEvent.setup();
    vi.mocked(getTemplate).mockResolvedValue(tpl([M]));
    vi.mocked(applyTemplate).mockResolvedValue(applied);
    render(<KidsTemplateSection celebrationId="c1" />);
    await user.click(await screen.findByRole("button", { name: "Abrir nas próximas datas" }));
    expect(await screen.findByRole("status")).toHaveTextContent(text);
  });

  it("falha ao aplicar o modelo mostra a mensagem do servidor", async () => {
    const user = userEvent.setup();
    vi.mocked(getTemplate).mockResolvedValue(tpl([M]));
    vi.mocked(applyTemplate).mockRejectedValue(httpError("Modelo sem turma ativa"));
    render(<KidsTemplateSection celebrationId="c1" />);
    await user.click(await screen.findByRole("button", { name: "Abrir nas próximas datas" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Modelo sem turma ativa");
  });

  describe("modelo de uma celebração que já foi trocada", () => {
    const deferred = <T,>() => {
      let resolve!: (v: T) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
    it("modelo da celebração anterior que chega depois não substitui o da atual", async () => {
      const antiga = deferred<ReturnType<typeof tpl>>();
      vi.mocked(getTemplate).mockReturnValueOnce(antiga.promise).mockResolvedValue(tpl([J]));
      const { rerender } = render(<KidsTemplateSection celebrationId="c1" />);
      rerender(<KidsTemplateSection celebrationId="c2" />);
      expect(await screen.findByText("Júnior")).toBeInTheDocument();

      antiga.resolve(tpl([M]));
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByText("Maternal")).not.toBeInTheDocument();
      expect(screen.getByText("Júnior")).toBeInTheDocument();
    });

    it("falha tardia da celebração anterior não mostra erro sobre o modelo atual", async () => {
      const antiga = deferred<ReturnType<typeof tpl>>();
      vi.mocked(getTemplate).mockReturnValueOnce(antiga.promise).mockResolvedValue(tpl([J]));
      const { rerender } = render(<KidsTemplateSection celebrationId="c1" />);
      rerender(<KidsTemplateSection celebrationId="c2" />);
      expect(await screen.findByText("Júnior")).toBeInTheDocument();

      antiga.reject(new Error("falhou"));
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.getByText("Júnior")).toBeInTheDocument();
      expect(screen.queryByText(/Não foi possível/)).not.toBeInTheDocument();
    });
  });
});
