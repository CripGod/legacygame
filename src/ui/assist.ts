/**
 * Assist mode: the no-drag, no-shortcut way to play. Off by default so the card sheet is just the card and its
 * History; on, the sheet grows a tray of "Play at …" buttons and "Put back" under the card. See docs/accessibility.md.
 * Enable with localStorage bhcb.assist.v1 = "1", or ?assist=1 on the URL.
 */
export function assistButtons(): boolean {
  try {
    return window.localStorage.getItem('bhcb.assist.v1') === '1' || window.location.search.includes('assist=1');
  } catch {
    return false;
  }
}
