import { createTheme, type MantineColorsTuple } from "@mantine/core";

// DRK red, shade 6 is the corporate red #E60005 (docs/ui-design.md §2.1).
const drkRed: MantineColorsTuple = [
  "#FFE9EA",
  "#FFD1D2",
  "#FBA1A3",
  "#F76E71",
  "#F34347",
  "#F0262B",
  "#E60005",
  "#CC0004",
  "#B30004",
  "#990003",
];

export const theme = createTheme({
  primaryColor: "drkRed",
  primaryShade: 6,
  colors: { drkRed },
  black: "#1A1B1E",
  defaultRadius: "sm",
  fontFamily: "var(--font-inter), system-ui, sans-serif",
  fontFamilyMonospace: "ui-monospace, SFMono-Regular, Menlo, monospace",
  headings: {
    fontWeight: "600",
    sizes: {
      h1: { fontSize: "22px", lineHeight: "1.3" },
      h2: { fontSize: "16px", lineHeight: "1.4" },
    },
  },
});
