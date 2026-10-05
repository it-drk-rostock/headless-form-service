"use client";

import { Anchor, type AnchorProps } from "@mantine/core";
import Link from "next/link";

/**
 * A Mantine link that navigates client-side. Server Components cannot pass
 * `component={Link}` themselves, since functions don't cross to the client.
 */
export function AnchorLink({
  href,
  children,
  ...props
}: AnchorProps & { href: string; children: React.ReactNode }) {
  return (
    <Anchor component={Link} href={href} {...props}>
      {children}
    </Anchor>
  );
}
