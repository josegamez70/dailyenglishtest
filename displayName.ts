const DISPLAY_NAME = /^[\p{L}\p{M}0-9 ._'-]*$/u;

/** Empty is allowed. Anything else must be letters, numbers, spaces, and . _ - '. */
export function displayNameError(value: string, max = 40): string | null {
  const name = value.trim();
  if ([...name].length > max) return `Use ${max} characters or fewer.`;
  if (!DISPLAY_NAME.test(name)) return "Use letters, numbers, spaces, and . _ - ' only.";
  return null;
}
