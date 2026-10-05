/** A profile as embedded through a foreign key, e.g. who saved or published. */
export type ProfileNameRow = { full_name: string; email: string };

/** How a person is named: their name, or their address if they have none; null when not visible. */
export function profileName(profile: ProfileNameRow | null): string | null {
  return profile ? profile.full_name || profile.email : null;
}
