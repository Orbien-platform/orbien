// Tela Escala (MOB-04) — substitui o placeholder de rota-raiz. Lista os
// próximos slots do usuário (AC 1), permite confirmar/recusar um slot
// pendente (AC 2, atualização otimista local — sem refetch, mesmo
// princípio de apps/web/src/app/(admin)/voluntarios/page.tsx:169-232) e
// fazer check-in de um slot confirmado (AC 3, botão some após sucesso).
// Nome do app já aparece no header (ThemedShell, _layout.tsx) — esta tela
// não repete o literal.
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Button, FlatList, Text, View } from "react-native";

import { HttpError } from "../../lib/api/errors";
import { checkIn, getMyAssignments, respondToAssignment } from "../../lib/escala/escala-client";
import type { Assignment } from "../../lib/escala/types";

const NETWORK_ERROR_MESSAGE = "Não foi possível carregar sua escala. Verifique sua conexão.";
const ACTION_ERROR_MESSAGE = "Não foi possível concluir a ação. Tente novamente.";

export default function EscalaScreen() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Guarda contra duplo toque: um id em ação (respond ou check-in) não
  // dispara outra chamada até a primeira resolver — evita duas requests
  // para o mesmo assignment antes do estado atualizar e sumir com o
  // botão (achado do /code-review, PR #56). `pendingIdsRef` é a fonte da
  // verdade do guard (mutação síncrona, não espera re-render); `pendingIds`
  // (state) só existe para o `disabled` visual dos botões.
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    getMyAssignments()
      .then((result) => {
        if (cancelled) return;
        setAssignments(result);
      })
      .catch(() => {
        if (cancelled) return;
        setError(NETWORK_ERROR_MESSAGE);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function updateAssignment(id: string, patch: Partial<Assignment>) {
    setAssignments((current) =>
      current ? current.map((a) => (a.id === id ? { ...a, ...patch } : a)) : current,
    );
  }

  function markPending(id: string): void {
    pendingIdsRef.current.add(id);
    setPendingIds(new Set(pendingIdsRef.current));
  }

  function clearPending(id: string): void {
    pendingIdsRef.current.delete(id);
    setPendingIds(new Set(pendingIdsRef.current));
  }

  async function handleRespond(id: string, status: "confirmed" | "declined") {
    if (pendingIdsRef.current.has(id)) return;
    markPending(id);
    setActionError(null);
    try {
      const updated = await respondToAssignment(id, status);
      updateAssignment(id, updated);
    } catch {
      setActionError(ACTION_ERROR_MESSAGE);
    } finally {
      clearPending(id);
    }
  }

  async function handleCheckIn(id: string) {
    if (pendingIdsRef.current.has(id)) return;
    markPending(id);
    setActionError(null);
    try {
      const updated = await checkIn(id);
      updateAssignment(id, updated);
    } catch (err) {
      // Check-in duplicado (race de duplo toque): design.md trata como
      // no-op silencioso — o botão já some após o primeiro sucesso.
      if (!(err instanceof HttpError && err.status === 409)) {
        setActionError(ACTION_ERROR_MESSAGE);
      }
    } finally {
      clearPending(id);
    }
  }

  if (error) {
    return (
      <View testID="escala-error" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>{error}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Button
        testID="indisponibilidade-link"
        title="Minha indisponibilidade"
        onPress={() => router.push("/indisponibilidade")}
      />
      {actionError ? <Text testID="escala-action-error">{actionError}</Text> : null}
      <FlatList
        testID="escala-list"
        data={assignments ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View testID={`assignment-${item.id}`}>
            <Text>{item.celebration.name}</Text>
            <Text>{item.ministry.name}</Text>
            {item.status === "pending" ? (
              <View>
                <Button
                  testID={`confirm-${item.id}`}
                  title="Confirmar"
                  disabled={pendingIds.has(item.id)}
                  onPress={() => handleRespond(item.id, "confirmed")}
                />
                <Button
                  testID={`decline-${item.id}`}
                  title="Recusar"
                  disabled={pendingIds.has(item.id)}
                  onPress={() => handleRespond(item.id, "declined")}
                />
              </View>
            ) : null}
            {item.status === "confirmed" && !item.checked_in_at ? (
              <Button
                testID={`check-in-${item.id}`}
                title="Fazer check-in"
                disabled={pendingIds.has(item.id)}
                onPress={() => handleCheckIn(item.id)}
              />
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
