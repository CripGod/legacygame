# Accessibility

Parked code for a pointer-free way to play, to explore later.

- `CardTray.tsx`: `CardSheetWithTray` and `CharSheetWithTray`. The Compendium card stage with an action
  tray under the card: send a hand card to a named Location, play an Event, enter, relocate, Harriet's
  free move, Yemoja's bring-across, cancel a planned play. Every action is a real button, so it works with
  a keyboard and a screen reader, unlike the drag-and-drop the match uses today.

Neither component is mounted. To try them, render `CardSheetWithTray` and `CharSheetWithTray` in
`MatchScreen.tsx` where `CardSheet` and `CharSheet` are rendered now, passing the plan, the legal options
and the callbacks the props ask for (the wiring that existed in commit `cdedb2b`). The tray styles are in
`compendium.css` under `.cx-tray` and `.cx-stage.has-tray`.
