import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PersonSheet } from "./PersonSheet";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

const mockedUseAuth = vi.mocked(useAuth);

const person = {
  id: "p1",
  full_name: "Ana Souza",
  phone: "54999998888",
  email: "ana@email.com",
  birth_date: "1990-01-15T00:00:00.000Z",
  membership_date: "2020-01-01T00:00:00.000Z",
  gender: "female",
  classification: "member",
  created_at: "2020-01-01T00:00:00.000Z",
  updated_at: "2020-06-01T00:00:00.000Z",
};

describe("PersonSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
  });

  it("does not render content when closed", () => {
    vi.mocked(api.get).mockResolvedValue({ data: person });
    render(<PersonSheet personId="p1" open={false} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
    expect(screen.queryByText("Ana Souza")).not.toBeInTheDocument();
  });

  it("loads and displays the person's details", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: person });
    render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);

    expect(await screen.findByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("(54) 99999-8888")).toBeInTheDocument();
    expect(screen.getByText("ana@email.com")).toBeInTheDocument();
  });

  it("shows a not-found message when the person fails to load", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("404"));
    render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
    expect(await screen.findByText("Pessoa não encontrada.")).toBeInTheDocument();
  });

  it("edits the person, validating required name and membership date", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: person });
    vi.mocked(api.patch).mockResolvedValue({ data: { ...person, full_name: "Ana Souza Lima" } });
    const onUpdated = vi.fn();
    const user = userEvent.setup();

    render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={onUpdated} />);
    await screen.findByText("Ana Souza");

    await user.click(screen.getByRole("button", { name: /Editar/ }));

    const nameInput = screen.getByDisplayValue("Ana Souza");
    await user.clear(nameInput);
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Nome é obrigatório.")).toBeInTheDocument();

    await user.type(nameInput, "Ana Souza Lima");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/persons/p1",
        expect.objectContaining({ full_name: "Ana Souza Lima" })
      )
    );
    expect(onUpdated).toHaveBeenCalled();
  });

  it("requires a membership date when reclassifying to member during edit", async () => {
    const visitor = { ...person, classification: "visitor", membership_date: undefined };
    vi.mocked(api.get).mockResolvedValue({ data: visitor });
    const user = userEvent.setup();

    render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
    await screen.findByText("Ana Souza");
    await user.click(screen.getByRole("button", { name: /Editar/ }));

    const classificationSelects = screen.getAllByRole("combobox");
    const classificationSelect = classificationSelects[classificationSelects.length - 1];
    await user.selectOptions(classificationSelect, "member");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(
      await screen.findByText("Data de membresía é obrigatória para membros.")
    ).toBeInTheDocument();
  });

  it("shows an error message when saving fails", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: person });
    vi.mocked(api.patch).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();

    render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
    await screen.findByText("Ana Souza");
    await user.click(screen.getByRole("button", { name: /Editar/ }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Erro ao salvar. Tente novamente.")).toBeInTheDocument();
  });

  it("reclassifies the person from the view mode buttons", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: person });
    vi.mocked(api.patch).mockResolvedValue({ data: { ...person, classification: "attendee" } });
    const onUpdated = vi.fn();
    const user = userEvent.setup();

    render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={onUpdated} />);
    await screen.findByText("Ana Souza");

    await user.click(screen.getByRole("button", { name: "Frequentador" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/persons/p1", { classification: "attendee" })
    );
    expect(onUpdated).toHaveBeenCalled();
  });

  it("does nothing when clicking the already-active classification button", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: person });
    const user = userEvent.setup();

    render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
    await screen.findByText("Ana Souza");

    // person.classification is "member" already.
    await user.click(screen.getByRole("button", { name: "Membro" }));

    expect(api.patch).not.toHaveBeenCalled();
  });

  it("shows placeholders for a person with no phone, gender or birth date", async () => {
    const bare = {
      ...person,
      classification: "attendee",
      phone: undefined,
      email: undefined,
      birth_date: undefined,
      gender: undefined,
      membership_date: undefined,
    };
    vi.mocked(api.get).mockResolvedValue({ data: bare });

    render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
    await screen.findByText("Ana Souza");

    // Telefone, E-mail, Nascimento and Sexo all fall back to the placeholder;
    // "Membresía" isn't shown at all since classification isn't "member".
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });

  it("formats a 10-digit phone", async () => {
    const tenDigit = { ...person, phone: "5432211223" };
    vi.mocked(api.get).mockResolvedValue({ data: tenDigit });

    render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
    await screen.findByText("Ana Souza");

    expect(screen.getByText("(54) 3221-1223")).toBeInTheDocument();
  });

  it("falls back to the raw phone value when it doesn't have 10 or 11 digits", async () => {
    const oddPhone = { ...person, phone: "123" };
    vi.mocked(api.get).mockResolvedValue({ data: oddPhone });

    render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
    await screen.findByText("Ana Souza");

    expect(screen.getByText("123")).toBeInTheDocument();
  });

  it("resets state and notifies parent when the sheet is closed via its close control", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: person });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(<PersonSheet personId="p1" open={true} onOpenChange={onOpenChange} onUpdated={vi.fn()} />);
    await screen.findByText("Ana Souza");

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("edits every field of the form and saves a member with a membership date", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: person });
    vi.mocked(api.patch).mockResolvedValue({ data: person });
    const user = userEvent.setup();

    render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
    await screen.findByText("Ana Souza");
    await user.click(screen.getByRole("button", { name: /Editar/ }));

    const phoneInput = screen.getByPlaceholderText("(11) 99999-9999");
    await user.clear(phoneInput);
    await user.type(phoneInput, "11988887777");

    const emailInput = screen.getByDisplayValue("ana@email.com");
    await user.clear(emailInput);
    await user.type(emailInput, "nova@email.com");

    const birthInput = screen.getByDisplayValue("1990-01-15");
    await user.clear(birthInput);
    await user.type(birthInput, "1991-02-20");

    const comboboxes = screen.getAllByRole("combobox");
    const genderSelect = comboboxes[0];
    await user.selectOptions(genderSelect, "other");

    const membershipInput = screen.getByDisplayValue("2020-01-01");
    await user.clear(membershipInput);
    await user.type(membershipInput, "2021-03-10");

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/persons/p1",
        expect.objectContaining({
          phone: "11988887777",
          email: "nova@email.com",
          birth_date: "1991-02-20",
          gender: "other",
          membership_date: "2021-03-10",
        })
      )
    );
  });

  it("edits a person with no phone, email, birth date or gender, saving them all as undefined", async () => {
    const bare = {
      ...person,
      classification: "attendee",
      phone: undefined,
      email: undefined,
      birth_date: undefined,
      gender: undefined,
      membership_date: undefined,
    };
    vi.mocked(api.get).mockResolvedValue({ data: bare });
    vi.mocked(api.patch).mockResolvedValue({ data: bare });
    const user = userEvent.setup();

    render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
    await screen.findByText("Ana Souza");
    await user.click(screen.getByRole("button", { name: /Editar/ }));

    // Don't touch any optional field — save immediately.
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/persons/p1",
        expect.objectContaining({
          phone: undefined,
          email: undefined,
          birth_date: undefined,
          gender: undefined,
          membership_date: undefined,
        })
      )
    );
  });

  it("clears the membership date when switching classification away from member during edit", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: person }); // classification: "member"
    vi.mocked(api.patch).mockResolvedValue({ data: { ...person, classification: "visitor" } });
    const user = userEvent.setup();

    render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
    await screen.findByText("Ana Souza");
    await user.click(screen.getByRole("button", { name: /Editar/ }));

    // The membership-date field is visible while classification is "member".
    expect(screen.getByDisplayValue("2020-01-01")).toBeInTheDocument();

    const comboboxes = screen.getAllByRole("combobox");
    const classificationSelect = comboboxes[comboboxes.length - 1];
    await user.selectOptions(classificationSelect, "visitor");

    // Field disappears once membership_date was cleared client-side.
    expect(screen.queryByDisplayValue("2020-01-01")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/persons/p1",
        expect.objectContaining({ classification: "visitor", membership_date: undefined })
      )
    );
  });

  it("ignores a stale response for a person the user has since navigated away from", async () => {
    let resolveFirst!: (v: { data: typeof person }) => void;
    const firstPromise = new Promise<{ data: typeof person }>((res) => {
      resolveFirst = res;
    });
    const secondPerson = { ...person, id: "p2", full_name: "Bruno Lima" };

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/persons/p1") return firstPromise;
      if (url === "/persons/p2") return Promise.resolve({ data: secondPerson });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    const { rerender } = render(
      <PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />
    );

    // Navigate to a second person before the first request resolves — the
    // effect's cleanup marks the first request's signal as cancelled.
    rerender(<PersonSheet personId="p2" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
    await screen.findByText("Bruno Lima");

    // Resolving the stale first request must not clobber the current person.
    resolveFirst({ data: person });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
  });

  it("cancels editing without saving", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: person });
    const user = userEvent.setup();

    render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
    await screen.findByText("Ana Souza");
    await user.click(screen.getByRole("button", { name: /Editar/ }));

    expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Cancelar/ }));

    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  describe("acesso ao sistema", () => {
    function asTenantAdmin() {
      mockedUseAuth.mockReturnValue({
        user: { roles: ["tenant_admin"] } as ReturnType<typeof useAuth>["user"],
        isLoading: false,
        isAuthenticated: true,
        login: vi.fn(),
        logout: vi.fn(),
      });
    }

    it("hides the section for a role without tenant_admin or pastor", async () => {
      vi.mocked(api.get).mockResolvedValue({ data: person });
      render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
      await screen.findByText("Ana Souza");

      expect(screen.queryByText("Acesso ao sistema")).not.toBeInTheDocument();
    });

    it("sends the invite with the pre-filled email and chosen role", async () => {
      asTenantAdmin();
      vi.mocked(api.get).mockResolvedValue({ data: person });
      vi.mocked(api.post).mockResolvedValue({ data: { id: "u1", email: person.email } });
      const user = userEvent.setup();

      render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
      await screen.findByText("Ana Souza");

      await user.click(screen.getByRole("button", { name: /Conceder acesso/ }));
      const emailInput = screen.getByDisplayValue(person.email);
      await user.clear(emailInput);
      await user.type(emailInput, "outro@email.com");

      await user.selectOptions(screen.getByRole("combobox"), "secretary");
      await user.click(screen.getByRole("button", { name: /Enviar convite/ }));

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith("/users", {
          person_id: "p1",
          email: "outro@email.com",
          role_code: "secretary",
        })
      );
      expect(await screen.findByText(/Convite enviado por e-mail/)).toBeInTheDocument();
    });

    it("shows a conflict message when the person already has access", async () => {
      asTenantAdmin();
      vi.mocked(api.get).mockResolvedValue({ data: person });
      vi.mocked(api.post).mockRejectedValue({
        isAxiosError: true,
        response: { status: 409 },
      });
      const user = userEvent.setup();

      render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
      await screen.findByText("Ana Souza");

      await user.click(screen.getByRole("button", { name: /Conceder acesso/ }));
      await user.click(screen.getByRole("button", { name: /Enviar convite/ }));

      expect(
        await screen.findByText("Esta pessoa já tem acesso ao sistema.")
      ).toBeInTheDocument();
    });

    it("shows a permission message when the actor can't grant the chosen role", async () => {
      asTenantAdmin();
      vi.mocked(api.get).mockResolvedValue({ data: person });
      vi.mocked(api.post).mockRejectedValue({
        isAxiosError: true,
        response: { status: 403 },
      });
      const user = userEvent.setup();

      render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
      await screen.findByText("Ana Souza");

      await user.click(screen.getByRole("button", { name: /Conceder acesso/ }));
      await user.click(screen.getByRole("button", { name: /Enviar convite/ }));

      expect(
        await screen.findByText("Você não tem permissão para conceder este papel.")
      ).toBeInTheDocument();
    });

    it("shows a generic error message for any other failure", async () => {
      asTenantAdmin();
      vi.mocked(api.get).mockResolvedValue({ data: person });
      vi.mocked(api.post).mockRejectedValue(new Error("network down"));
      const user = userEvent.setup();

      render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
      await screen.findByText("Ana Souza");

      await user.click(screen.getByRole("button", { name: /Conceder acesso/ }));
      await user.click(screen.getByRole("button", { name: /Enviar convite/ }));

      expect(
        await screen.findByText("Erro ao enviar o convite. Tente novamente.")
      ).toBeInTheDocument();
    });

    it("cancels the invite form without calling the API", async () => {
      asTenantAdmin();
      vi.mocked(api.get).mockResolvedValue({ data: person });
      const user = userEvent.setup();

      render(<PersonSheet personId="p1" open={true} onOpenChange={vi.fn()} onUpdated={vi.fn()} />);
      await screen.findByText("Ana Souza");

      await user.click(screen.getByRole("button", { name: /Conceder acesso/ }));
      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(screen.queryByRole("button", { name: /Enviar convite/ })).not.toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });
  });
});
