import { Box, Text } from "@mantine/core";
import { t } from "@/lib/i18n/index.ts";
import classes from "./LogoTile.module.css";

/** Red app tile with "DRK" until the official logo files arrive (docs/ui-design.md §7). */
export function LogoTile() {
  return (
    <Box className={classes.tile}>
      <Text c="white" fw={600} fz={11}>
        {t("app.logoTile")}
      </Text>
    </Box>
  );
}
