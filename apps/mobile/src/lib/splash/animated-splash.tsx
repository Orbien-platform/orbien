// Splash animada — camada JS que assume no lugar da splash nativa
// (expo-splash-screen, configurada em app.config.js) enquanto a sessão
// hidrata.
//
// `splash-icon.png` traz a marca completa — anel, núcleo E satélite na
// posição de repouso (θ = 0, mesmo lugar do ícone do app) — para a splash
// nativa nunca mostrar um desenho incompleto. Só que essa mesma imagem
// também é a base daqui: sem tratamento, o satélite assado no PNG ficaria
// parado no repouso enquanto a `View` animada abaixo desenha um segundo
// satélite orbitando por cima — dois pontos na tela sempre que o animado
// se afasta do repouso.
//
// `satelliteMask` resolve isso: um círculo na cor do fundo, do mesmo
// tamanho e posição do satélite assado, sempre visível enquanto este
// componente está montado — apaga o satélite do PNG assim que o JS assume,
// e a `View` animada (por cima do mask) redesenha o satélite de verdade,
// parado ou em órbita. O que a splash nativa mostra (satélite assado, sem
// JS nenhum) e o que o primeiro frame do JS mostra (satélite "de verdade"
// no mesmo lugar) são visualmente idênticos — é isso que faz a troca não
// "pular".
//
// Abertura: a splash não some no instante em que o boot termina. Ela fica
// até o satélite completar a volta em curso — no mínimo uma, a partir do
// repouso — e então sai em fade. É o que faz a órbita ser vista como
// abertura do app, e não um relance: a sessão costuma hidratar em poucas
// centenas de ms, antes de meia volta. Terminar na virada da volta faz o
// fade começar com o satélite de novo no repouso (onde o `easing` o deixa
// quase parado), e não no meio do caminho. Com "reduzir movimento" não há
// volta a esperar: sai assim que o boot termina.
//
// Sem `react-native-svg` para o satélite animado: ele é uma `View` circular
// posicionada pela mesma equação da elipse que gerou o asset. Uma
// dependência a menos por um `<Circle>`.
import Constants from "expo-constants";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";

/** Largura da marca, em dp — a mesma que o plugin usa na splash nativa. */
const ICON_WIDTH = Number(Constants.expoConfig?.extra?.splashIconWidth) || 200;
const BACKGROUND = Constants.expoConfig?.extra?.splashBackground ?? "#1E3A7B";
// O satélite é o accent da build (§6 do STYLE-GUIDE.md, camada de build da
// paleta — ver src/lib/theme/brand-theme.ts). Numa build genérica isto é o
// teal da plataforma; numa personalizada, o accent da igreja. Não pode vir
// do ThemeContext: a splash desenha antes de haver sessão, e é justamente
// por isso que a paleta tem uma camada de build.
const SATELLITE_COLOR = Constants.expoConfig?.extra?.brandTheme?.accentColor ?? "#00B8A2";

// Geometria da marca, nas mesmas unidades do BrandMark do site (viewBox
// 22x22): órbita com rx 9 / ry 4 em (11,11), satélite de raio 2. O gerador
// do PNG desenha a marca ocupando 66% da largura do canvas quadrado, com o
// centro do desenho (11.625, 11) no centro do canvas — as constantes abaixo
// refazem essa conta para px.
const MARK_WIDTH_UNITS = 20.75;
const MARK_COVERAGE = 0.66;
const ORBIT_CENTER_OFFSET_UNITS = 11 - 11.625;

const unit = (ICON_WIDTH * MARK_COVERAGE) / MARK_WIDTH_UNITS;
const orbitCenterX = ICON_WIDTH / 2 + ORBIT_CENTER_OFFSET_UNITS * unit;
const orbitCenterY = ICON_WIDTH / 2;
const orbitRadiusX = 9 * unit;
const orbitRadiusY = 4 * unit;
const satelliteRadius = 2 * unit;

const ORBIT_DURATION_MS = 1800;
const FADE_IN_MS = 420;
const EXIT_MS = 320;

// Uma volta completa amostrada em passos suficientes para a elipse não
// virar polígono visível.
const STEPS = 48;
const progress = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);
const angles = progress.map((t) => t * 2 * Math.PI);

// θ = 0 põe o satélite na ponta direita da órbita (onde ele está no ícone
// do app); sin > 0 desce na tela, ou seja, a primeira meia-volta passa por
// baixo — na frente do núcleo.
const offsetsX = angles.map((a) => orbitRadiusX * Math.cos(a));
const offsetsY = angles.map((a) => orbitRadiusY * Math.sin(a));
// Profundidade: maior e opaco na passagem da frente, menor e apagado
// quando está atrás do núcleo.
const depthScale = angles.map((a) => 1 + 0.14 * Math.sin(a));
const depthOpacity = angles.map((a) => 0.62 + 0.38 * ((Math.sin(a) + 1) / 2));

type AnimatedSplashProps = {
  /** Primeiro frame desenhado — gatilho para esconder a splash nativa. */
  onReady?: () => void;
  /** O boot terminou: a splash fecha a volta em curso e sai. */
  done?: boolean;
  /** O fade de saída acabou; quem monta a splash já pode desmontá-la. */
  onFinish?: () => void;
};

export function AnimatedSplash({ onReady, done = false, onFinish }: AnimatedSplashProps) {
  // `useState` lazy, não `useRef(...).current`: os dois guardam o mesmo
  // valor estável entre renders, mas o segundo é leitura de ref durante o
  // render — o que a regra `react-hooks/refs` (eslint-config-expo) barra.
  const [orbit] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(0));
  const [exit] = useState(() => new Animated.Value(1));
  const [reduceMotion, setReduceMotion] = useState(false);
  // Início da órbita, para saber onde termina a volta em curso. A saída é
  // cronometrada por timer, não pelo callback da animação: com o driver
  // nativo, quem anda é o lado nativo, e o JS só precisa saber quando.
  const orbitStartedAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduceMotion(enabled);
      })
      .catch(() => {
        // Sem resposta do sistema: mantém a animação (default do RN).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const fadeIn = Animated.timing(fade, {
      toValue: 1,
      duration: FADE_IN_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    fadeIn.start();

    if (reduceMotion) return () => fadeIn.stop();

    // `inOut`: o satélite arranca do repouso e assenta de volta nele a cada
    // volta — é o que deixa a saída, sempre na virada, sem tranco.
    const loop = Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: ORBIT_DURATION_MS,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    );
    orbitStartedAt.current = Date.now();
    loop.start();

    return () => {
      fadeIn.stop();
      loop.stop();
    };
  }, [fade, orbit, reduceMotion]);

  useEffect(() => {
    if (!done) return;

    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    let exitAnimation: Animated.CompositeAnimation | undefined;
    const elapsed = Date.now() - orbitStartedAt.current;
    const turns = Math.max(1, Math.ceil(elapsed / ORBIT_DURATION_MS));
    const wait = reduceMotion ? 0 : turns * ORBIT_DURATION_MS - elapsed;

    const turnTimer = setTimeout(() => {
      exitAnimation = Animated.timing(exit, {
        toValue: 0,
        duration: EXIT_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      });
      exitAnimation.start();
      exitTimer = setTimeout(() => onFinish?.(), EXIT_MS);
    }, wait);

    return () => {
      clearTimeout(turnTimer);
      clearTimeout(exitTimer);
      exitAnimation?.stop();
    };
  }, [done, reduceMotion, exit, onFinish]);

  const interpolate = (outputRange: number[]) =>
    orbit.interpolate({ inputRange: progress, outputRange });

  return (
    <Animated.View
      testID="splash"
      accessibilityRole="progressbar"
      accessibilityLabel="Carregando"
      style={[styles.container, { backgroundColor: BACKGROUND, opacity: exit }]}
      onLayout={onReady}
    >
      <Animated.View style={[styles.mark, { opacity: fade }]}>
        <Animated.Image
          testID="splash-logo"
          source={require("../../../assets/splash-icon.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <View
          testID="splash-satellite-mask"
          style={[styles.satelliteMask, { backgroundColor: BACKGROUND }]}
        />
        <Animated.View
          testID="splash-satellite"
          style={[
            styles.satellite,
            {
              opacity: reduceMotion ? 1 : interpolate(depthOpacity),
              transform: [
                { translateX: interpolate(offsetsX) },
                { translateY: interpolate(offsetsY) },
                { scale: reduceMotion ? 1 : interpolate(depthScale) },
              ],
            },
          ]}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: {
    width: ICON_WIDTH,
    height: ICON_WIDTH,
  },
  logo: {
    width: ICON_WIDTH,
    height: ICON_WIDTH,
  },
  satellite: {
    position: "absolute",
    left: orbitCenterX - satelliteRadius,
    top: orbitCenterY - satelliteRadius,
    width: satelliteRadius * 2,
    height: satelliteRadius * 2,
    borderRadius: satelliteRadius,
    backgroundColor: SATELLITE_COLOR,
  },
  // Mesma posição e tamanho do satélite assado em `splash-icon.png` — que é
  // a posição de repouso (θ = 0) da órbita, `orbitCenterX + orbitRadiusX`.
  // Apaga esse satélite assado enquanto o JS está montado; ver comentário
  // do módulo.
  satelliteMask: {
    position: "absolute",
    left: orbitCenterX + orbitRadiusX - satelliteRadius,
    top: orbitCenterY - satelliteRadius,
    width: satelliteRadius * 2,
    height: satelliteRadius * 2,
    borderRadius: satelliteRadius,
  },
});
