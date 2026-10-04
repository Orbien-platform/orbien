"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";

/**
 * Quem é a igreja deste painel: o nome para o topo do menu e a cor da marca.
 *
 * Vem de `GET /settings`, que não tem `@Roles` — qualquer sessão autenticada
 * lê, então todo papel enxerga a própria igreja no menu. Falhar aqui não
 * bloqueia nada: o menu cai no nome genérico e a cor no azul Orbien.
 *
 * A cor da igreja vira `--brand` na raiz do documento — é o white-label da
 * direção Órbita. O teal é da Orbien e não muda. Uma cor salva em
 * Configurações só chega aqui na próxima carga do painel.
 */
export interface ChurchIdentity {
  churchName: string | null;
  congregationName: string | null;
}

interface SettingsIdentity {
  tenant: { name: string | null };
  congregation: { name: string | null };
  branding: { primary_color: string | null };
}

const EMPTY: ChurchIdentity = { churchName: null, congregationName: null };

const ChurchIdentityContext = createContext<ChurchIdentity>(EMPTY);

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function ChurchIdentityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [identity, setIdentity] = useState<ChurchIdentity>(EMPTY);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    api
      .get<SettingsIdentity>("/settings")
      .then(({ data }) => {
        if (cancelled) return;
        setIdentity({
          churchName: data.tenant?.name || null,
          congregationName: data.congregation?.name || null,
        });
        const color = data.branding?.primary_color;
        if (color && HEX_COLOR.test(color)) {
          document.documentElement.style.setProperty("--brand", color);
        }
      })
      .catch(() => {
        // Sem identidade, o menu usa o fallback — nada a avisar ao usuário.
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <ChurchIdentityContext.Provider value={identity}>
      {children}
    </ChurchIdentityContext.Provider>
  );
}

export function useChurchIdentity(): ChurchIdentity {
  return useContext(ChurchIdentityContext);
}
