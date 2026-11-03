// "Reduzir movimento" do sistema (iOS: Ajustes > Acessibilidade > Movimento;
// Android: remover animações). Lê o valor inicial e acompanha mudanças.
// Antes de a leitura assíncrona voltar, assume `false` — o movimento só é
// pequeno (3px), e o valor chega antes do primeiro frame útil.
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((value) => {
        if (!cancelled) setReduce(value);
      });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return reduce;
}
