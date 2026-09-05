// Espelho da spec de mesmo nome no `apps/web`: o componente é byte a byte
// idêntico nos dois apps (copiado de lá quando o console nasceu). Enquanto
// forem duplicatas, as specs também são — se um dia virarem um pacote
// compartilhado, esta some junto.

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchInput } from "./SearchInput";

describe("SearchInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("usa placeholder e defaultValue passados", () => {
    render(<SearchInput onSearch={vi.fn()} placeholder="Procurar pessoa" defaultValue="ana" />);
    expect(screen.getByPlaceholderText("Procurar pessoa")).toHaveValue("ana");
  });

  it("dispara onSearch só depois do debounce", () => {
    const onSearch = vi.fn();
    render(<SearchInput onSearch={onSearch} debounce={300} />);
    const input = screen.getByPlaceholderText("Buscar…");

    fireEvent.change(input, { target: { value: "joao" } });
    expect(onSearch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(onSearch).toHaveBeenLastCalledWith("joao");
  });

  it("reinicia o debounce a cada digitação", () => {
    const onSearch = vi.fn();
    render(<SearchInput onSearch={onSearch} debounce={300} />);
    const input = screen.getByPlaceholderText("Buscar…");

    fireEvent.change(input, { target: { value: "a" } });
    vi.advanceTimersByTime(200);
    fireEvent.change(input, { target: { value: "ab" } });
    vi.advanceTimersByTime(200);
    expect(onSearch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(onSearch).toHaveBeenLastCalledWith("ab");
  });
});
