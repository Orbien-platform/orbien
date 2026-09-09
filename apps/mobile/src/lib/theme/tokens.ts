// Tokens estáticos de design (cor de marca fica no ThemeProvider, por
// tenant — ver theme-provider.tsx). Estes aqui são os mesmos em qualquer
// tenant: fundo, superfície, texto, espaçamento, raio.
export const colors = {
  background: "#f3f4f8",
  surface: "#ffffff",
  border: "#e2e5ec",
  text: "#161a24",
  textMuted: "#6b7280",
  textInverse: "#ffffff",
  danger: "#b91c1c",
  dangerSurface: "#fef2f2",
  dangerBorder: "#fecaca",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
};

export const typography = {
  title: { fontSize: 20, fontWeight: "700" as const, color: colors.text },
  subtitle: { fontSize: 16, fontWeight: "600" as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  caption: { fontSize: 13, color: colors.textMuted },
};
