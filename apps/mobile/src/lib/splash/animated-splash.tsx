// Splash animada — camada JS que assume no lugar da splash nativa
// (expo-splash-screen, configurada em app.config.js) enquanto a sessão
// hidrata.
//
// A splash nativa mostra só o anel e o núcleo da marca; aqui o mesmo PNG é
// desenhado no mesmo tamanho (`splashIconWidth`, vindo de
// `Constants.expoConfig.extra`) e o satélite entra por cima, percorrendo a
// órbita. Como a imagem não muda de tamanho nem de posição, a troca do
// nativo para o JS não "pula" — o que aparece é o satélite começando a
// girar.
//
// Sem `react-native-svg`: o anel e o núcleo já vêm rasterizados no PNG, e o
// satélite é uma `View` circular posicionada pela mesma equação da elipse
// que gerou o asset. Uma dependência a menos por um `<Circle>`.
import Constants from "expo-constants";
import { useEffect, useState } from "react";
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

const ORBIT_DURATION_MS = 2400;
const FADE_IN_MS = 420;

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

export function AnimatedSplash({ onReady }: { onReady?: () => void }) {
  // `useState` lazy, não `useRef(...).current`: os dois guardam o mesmo
  // valor estável entre renders, mas o segundo é leitura de ref durante o
  // render — o que a regra `react-hooks/refs` (eslint-config-expo) barra.
  const [orbit] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

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

    const loop = Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: ORBIT_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();

    return () => {
      fadeIn.stop();
      loop.stop();
    };
  }, [fade, orbit, reduceMotion]);

  const interpolate = (outputRange: number[]) =>
    orbit.interpolate({ inputRange: progress, outputRange });

  return (
    <View
      testID="splash"
      accessibilityRole="progressbar"
      accessibilityLabel="Carregando"
      style={[styles.container, { backgroundColor: BACKGROUND }]}
      onLayout={onReady}
    >
      <Animated.View style={[styles.mark, { opacity: fade }]}>
        <Animated.Image
          testID="splash-logo"
          source={require("../../../assets/splash-icon.png")}
          style={styles.logo}
          resizeMode="contain"
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
    </View>
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
});
