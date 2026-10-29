/**
 * Plain sentences for the errors people actually hit, in place of raw client or
 * database text ("TypeError: Failed to fetch"). Anything unrecognised passes
 * through unchanged: Supabase's own auth messages are already readable.
 */
const PLAIN: [RegExp, string][] = [
  [/failed to fetch|networkerror|network request failed|load failed/i, "Couldn't reach the server. Check your connection and try again."],
  [/invalid login credentials/i, "That email and password don't match an account."],
  [/user already registered/i, "There's already an account with that email. Sign in instead."],
  [/email not confirmed/i, "Confirm your email first: open the link we sent you, then sign in."],
  [/invalid, expired, or already-used invite|invalid or used invite code/i, "That code doesn't work any more. It may have expired or been used. Ask your partner for a new one."],
  [/cannot pair with yourself/i, "That's your own invite code. Send it to your partner to link."],
];

export function plainError(message: string): string {
  return PLAIN.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}
