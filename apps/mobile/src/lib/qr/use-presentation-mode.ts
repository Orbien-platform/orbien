// Modo "mostrar código": tela no brilho máximo e sem apagar enquanto a tela
// de QR estiver aberta. É o que deixa o líder passar o celular pela sala, ou
// a secretaria projetar o QR no culto, sem o aparelho escurecer no meio.
//
// O brilho vale só para o app (`setBrightnessAsync`, não o do sistema) e
// volta ao valor de antes quando a tela sai. Sem permissão nenhuma: o
// brilho do app não pede `WRITE_SETTINGS` no Android.
import * as Brightness from "expo-brightness";
import { useKeepAwake } from "expo-keep-awake";
import { useEffect } from "react";

const KEEP_AWAKE_TAG = "orbien-qr";

export function usePresentationMode(): void {
  useKeepAwake(KEEP_AWAKE_TAG);

  useEffect(() => {
    let previous: number | null = null;
    let left = false;

    Brightness.getBrightnessAsync()
      .then((value) => {
        if (left) return;
        previous = value;
        return Brightness.setBrightnessAsync(1);
      })
      .catch(() => {
        // Aparelho sem controle de brilho (simulador, web): o QR continua
        // na tela, só não clareia.
      });

    return () => {
      left = true;
      if (previous !== null) {
        Brightness.setBrightnessAsync(previous).catch(() => undefined);
      }
    };
  }, []);
}
