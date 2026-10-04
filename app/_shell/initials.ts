/** Avatar initials: first and last name, or the first letter of the email when no name is set. */
export function initials(fullName: string, email: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return email.charAt(0).toUpperCase();
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}
