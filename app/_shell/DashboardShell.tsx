"use client";

import { AppShell, Box, Drawer, em } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { usePathname } from "next/navigation";
import { IconRail } from "./IconRail.tsx";
import { ModuleSidebar } from "./ModuleSidebar.tsx";
import { activeModule } from "./navigation.ts";
import { TopBar } from "./TopBar.tsx";

const RAIL_WIDTH = 56;
const SIDEBAR_WIDTH = 248;
// Mantine's default `md` breakpoint: below it the sidebar lives in a drawer.
const SIDEBAR_INLINE_FROM = em(992);

/**
 * Monospace-style shell (docs/ui-design.md §4): icon rail, collapsible module
 * sidebar, breadcrumb top bar. Below `md` the sidebar moves into a drawer and
 * only the rail stays.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentModule = activeModule(pathname);
  const sidebarInline = useMediaQuery(`(min-width: ${SIDEBAR_INLINE_FROM})`);
  const [sidebarOpen, sidebar] = useDisclosure(true);
  const [drawerOpen, drawer] = useDisclosure(false);

  const showSidebar = () => (sidebarInline ? sidebar.open() : drawer.open());
  const sidebarProps = { activeId: currentModule?.id, pathname };

  return (
    <AppShell
      layout="alt"
      header={{ height: 48 }}
      navbar={{
        width: {
          base: RAIL_WIDTH,
          md: sidebarOpen ? RAIL_WIDTH + SIDEBAR_WIDTH : RAIL_WIDTH,
        },
        // The navbar never turns into a full-width mobile menu: the rail always stays.
        breakpoint: 0,
      }}
    >
      <AppShell.Header>
        <TopBar
          module={currentModule}
          sidebarHidden={!sidebarOpen}
          onShowSidebar={showSidebar}
        />
      </AppShell.Header>
      <AppShell.Navbar>
        <Box display="flex" h="100%">
          <IconRail activeId={currentModule?.id} width={RAIL_WIDTH} />
          {sidebarOpen && (
            <Box visibleFrom="md" w={SIDEBAR_WIDTH}>
              <ModuleSidebar {...sidebarProps} onHide={sidebar.close} />
            </Box>
          )}
        </Box>
      </AppShell.Navbar>
      <Drawer
        opened={drawerOpen}
        onClose={drawer.close}
        hiddenFrom="md"
        size={SIDEBAR_WIDTH}
        withCloseButton={false}
        padding={0}
      >
        <ModuleSidebar
          {...sidebarProps}
          onHide={drawer.close}
          onNavigate={drawer.close}
        />
      </Drawer>
      <AppShell.Main bg="gray.0">{children}</AppShell.Main>
    </AppShell>
  );
}
