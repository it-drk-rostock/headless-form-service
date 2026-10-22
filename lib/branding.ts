/** Public branding values are fixed when the app is built. */
export const branding = {
  shellIcon: "https://www.drk-rostock.de/fileadmin/intranet/app_shell_icon.svg",
  logo: "https://www.drk-rostock.de/fileadmin/intranet/logo.svg",
  favicon: "https://www.drk-rostock.de/fileadmin/intranet/favicon_drk.ico",
  logoWidth: dimension(process.env.NEXT_PUBLIC_APP_LOGO_WIDTH, 150),
  logoHeight: dimension(process.env.NEXT_PUBLIC_APP_LOGO_HEIGHT, 48),
};

function dimension(value: string | undefined, fallback: number): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}
