import { Platform, Share } from 'react-native';

/**
 * "Deal a friend in": the app's pitch, sent through the share sheet. Where there is no share sheet (most
 * desktop browsers) it is copied instead, and every outcome is reported so the screen can say what
 * happened: a tap never just does nothing.
 */

export const PITCH = 'I’m keeping my habits with Do Better. Every day you keep one deals a playing card, and every week plays as a poker hand. No streaks to break.';

/** The words to share, with the link where each platform wants it. */
export function inviteContent(url: string, os: string): { message: string; url?: string } {
  if (!url) return { message: PITCH };
  // iOS shares the link as its own item next to the words; elsewhere only the message goes, so the link goes in it.
  return os === 'ios' ? { message: PITCH, url } : { message: `${PITCH}\n${url}` };
}

export type InviteOutcome = 'shared' | 'cancelled' | 'copied' | 'failed';

type Clipboard = { writeText?: (text: string) => Promise<void> };
type Nav = { share?: unknown; clipboard?: Clipboard };

const nav = (): Nav | undefined => (globalThis as { navigator?: Nav }).navigator;

async function copy(text: string): Promise<boolean> {
  try {
    const clipboard = nav()?.clipboard;
    if (!clipboard?.writeText) return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Opens the share sheet with the pitch, or copies it where there is none. */
export async function sendInvite(url: string): Promise<InviteOutcome> {
  const content = inviteContent(url, Platform.OS);
  const text = content.url ? `${content.message}\n${content.url}` : content.message;
  // A browser without a share sheet goes straight to the clipboard.
  if (Platform.OS === 'web' && typeof nav()?.share !== 'function') return (await copy(text)) ? 'copied' : 'failed';
  try {
    const result = await Share.share(content);
    return result?.action === Share.dismissedAction ? 'cancelled' : 'shared';
  } catch (e) {
    // Closing a browser's share sheet rejects; that's a choice, not a failure.
    if ((e as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
    return (await copy(text)) ? 'copied' : 'failed';
  }
}
