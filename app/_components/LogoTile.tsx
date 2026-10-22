import Image from "next/image";
import { branding } from "@/lib/branding.ts";
import { t } from "@/lib/i18n/index.ts";
import classes from "./LogoTile.module.css";

export function LogoTile({ full = false }: { full?: boolean }) {
  return (
    <Image
      src={full ? branding.logo : branding.shellIcon}
      alt={t("org.name")}
      width={full ? branding.logoWidth : 36}
      height={full ? branding.logoHeight : 36}
      className={classes.logo}
      unoptimized
    />
  );
}
