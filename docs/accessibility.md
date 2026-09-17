# Accessibility notes

What the game keeps for players who cannot drag, cannot see well, or play by keyboard. Most of it is built and
switched off by default; this page says where it lives and how to turn it on.

## Playing a card without dragging

By default the card sheet (open a hand card) is just the card and its History, as large as the window allows.
The card plays by drag, by tapping the card and then a Location, or with the **1, 2, 3** keys while the card is
selected.

**Assist mode** adds a tray under the card with one button per open Location ("Play at Harpers Ferry") and a
"Put back" button. Nothing else changes. Turn it on either way:

- add `?assist=1` to the URL, or
- in the browser console: `localStorage.setItem('bhcb.assist.v1', '1')` and reload.

Where it lives:

- `src/ui/assist.ts` reads the flag (`assistButtons()`).
- `src/ui/screens/MatchScreen.tsx` builds the tray as the `actions` prop of `CardSheet` and shows it only when
  the flag is on. The buttons call the same `commitPlay(location, cardId)` the drag and the keys use.
- `src/ui/components/Sheets.tsx` (`CardSheet`) passes `actions` through to the stage as its tray; the tray's
  styles are `.cx-tray` in `src/ui/compendium.css`. With a tray the card gives up `--big-reserve` of height so
  the tray stays on screen.

The plan is for this to become a Settings toggle ("Play with buttons") with a screen-reader label on each
button, once the settings menu grows a Play section. Keep the prop and the tray when refactoring the sheet.

## Already in place

- Every Location is reachable by keyboard from a selected card (1-3), and Lock In has a button.
- The card sheet is a `role="dialog"` with `aria-modal` and a labelled close button; Escape and a click outside
  close it.
- Card text never carries meaning by colour alone: Influence and Force are labelled orbs, the owner's side is
  named in the row label ("Your Characters"), and the heal wave's colour is paired with the +N label.
- `prefers-reduced-motion` turns off the card tilt, the trails, the fireworks and the Threat shake.

## Not yet

- Screen-reader narration of the resolve (the beats are visual and audio only).
- A high-contrast theme.
- Remapping the 1-3 keys.
