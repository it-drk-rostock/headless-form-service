import "@mantine/core/styles.css";
import "./globals.css";
import {
  ColorSchemeScript,
  MantineProvider,
  mantineHtmlProps,
} from "@mantine/core";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { locale, t } from "@/lib/i18n/index.ts";
import { theme } from "./theme.ts";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: t("app.title"), template: `%s · ${t("app.title")}` },
  description: t("app.description"),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={locale} className={inter.variable} {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript forceColorScheme="light" />
      </head>
      <body>
        <MantineProvider theme={theme} forceColorScheme="light">
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
