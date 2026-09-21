using System;
using System.Collections.Generic;
using System.Linq;
using StandOnBusiness.Engine;
using UnityEngine;
using UnityEngine.UIElements;

namespace StandOnBusiness.Game
{
    /// <summary>
    /// The first board: a match against Harborlight, drawn with UI Toolkit from the engine's state. The human sits in
    /// seat A. Everything on screen comes from the state and the legal options; every change to the plan is validated
    /// by the engine before it lands, so the board can never lock in an illegal turn.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public sealed class MatchScreen : MonoBehaviour
    {
        [Tooltip("0 picks a random seed each match.")] public long Seed;
        public string DeckA = "railroad";
        public string DeckB = "blackstar";
        [Tooltip("Your name in the log: the engine writes \"<handle> plays ...\".")] public string Handle = "Silverlake Slayer";

        const string Me = Rules.PlayerA;
        const string Ai = Rules.PlayerB;

        ContentTable content;
        GameState state;
        TurnPlan plan;
        LegalOptions opts;
        List<GameEvent> log = new List<GameEvent>();
        List<string> history = new List<string>();

        // Selection: a hand card waiting for a Location, a Character waiting for a destination, or a play waiting for its target.
        string selectedCard;
        string movingUid;
        PlayAction pendingTarget;
        PlayOption pendingOption;
        string status = "";

        VisualElement root;

        void OnEnable()
        {
            var doc = GetComponent<UIDocument>();
            root = doc.rootVisualElement;
            var sheet = Resources.Load<StyleSheet>("board");
            if (sheet != null) root.styleSheets.Add(sheet);
            if (content == null)
            {
                var text = Resources.Load<TextAsset>("content");
                if (text == null) { root.Add(new Label("Resources/content.json is missing: run `npm run export` in the repo root.")); return; }
                content = ContentTable.Parse(text.text);
            }
            StartMatch();
        }

        void StartMatch()
        {
            long seed = Seed != 0 ? Seed : UnityEngine.Random.Range(1, int.MaxValue);
            state = Setup.CreateMatch(content, new MatchOptions
            {
                Seed = seed,
                DeckKeys = new Dictionary<string, string> { [Me] = DeckA, [Ai] = DeckB },
                Handles = new Dictionary<string, string> { [Me] = string.IsNullOrWhiteSpace(Handle) ? "Silverlake Slayer" : Handle.Trim(), [Ai] = "Harborlight" },
            });
            history.Clear();
            log = View.FilterEvents(state.LastEvents, Me);
            NewPlan();
            status = $"Seed {seed}. Pick a card, then a Location.";
            Render();
        }

        void NewPlan()
        {
            plan = TurnPlan.Empty();
            plan.StandOnBusiness = false;
            plan.StepOff = false;
            opts = state.Phase == Rules.PhasePlanning ? Query.LegalOptionsFor(content, state, Me) : new LegalOptions();
            selectedCard = null;
            movingUid = null;
            pendingTarget = null;
            pendingOption = null;
        }

        // ---------- plan edits, each validated by the engine before it stays ----------

        bool Try(System.Action edit, string undoMessage)
        {
            var before = Json.Write(plan);
            edit();
            var errors = Query.ValidatePlan(content, state, Me, plan);
            if (errors.Count == 0) return true;
            plan = Json.Read<TurnPlan>(before);
            status = undoMessage != null ? $"{undoMessage}: {errors[0]}" : errors[0];
            return false;
        }

        void PickCard(string cardId)
        {
            var planned = plan.Plays.FirstOrDefault(pl => pl.CardId == cardId);
            if (planned != null)
            {
                Try(() => plan.Plays.Remove(planned), null);
                status = $"{Setup.CardName(content, cardId)} is back in your hand.";
                selectedCard = null;
            }
            else if (selectedCard == cardId)
            {
                selectedCard = null;
                status = "";
            }
            else
            {
                var opt = opts.Plays.FirstOrDefault(o => o.CardId == cardId);
                if (opt == null) { status = $"{Setup.CardName(content, cardId)} cannot be played this turn."; return; }
                selectedCard = cardId;
                movingUid = null;
                pendingTarget = null;
                status = $"Choose a Location for {Setup.CardName(content, cardId)}.";
            }
            Render();
        }

        void PickLocation(int index)
        {
            if (pendingTarget != null && pendingOption.NeedsTarget == "friendlyCharAndLocation" && pendingTarget.Target?.CharUid != null)
            {
                var play = pendingTarget;
                play.Target.Location = index;
                if (Try(() => plan.Plays.Add(play), "That destination does not work"))
                {
                    status = $"{Setup.CardName(content, play.CardId)} planned.";
                    pendingTarget = null;
                    pendingOption = null;
                }
                Render();
                return;
            }
            if (selectedCard != null)
            {
                var opt = opts.Plays.First(o => o.CardId == selectedCard);
                if (!opt.Locations.Contains(index)) { status = $"{Setup.CardName(content, selectedCard)} cannot go to {Setup.LocName(content, state, index)}."; Render(); return; }
                var play = new PlayAction { CardId = selectedCard, Location = index };
                if (opt.NeedsTarget != null)
                {
                    pendingTarget = play;
                    pendingOption = opt;
                    selectedCard = null;
                    status = opt.NeedsTarget == "friendlyInsideChar"
                        ? "Pick one of your Inside Characters at another Location, or play without a target."
                        : "Pick one of your Characters to move, or play without a target.";
                    Render();
                    return;
                }
                if (Try(() => plan.Plays.Add(play), $"{Setup.CardName(content, selectedCard)} cannot be played there"))
                {
                    status = $"{Setup.CardName(content, play.CardId)} planned at {Setup.LocName(content, state, index)}.";
                    selectedCard = null;
                }
                Render();
                return;
            }
            if (movingUid != null)
            {
                var uid = movingUid;
                var reloc = new Relocation { Uid = uid, To = index };
                if (Try(() => plan.Relocations.Add(reloc), "That move does not work"))
                {
                    status = $"{CharShort(uid)} will relocate to {Setup.LocName(content, state, index)}.";
                    movingUid = null;
                }
                Render();
            }
        }

        void PickCharacter(string uid)
        {
            if (pendingTarget == null) return;
            var c = state.Characters[uid];
            if (c.Owner != Me) { status = "That one is not yours."; Render(); return; }
            if (pendingOption.NeedsTarget == "friendlyInsideChar")
            {
                var play = pendingTarget;
                play.Target = new PlayTarget { CharUid = uid };
                if (Try(() => plan.Plays.Add(play), "That target does not work"))
                {
                    status = $"{Setup.CardName(content, play.CardId)} planned, targeting {CharShort(uid)}.";
                    pendingTarget = null;
                    pendingOption = null;
                }
            }
            else
            {
                pendingTarget.Target = new PlayTarget { CharUid = uid };
                status = $"Now pick where {CharShort(uid)} goes.";
            }
            Render();
        }

        void PlayWithoutTarget()
        {
            var play = pendingTarget;
            play.Target = null;
            if (Try(() => plan.Plays.Add(play), "That play does not work"))
            {
                status = $"{Setup.CardName(content, play.CardId)} planned.";
                pendingTarget = null;
                pendingOption = null;
            }
            Render();
        }

        void ToggleEnter(string uid)
        {
            if (plan.Enters.Contains(uid)) { Try(() => plan.Enters.Remove(uid), null); status = $"{CharShort(uid)} waits at the Gates."; }
            else if (Try(() => plan.Enters.Add(uid), $"{CharShort(uid)} cannot enter")) status = $"{CharShort(uid)} enters this turn.";
            Render();
        }

        void ToggleMove(string uid)
        {
            var planned = plan.Relocations.FirstOrDefault(r => r.Uid == uid);
            if (planned != null)
            {
                Try(() => plan.Relocations.Remove(planned), null);
                status = $"{CharShort(uid)} stays put.";
                movingUid = null;
            }
            else if (movingUid == uid) { movingUid = null; status = ""; }
            else
            {
                movingUid = uid;
                selectedCard = null;
                pendingTarget = null;
                status = $"Choose a Location for {CharShort(uid)} to relocate to.";
            }
            Render();
        }

        void ToggleConfront(string uid, string threatUid)
        {
            var planned = plan.Confronts.FirstOrDefault(c => c.Uid == uid && c.ThreatUid == threatUid);
            if (planned != null) Try(() => plan.Confronts.Remove(planned), null);
            else Try(() => plan.Confronts.Add(new Confront { Uid = uid, ThreatUid = threatUid }), $"{CharShort(uid)} cannot confront that");
            Render();
        }

        void ToggleStand()
        {
            plan.StandOnBusiness = plan.StandOnBusiness != true;
            status = plan.StandOnBusiness == true ? $"You will Stand on Business: the stakes go to {opts.ProposedStakes}." : "You hold.";
            Render();
        }

        void ToggleStepOff()
        {
            plan.StepOff = plan.StepOff != true;
            status = plan.StepOff == true ? $"You will Sit Down and pay {opts.StepOffCost}." : $"You stay in at {opts.PendingStakes}.";
            Render();
        }

        void LockIn()
        {
            var errors = Query.ValidatePlan(content, state, Me, plan);
            if (errors.Count > 0) { status = errors[0]; Render(); return; }
            var viewB = View.ViewFor(content, state, Ai);
            var planB = Harborlight.PlanTurn(content, viewB, Ai).Plan;
            var plans = new Dictionary<string, TurnPlan> { [Me] = plan, [Ai] = planB };
            var output = Resolve.ResolveTurn(content, state, plans);
            history.Add($"Turn {state.Turn}");
            state = output.State;
            log = View.FilterEvents(output.Events, Me);
            NewPlan();
            status = state.Phase == Rules.PhaseEnded ? "The match is over." : "Pick a card, then a Location.";
            Render();
        }

        // ---------- rendering: the web board's look (Battlefield.tsx, CardFace.tsx, theme.css), reused as-is ----------

        // Reference sizes on the 1920 x 1080 panel; PanelSettings scales the whole tree.
        const float ColW = 560f;                      // a Location column
        const float PlateH = ColW / 1.28f;             // .location.framed aspect-ratio 1.28
        const float GateW = (ColW - 3 * 12f) / 4f;      // four slots across the column (--gw)
        const float GateH = GateW * 0.74f;              // --gh
        const float Seat = 64f, SeatH = 46f;            // --slot, --slot-h (the seats stretch taller when the plate has room)
        const float CardW = 150f;                       // --card-w
        const float LogW = 380f;

        string CharShort(string uid) => Query.CharDef(content, state.Characters[uid].DefId).Short;
        static string Rank(int cost) => cost >= 6 ? "ruby" : cost >= 5 ? "emerald" : cost >= 4 ? "gold" : cost >= 3 ? "silver" : cost >= 2 ? "bronze" : "wood";

        void Render()
        {
            root.Clear();
            var screen = new VisualElement();
            screen.AddToClassList("screen");
            Art.Cover(screen, Art.Tex("board"), 35);
            root.Add(screen);
            var shade = new VisualElement();
            Art.Fill(shade);
            shade.style.backgroundColor = Art.Rgba(5, 12, 21, 0.5f);
            shade.pickingMode = PickingMode.Ignore;
            screen.Add(shade);
            var page = new VisualElement();
            page.AddToClassList("page");
            screen.Add(page);
            page.Add(BuildTopBar());
            var board = new VisualElement();
            board.AddToClassList("board");
            page.Add(board);
            foreach (var loc in state.Locations) board.Add(BuildColumn(loc));
            var spacer = new VisualElement();
            spacer.style.flexGrow = 1;
            page.Add(spacer);
            page.Add(BuildHand());
            page.Add(BuildBottomLeft());
            page.Add(BuildBottomRight());
            if (state.Phase == Rules.PhaseEnded) page.Add(BuildResult());
        }

        // ---- the HUD: the profile plates, Stand on Business between them; the log, Sit Down, Lock In and the turn plate below ----

        VisualElement BuildTopBar()
        {
            var bar = new VisualElement();
            bar.AddToClassList("hud");
            var ps = state.Players[Me];
            var them = state.Players[Ai];
            string mine = $"{ps.Hand.Count} of {Rules.MaxHand} in hand \u00b7 {ps.DeckCount} in deck";
            if (state.Phase == Rules.PhasePlanning) mine += $" \u00b7 Energy {opts.Energy - Query.PlanCost(content, plan, state, Me)} of {opts.Energy} \u00b7 Relocations {plan.Relocations.Count} of {opts.RelocationsAllowed}";
            bar.Add(Profile(ps.Handle, mine, ps.AvatarDefId, Art.Gold, false));
            var centre = new VisualElement();
            centre.style.alignItems = Align.Center;
            bar.Add(centre);
            bool on = plan.StandOnBusiness == true;
            bool canStand = state.Phase == Rules.PhasePlanning && opts.CanStand;
            var stand = Art.Kit(on ? "stand-btn-on" : "primary", on ? $"STANDING \u00d7{opts.ProposedStakes}" : "STAND ON BUSINESS", 56, ToggleStand, canStand);
            stand.style.width = 440;
            centre.Add(stand);
            var stakes = Art.Text($"Stakes \u00d7{Query.EffectiveStakes(state)}" + (state.PendingRaises.Count > 0 ? $" \u00b7 raise to \u00d7{opts.PendingStakes} pending" : "") + (Query.IsNight(state) ? " \u00b7 night" : " \u00b7 day"));
            Art.Display(stakes, 700, 11, Art.Gold2);
            stakes.style.letterSpacing = 2;
            stakes.style.marginTop = 4;
            Art.Border(stakes, 1, Art.GoldDark, 999);
            Art.Pad(stakes, 2, 12, 2, 12);
            stakes.style.backgroundColor = Art.Hex("#0a1626");
            centre.Add(stakes);
            bar.Add(Profile(them.Handle, $"{them.Hand.Count} of {Rules.MaxHand} in hand \u00b7 {them.DeckCount} in deck", them.AvatarDefId, Art.Blue, true));
            return bar;
        }

        VisualElement Profile(string handle, string sub, string avatarId, Color tone, bool right)
        {
            var box = new VisualElement();
            box.style.flexDirection = right ? FlexDirection.RowReverse : FlexDirection.Row;
            box.style.alignItems = Align.Center;
            box.style.width = 560;
            var avatar = new VisualElement();
            avatar.style.width = avatar.style.height = 72;
            Art.Border(avatar, 3, tone, 36);
            Art.Cover(avatar, Art.Tex($"characters/{avatarId}"), 18);
            avatar.style.backgroundColor = Art.Hue(avatarId ?? "x");
            box.Add(avatar);
            var plate = new VisualElement();
            plate.style.flexGrow = 1;
            plate.style.height = 60;
            plate.style.justifyContent = Justify.Center;
            plate.style.backgroundColor = Art.Rgba(10, 22, 38, 0.92f);
            Art.Border(plate, 2, tone, 6);
            Art.Pad(plate, 4, right ? 14 : 18, 4, right ? 18 : 14);
            if (right) plate.style.marginRight = -8; else plate.style.marginLeft = -8;
            plate.style.alignItems = right ? Align.FlexEnd : Align.FlexStart;
            box.Add(plate);
            var name = Art.Text(handle);
            Art.Display(name, 700, 20, Art.Parchment);
            name.style.letterSpacing = 1;
            plate.Add(name);
            var line = Art.Text(sub);
            Art.Body(line, 600, 13, Art.Hex("#cfc3a6"));
            plate.Add(line);
            return box;
        }

        VisualElement BuildBottomLeft()
        {
            var box = new VisualElement();
            Art.Abs(box, left: 0, bottom: 0, width: LogW);
            var log = BuildLog();
            box.Add(log);
            bool can = state.Phase == Rules.PhasePlanning && opts.CanStepOff;
            var sit = Art.Kit("small", plan.StepOff == true ? $"SITTING DOWN \u00b7 PAY {opts.StepOffCost}" : can ? $"SIT DOWN \u00b7 PAY {opts.StepOffCost}" : "SIT DOWN", 56, ToggleStepOff, can);
            sit.style.marginTop = 10;
            sit.style.width = 300;
            box.Add(sit);
            return box;
        }

        VisualElement BuildBottomRight()
        {
            var box = new VisualElement();
            Art.Abs(box, right: 0, bottom: 0);
            box.style.alignItems = Align.FlexEnd;
            if (state.Phase == Rules.PhasePlanning)
            {
                if (pendingTarget != null)
                {
                    var skip = Art.Kit("small", "PLAY WITHOUT A TARGET", 40, PlayWithoutTarget);
                    skip.style.marginBottom = 8;
                    box.Add(skip);
                }
                var lockIn = Art.Kit("secondary", "LOCK IN", 66, LockIn);
                lockIn.style.width = 280;
                box.Add(lockIn);
            }
            else
            {
                var again = Art.Kit("secondary", "PLAY AGAIN", 66, StartMatch);
                again.style.width = 280;
                box.Add(again);
            }
            box.Add(BuildTurnPlate());
            return box;
        }

        VisualElement BuildTurnPlate()
        {
            var plate = new VisualElement();
            plate.style.width = 280;
            plate.style.marginTop = 8;
            plate.style.alignItems = Align.Center;
            plate.style.backgroundColor = Art.Rgba(10, 22, 38, 0.92f);
            Art.Border(plate, 2, Art.Gold, 8);
            Art.Pad(plate, 6, 12, 8, 12);
            var t = Art.Text(state.Phase == Rules.PhaseEnded ? "MATCH OVER" : $"TURN {state.Turn} / {state.MaxTurns}");
            Art.Display(t, 700, 15, Art.Gold2);
            t.style.letterSpacing = 3;
            plate.Add(t);
            var dots = new VisualElement();
            dots.style.flexDirection = FlexDirection.Row;
            dots.style.marginTop = 6;
            plate.Add(dots);
            for (int i = 1; i <= state.MaxTurns; i++)
            {
                var d = new VisualElement();
                d.style.width = d.style.height = 14;
                d.style.marginLeft = d.style.marginRight = 3;
                bool done = i <= state.Turn;
                Art.Border(d, 2, done ? (i % 2 == 0 ? Art.Blue : Art.Gold) : Art.Rgba(233, 185, 58, 0.35f), 7);
                d.style.backgroundColor = done ? (i % 2 == 0 ? Art.Blue : Art.Gold) : Art.Rgba(6, 12, 22, 0.6f);
                dots.Add(d);
            }
            return plate;
        }

        // ---- a Location column: their Gates, the plate, my Gates ----

        VisualElement BuildColumn(LocationState loc)
        {
            int index = loc.Index;
            var col = new VisualElement();
            col.AddToClassList("column");
            col.style.width = ColW;
            bool droppable = state.Phase == Rules.PhasePlanning && (
                (selectedCard != null && opts.Plays.First(o => o.CardId == selectedCard).Locations.Contains(index)) ||
                (movingUid != null && opts.Relocations.Any(r => r.Uid == movingUid && r.Destinations.Contains(index))) ||
                (pendingTarget != null && pendingTarget.Target?.CharUid != null && pendingOption.NeedsTarget == "friendlyCharAndLocation"));
            col.Add(BuildGateStrip(index, Ai));
            col.Add(BuildPlate(loc, droppable));
            col.Add(GatesLabel());
            col.Add(BuildGateStrip(index, Me));
            col.RegisterCallback<ClickEvent>(e => { if (((VisualElement)e.target).ClassListContains("drop")) PickLocation(index); });
            return col;
        }

        VisualElement Drop(VisualElement ve)
        {
            ve.AddToClassList("drop");
            return ve;
        }

        /// <summary>The web's "— THE GATES —" rule between the plate and my Gates.</summary>
        VisualElement GatesLabel()
        {
            var row = Drop(new VisualElement());
            row.style.flexDirection = FlexDirection.Row;
            row.style.alignItems = Align.Center;
            row.style.height = 18;
            Art.Pad(row, 0, 40, 0, 40);
            VisualElement Line()
            {
                var l = Drop(new VisualElement());
                l.style.flexGrow = 1;
                l.style.height = 1;
                l.style.backgroundColor = Art.Rgba(233, 185, 58, 0.45f);
                return l;
            }
            row.Add(Line());
            var lbl = Drop(Art.Text("THE GATES"));
            Art.Display(lbl, 600, 10, Art.Hex("#cfc3a6"));
            lbl.style.letterSpacing = 3;
            lbl.style.marginLeft = lbl.style.marginRight = 12;
            row.Add(lbl);
            row.Add(Line());
            return row;
        }

        VisualElement BuildPlate(LocationState loc, bool droppable)
        {
            int index = loc.Index;
            float W = ColW, H = PlateH;
            var plate = Drop(new VisualElement());
            plate.style.width = W;
            plate.style.height = H;
            plate.style.marginTop = plate.style.marginBottom = 4;
            var leader = Query.LeaderAt(content, state, index);
            content.LocationById.TryGetValue(loc.DefId, out var def);

            // The fills: the plate body, the photograph from under the band, the parchment band on top. The frame covers the edges.
            var body = Drop(new VisualElement());
            Art.Abs(body, left: W * 0.02f, top: H * 0.028f, right: W * 0.02f, bottom: H * 0.05f);
            body.style.backgroundColor = Art.Hex("#0c1a2b");
            body.style.overflow = Overflow.Hidden;
            plate.Add(body);
            if (loc.Revealed)
            {
                var photo = Drop(new VisualElement());
                Art.Abs(photo, left: 0, top: H * 0.155f, right: 0, bottom: 0);
                var night = Query.IsNight(state) ? Art.Tex($"locations/{loc.DefId}_night") : null;
                Art.Cover(photo, night ?? Art.Tex($"locations/{loc.DefId}"), 35);
                body.Add(photo);
                var grad = Drop(new VisualElement());
                Art.Fill(grad);
                grad.style.backgroundColor = Art.Rgba(8, 19, 31, 0.45f);
                body.Add(grad);
            }
            var band = Drop(new VisualElement());
            Art.Abs(band, left: 0, top: 0, right: 0, height: H * 0.155f);
            band.style.backgroundColor = Art.Hex("#efe2c6");
            band.style.borderBottomWidth = 2;
            band.style.borderBottomColor = Art.GoldDark;
            body.Add(band);

            var frame = Drop(new VisualElement());
            Art.Fill(frame);
            Art.Stretch(frame, Art.Tex($"frames/location-{(leader == Me ? "gold" : leader == Ai ? "blue" : "unowned")}"));
            frame.pickingMode = PickingMode.Ignore;
            plate.Add(frame);
            if (droppable)
            {
                var glow = new VisualElement();
                Art.Fill(glow);
                Art.Border(glow, 3, Art.Gold2, 10);
                glow.pickingMode = PickingMode.Ignore;
                plate.Add(glow);
            }

            // The title band: the name, the era at the right.
            var title = Drop(new VisualElement());
            Art.Abs(title, left: W * 0.047f, top: H * 0.027f, right: W * 0.047f, height: H * 0.128f);
            Art.Pad(title, 0, W * 0.045f, 0, W * 0.045f);
            title.style.flexDirection = FlexDirection.Row;
            title.style.alignItems = Align.Center;
            plate.Add(title);
            bool known = loc.Revealed || (state.Players[Me].KnownNextReveal == index && loc.DefId != "unknown");
            var name = Drop(Art.Text(known ? Setup.LocName(content, state, index) : "Unknown Location"));
            Art.Display(name, 700, 19, Art.Ink);
            name.style.whiteSpace = WhiteSpace.NoWrap;
            name.style.overflow = Overflow.Hidden;
            name.style.flexShrink = 1;
            title.Add(name);
            var tags = new List<string>();
            if (!loc.Revealed && state.Players[Me].KnownNextReveal == index) tags.Add("✦ Opens next");
            if (loc.Lost) tags.Add("LOST");
            if (!loc.Lost && loc.Rebuilt == true) tags.Add("REBUILT");
            if (!loc.Lost && loc.Webbed == true) tags.Add("WEBBED");
            if (!loc.Lost && loc.TreatyTorn != null && state.Turn <= loc.TreatyTorn.Until) tags.Add("NO TREATY");
            if (loc.Sanctified == true) tags.Add("OBATALA");
            foreach (var tg in tags)
            {
                var pill = Drop(Art.Text(tg));
                Art.Display(pill, 700, 9, tg == "LOST" || tg == "NO TREATY" ? Color.white : Art.Hex("#1a1200"));
                pill.style.backgroundColor = tg == "LOST" ? Art.Danger : tg == "NO TREATY" ? Art.Hex("#6e2a1a") : Art.Gold2;
                Art.Pad(pill, 1, 7, 1, 7);
                pill.style.marginLeft = 6;
                pill.style.borderTopLeftRadius = pill.style.borderTopRightRadius = pill.style.borderBottomLeftRadius = pill.style.borderBottomRightRadius = 999;
                pill.style.letterSpacing = 1;
                title.Add(pill);
            }
            if (loc.Revealed && def != null && !string.IsNullOrEmpty(def.Era))
            {
                var era = Drop(Art.Text(def.Era));
                Art.Body(era, 600, 12, Art.Hex("#5d5240"));
                era.style.marginLeft = StyleKeyword.Auto;
                era.style.whiteSpace = WhiteSpace.NoWrap;
                title.Add(era);
            }

            // The window: the Influence line, the Inside rows beside the Threat column, the rule.
            var content2 = Drop(new VisualElement());
            Art.Abs(content2, left: W * 0.049f, top: W * 0.144f, right: W * 0.05f, bottom: W * 0.04f);
            plate.Add(content2);
            content2.Add(BuildInfluence(index));
            var mid = Drop(new VisualElement());
            mid.style.flexDirection = FlexDirection.Row;
            mid.style.flexGrow = 1;
            mid.style.minHeight = 0f;
            content2.Add(mid);
            var rows = Drop(new VisualElement());
            rows.style.flexGrow = 1;
            rows.style.minWidth = 0f;
            rows.style.justifyContent = Justify.FlexEnd;
            mid.Add(rows);
            rows.Add(BuildInsideRow(index, Ai, "OPPONENT"));
            rows.Add(BuildInsideRow(index, Me, "YOU"));
            var threats = Drop(new VisualElement());
            threats.style.width = Seat * 1.4f + 10;
            threats.style.flexShrink = 0f;
            Art.Pad(threats, 4, 0, 4, 10);
            threats.style.justifyContent = Justify.FlexStart;
            mid.Add(threats);
            foreach (var t in loc.Threats.OrderBy(t => t.Target == null ? 1 : t.Target == Me ? 2 : 0)) threats.Add(BuildThreatTile(t));
            foreach (var t in loc.Threats)
            {
                var row = BuildConfrontRow(t);
                if (row != null) content2.Add(row);
            }
            var rule = Drop(Art.Text(loc.Lost ? $"LOST: {loc.LostReason ?? "an unresolved crisis"} Neither player can win here." : loc.Revealed && def != null ? (def.Short ?? def.Rule) : "Hidden until revealed. Commit blind."));
            Art.Body(rule, 600, 12, Art.Hex("#e6dcc2"));
            rule.style.backgroundColor = Art.Rgba(6, 12, 22, 0.6f);
            Art.Border(rule, 1, loc.Lost ? Art.Danger : Art.Rgba(233, 185, 58, 0.25f), 4);
            Art.Pad(rule, 2, 8, 2, 8);
            rule.style.marginTop = 3;
            rule.style.marginLeft = rule.style.marginRight = 8;
            rule.style.unityTextAlign = TextAnchor.MiddleCenter;
            content2.Add(rule);
            return plate;
        }

        VisualElement BuildInfluence(int index)
        {
            var inf = Query.InfluenceAt(content, state, index);
            var row = Drop(new VisualElement());
            row.style.flexDirection = FlexDirection.Row;
            row.style.alignItems = Align.Center;
            Art.Pad(row, 2, 6, 2, 6);
            VisualElement Coin(int value, Color tone)
            {
                var c = Drop(Art.Text(value.ToString()));
                c.style.width = c.style.height = 30;
                Art.Border(c, 2, tone, 15);
                c.style.backgroundColor = Art.Hex("#08131f");
                Art.Display(c, 800, 14, tone);
                c.style.unityTextAlign = TextAnchor.MiddleCenter;
                return c;
            }
            row.Add(Coin(inf[Me], Art.Gold2));
            var line = Drop(new VisualElement());
            line.style.flexGrow = 1;
            line.style.height = 6;
            line.style.marginLeft = line.style.marginRight = 10;
            line.style.flexDirection = FlexDirection.Row;
            line.style.backgroundColor = Art.Rgba(6, 12, 22, 0.7f);
            Art.Border(line, 1, Art.Rgba(233, 185, 58, 0.3f), 3);
            int total = inf[Me] + inf[Ai];
            float frac = total == 0 ? 0.5f : (float)inf[Me] / total;
            var fillA = Drop(new VisualElement());
            fillA.style.width = Length.Percent(frac * 100);
            fillA.style.backgroundColor = Art.Gold;
            line.Add(fillA);
            var fillB = Drop(new VisualElement());
            fillB.style.flexGrow = 1;
            fillB.style.backgroundColor = Art.Blue;
            line.Add(fillB);
            var mark = new VisualElement();
            mark.style.position = Position.Absolute;
            mark.style.left = Length.Percent(frac * 100);
            mark.style.top = -6;
            mark.style.marginLeft = -8;
            mark.style.width = mark.style.height = 16;
            mark.style.rotate = new Rotate(Angle.Degrees(45));
            mark.style.backgroundColor = Color.white;
            Art.Border(mark, 2, Art.Hex("#08131f"), 2);
            mark.pickingMode = PickingMode.Ignore;
            line.Add(mark);
            row.Add(line);
            row.Add(Coin(inf[Ai], Art.Hex("#8fb6ff")));
            return row;
        }

        VisualElement BuildInsideRow(int index, string owner, string label)
        {
            var block = Drop(new VisualElement());
            block.style.flexGrow = 1;
            block.style.minHeight = SeatH + 14;
            block.style.marginTop = 2;
            var lbl = Drop(Art.Text(label));
            Art.Display(lbl, 600, 9, Art.Hex("#cfc3a6"));
            lbl.style.letterSpacing = 3;
            lbl.style.marginLeft = 4;
            block.Add(lbl);
            var seats = Drop(new VisualElement());
            seats.style.flexDirection = FlexDirection.Row;
            seats.style.flexGrow = 1;
            seats.style.minHeight = SeatH;
            seats.style.alignItems = Align.Stretch;
            Art.Pad(seats, 1, 0, 3, 4);
            block.Add(seats);
            var chars = Query.CharsAt(state, index, owner, Rules.ZoneInside);
            int capacity = Math.Max(chars.Count, Query.InsideCapacity(content, state, index));
            for (int i = 0; i < capacity; i++)
            {
                var seat = Drop(new VisualElement());
                seat.style.width = Seat;
                seat.style.marginRight = 6;
                seat.style.backgroundColor = Art.Rgba(6, 12, 22, 0.55f);
                seat.style.overflow = Overflow.Hidden;
                if (i < chars.Count)
                {
                    var c = chars[i];
                    Art.Border(seat, 2, owner == Me ? Art.Gold : Art.Blue, 3);
                    seat.Add(BuildPortrait(c, false));
                }
                else Art.Border(seat, 1.5f, Art.Rgba(233, 185, 58, 0.22f), 3);
                seats.Add(seat);
            }
            return block;
        }

        /// <summary>The square portrait tile (CardFace.tsx Pic): the picture, a strip label, and either the three badges (Gates) or the Influence chip (Inside).</summary>
        VisualElement BuildPortrait(CharacterInstance c, bool badges)
        {
            var def = Query.CharDef(content, c.DefId);
            var pic = new VisualElement();
            Art.Fill(pic);
            pic.style.backgroundColor = Art.Hue(c.DefId);
            Art.Cover(pic, Art.Tex($"characters/{c.DefId}"), 18);
            if (Query.IsSuppressed(state, c)) pic.style.opacity = 0.55f;
            int inf = Query.CharInfluence(content, state, c);
            bool entering = plan.Enters.Contains(c.Uid);
            bool moving = plan.Relocations.Any(r => r.Uid == c.Uid) || movingUid == c.Uid;
            string label = null;
            if (c.Zone == Rules.ZoneGate) label = Resolve.IsInformant(content, c) ? "Informant" : c.BlockedEnterTurn == state.Turn ? "Blocked" : c.Ready ? "Ready" : "Waiting";
            if (Query.LockReason(content, state, c) != null) label = "Held";
            if (entering) label = "Entering";
            if (moving) label = movingUid == c.Uid ? "Where to?" : "Moving";
            if (badges)
            {
                pic.Add(Badge(def.Cost.ToString(), Art.Hex("#2f9a4d"), Color.white, top: -0.75f * GateH * 0.08f, left: -0.7f * GateW * 0.134f));
                pic.Add(Badge(inf.ToString(), Art.Hex("#d7a832"), Art.Hex("#1a1200"), bottom: 2, left: -0.7f * GateW * 0.134f));
                pic.Add(Badge(def.Force.ToString(), Art.Hex("#c0392b"), Color.white, bottom: 2, right: -0.7f * GateW * 0.134f));
            }
            else
            {
                var chip = Art.Text(inf.ToString());
                Art.Display(chip, 700, 11, Art.Gold2);
                chip.style.backgroundColor = Art.Hex("#08131f");
                Art.Border(chip, 1, Art.GoldDark, 3);
                Art.Pad(chip, 0, 5, 0, 5);
                Art.Abs(chip, right: 2, bottom: label != null ? 14 : 2);
                pic.Add(chip);
            }
            if (label != null)
            {
                var strip = Art.Text(label.ToUpperInvariant());
                Art.Display(strip, 600, 8, Color.white);
                strip.style.letterSpacing = 1;
                strip.style.unityTextAlign = TextAnchor.MiddleCenter;
                Art.Abs(strip, left: 0, right: 0, bottom: 0);
                Art.Pad(strip, 2, 0, 2, 0);
                bool good = label == "Ready" || label == "Entering";
                bool bad = label == "Held" || label == "Blocked";
                strip.style.backgroundColor = good ? Art.Rgba(79, 196, 111, 0.92f) : bad ? Art.Rgba(224, 74, 63, 0.92f) : label == "Informant" ? Art.Rgba(163, 38, 27, 0.92f) : moving ? Art.Rgba(233, 185, 58, 0.92f) : Art.Rgba(8, 19, 31, 0.82f);
                if (good) strip.style.color = Art.Hex("#052e14");
                if (moving) strip.style.color = Art.Hex("#1a1200");
                pic.Add(strip);
            }
            if (state.Phase == Rules.PhasePlanning && c.Owner == Me)
            {
                var uid = c.Uid;
                bool enterable = opts.Enters.Contains(uid);
                bool movable = opts.Relocations.Any(r => r.Uid == uid && r.Destinations.Count > 0);
                pic.RegisterCallback<ClickEvent>(e =>
                {
                    e.StopPropagation();
                    if (pendingTarget != null) PickCharacter(uid);
                    else if (enterable) ToggleEnter(uid);
                    else if (movable) ToggleMove(uid);
                });
                if (pendingTarget != null || enterable || movable)
                {
                    var ring = new VisualElement();
                    Art.Fill(ring);
                    Art.Border(ring, 2, pendingTarget != null ? Color.white : Art.Rgba(246, 215, 122, 0.8f), 0);
                    ring.pickingMode = PickingMode.Ignore;
                    pic.Add(ring);
                }
            }
            else if (state.Phase == Rules.PhasePlanning && pendingTarget != null)
            {
                pic.RegisterCallback<ClickEvent>(e => { e.StopPropagation(); status = "That one is not yours."; Render(); });
            }
            return pic;
        }

        VisualElement Badge(string text, Color bg, Color fg, float? top = null, float? left = null, float? right = null, float? bottom = null)
        {
            var b = Art.Text(text);
            float size = Math.Max(16, GateW * 0.732f * 0.34f);
            Art.Abs(b, left: left, top: top, right: right, bottom: bottom, width: size, height: size);
            b.style.backgroundColor = bg;
            Art.Border(b, 1.5f, Art.Gold2, size / 2);
            Art.Display(b, 800, size * 0.52f, fg);
            b.style.unityTextAlign = TextAnchor.MiddleCenter;
            if (fg == Color.white) Art.Shadow(b, 1, 2, Color.black);
            return b;
        }

        // ---- the Gates: three slots in the gate frames, and the Event slot ----

        VisualElement BuildGateStrip(int index, string owner)
        {
            var row = Drop(new VisualElement());
            row.style.height = GateH;
            row.style.flexDirection = FlexDirection.Row;
            row.style.justifyContent = Justify.SpaceBetween;
            var chars = Query.CharsAt(state, index, owner, Rules.ZoneGate);
            var ghosts = new List<VisualElement>();
            if (owner == Me)
            {
                foreach (var pl in plan.Plays.Where(pl => pl.Location == index && content.CharacterById.ContainsKey(pl.CardId))) ghosts.Add(GhostSlot(Setup.CardName(content, pl.CardId), $"characters/{pl.CardId}", pl.Enter == true ? "ENTERS NOW" : "PLANNED", () => PickCard(pl.CardId), pl));
                foreach (var r in plan.Relocations.Where(r => r.To == index)) ghosts.Add(GhostSlot(Query.CharDef(content, state.Characters[r.Uid].DefId).Name, $"characters/{state.Characters[r.Uid].DefId}", "ARRIVING", () => ToggleMove(r.Uid), null));
            }
            int used = 0;
            for (int i = 0; i < Rules.GateCapacity; i++)
            {
                if (i < chars.Count) row.Add(FilledSlot(chars[i], owner));
                else if (used < ghosts.Count) row.Add(ghosts[used++]);
                else row.Add(EmptySlot(i == chars.Count + used));
            }
            row.Add(EventSlot(index, owner));
            return row;
        }

        VisualElement SlotBox()
        {
            var slot = Drop(new VisualElement());
            slot.style.width = GateW;
            slot.style.height = GateH;
            return slot;
        }

        VisualElement Window(VisualElement slot)
        {
            var win = new VisualElement();
            Art.Abs(win, left: GateW * 0.134f, right: GateW * 0.134f, top: GateH * 0.08f, bottom: GateH * 0.074f);
            slot.Add(win);
            return win;
        }

        VisualElement FilledSlot(CharacterInstance c, string owner)
        {
            var slot = SlotBox();
            // The web stacks the portrait and its badges above the frame (theme.css: .gate-slot.gf.filled .pic z-index 5).
            var frame = new VisualElement();
            Art.Fill(frame);
            Art.Stretch(frame, Art.Tex(owner == Me ? "frames/gate-gold-on" : "frames/gate-blue-on"));
            frame.pickingMode = PickingMode.Ignore;
            slot.Add(frame);
            var win = Window(slot);
            win.Add(BuildPortrait(c, true));
            return slot;
        }

        VisualElement EmptySlot(bool open)
        {
            var slot = SlotBox();
            Art.Stretch(slot, Art.Tex("frames/gate-gold-off"));
            if (open)
            {
                var plus = Drop(Art.Text("+"));
                Art.Display(plus, 700, 20, Art.Rgba(255, 224, 150, 0.7f));
                Art.Fill(plus);
                plus.style.unityTextAlign = TextAnchor.MiddleCenter;
                slot.Add(plus);
            }
            return slot;
        }

        VisualElement GhostSlot(string name, string art, string strip, Action undo, PlayAction pl)
        {
            var slot = SlotBox();
            Art.Stretch(slot, Art.Tex("frames/gate-gold-off"));
            var win = Window(slot);
            win.style.opacity = 0.7f;
            var pic = new VisualElement();
            Art.Fill(pic);
            Art.Cover(pic, Art.Tex(art), 18);
            win.Add(pic);
            var s = Art.Text(strip);
            Art.Display(s, 600, 7.5f, Art.Hex("#1a1200"));
            s.style.letterSpacing = 1;
            s.style.unityTextAlign = TextAnchor.MiddleCenter;
            s.style.backgroundColor = Art.Rgba(246, 215, 122, 0.95f);
            Art.Abs(s, left: 0, right: 0, bottom: 0);
            win.Add(s);
            slot.tooltip = $"{name}: click to take back";
            slot.RegisterCallback<ClickEvent>(e =>
            {
                e.StopPropagation();
                if (pl != null && e.ctrlKey || pl != null && e.altKey)
                {
                    var on = pl.Enter == true;
                    if (Try(() => pl.Enter = on ? null : (bool?)true, "Direct Entry does not work here")) status = on ? $"{name} waits at the Gates." : $"{name} goes straight Inside.";
                    Render();
                }
                else undo();
            });
            return slot;
        }

        VisualElement EventSlot(int index, string owner)
        {
            var slot = SlotBox();
            var pl = owner == Me ? plan.Plays.FirstOrDefault(x => x.Location == index && content.EventById.ContainsKey(x.CardId)) : null;
            if (pl == null)
            {
                Art.Stretch(slot, Art.Tex("frames/gate-event-off"));
                var col = Drop(new VisualElement());
                Art.Fill(col);
                col.style.justifyContent = Justify.Center;
                col.style.alignItems = Align.Center;
                slot.Add(col);
                var plus = Drop(Art.Text("+"));
                Art.Display(plus, 700, 18, Art.Rgba(203, 184, 255, 0.8f));
                col.Add(plus);
                var ev = Drop(Art.Text("EVENT"));
                Art.Display(ev, 600, 9, Art.Rgba(203, 184, 255, 0.9f));
                ev.style.letterSpacing = 2;
                col.Add(ev);
                if (owner == Me)
                {
                    var ps = state.Players[Me];
                    int left = ps.Hand.Count(id => content.EventById.ContainsKey(id)) + ps.Deck.Count(id => content.EventById.ContainsKey(id));
                    int total = left + ps.Discard.Count(id => content.EventById.ContainsKey(id));
                    var n = Drop(Art.Text($"{left} OF {total}"));
                    Art.Display(n, 600, 7.5f, Art.Rgba(203, 184, 255, 0.7f));
                    n.style.letterSpacing = 1;
                    col.Add(n);
                }
                return slot;
            }
            var win = Window(slot);
            var pic = new VisualElement();
            Art.Fill(pic);
            Art.Cover(pic, Art.Tex($"events/{pl.CardId}"), 30);
            win.Add(pic);
            var s = Art.Text("PLANNED");
            Art.Display(s, 600, 7.5f, Art.Hex("#1a1200"));
            s.style.unityTextAlign = TextAnchor.MiddleCenter;
            s.style.backgroundColor = Art.Rgba(246, 215, 122, 0.95f);
            Art.Abs(s, left: 0, right: 0, bottom: 0);
            win.Add(s);
            var frame = new VisualElement();
            Art.Fill(frame);
            Art.Stretch(frame, Art.Tex("frames/gate-event-on"));
            frame.pickingMode = PickingMode.Ignore;
            slot.Add(frame);
            slot.tooltip = $"{Setup.CardName(content, pl.CardId)}: click to take back";
            slot.RegisterCallback<ClickEvent>(e => { e.StopPropagation(); PickCard(pl.CardId); });
            return slot;
        }

        // ---- Threats ----

        VisualElement BuildThreatTile(ThreatInstance t)
        {
            var def = content.ThreatById[t.DefId];
            var tile = Drop(new VisualElement());
            tile.style.width = Seat * 1.4f;
            tile.style.minHeight = SeatH + 20;
            tile.style.marginBottom = 4;
            tile.style.backgroundColor = Art.Hex("#1a0d10");
            Art.Border(tile, 2, Art.Danger, 4);
            tile.style.overflow = Overflow.Hidden;
            tile.style.justifyContent = Justify.FlexEnd;
            var art = new VisualElement();
            Art.Fill(art);
            Art.Cover(art, Art.Tex($"threats/{t.DefId}"), 30);
            art.pickingMode = PickingMode.Ignore;
            tile.Add(art);
            var need = Art.Text(Query.ThreatForceNeeded(content, state, t).ToString());
            Art.Display(need, 800, 11, Color.white);
            need.style.backgroundColor = Art.Hex("#08131f");
            Art.Border(need, 2, Art.Danger, 11);
            Art.Abs(need, top: 3, right: 3, width: 22, height: 22);
            need.style.unityTextAlign = TextAnchor.MiddleCenter;
            tile.Add(need);
            var name = Art.Text(Resolve.ThreatName(content, state, t).ToUpperInvariant());
            Art.Display(name, 600, 7.5f, Color.white);
            name.style.unityTextAlign = TextAnchor.MiddleCenter;
            name.style.letterSpacing = 1;
            name.style.backgroundColor = Art.Rgba(8, 19, 31, 0.8f);
            Art.Pad(name, 2, 2, 1, 2);
            tile.Add(name);
            if (t.Target != null)
            {
                var who = Art.Text(t.Target == Me ? "AGAINST YOU" : "AGAINST THEM");
                Art.Display(who, 700, 6.5f, Art.Hex("#ff9c96"));
                who.style.unityTextAlign = TextAnchor.MiddleCenter;
                who.style.letterSpacing = 1;
                who.style.backgroundColor = Art.Rgba(8, 19, 31, 0.8f);
                tile.Add(who);
            }
            tile.tooltip = def.Text;
            return tile;
        }

        VisualElement BuildConfrontRow(ThreatInstance t)
        {
            var option = opts.Confronts.FirstOrDefault(o => o.ThreatUid == t.Uid);
            if (option == null) return null;
            var row = Drop(new VisualElement());
            row.style.flexDirection = FlexDirection.Row;
            row.style.flexWrap = Wrap.Wrap;
            row.style.alignItems = Align.Center;
            row.style.marginTop = 3;
            row.style.marginLeft = 4;
            var lbl = Drop(Art.Text((option.Assist ? "Assist vs " : "Confront ") + Resolve.ThreatName(content, state, t) + ":"));
            Art.Body(lbl, 700, 12, Art.Hex("#ffb3ae"));
            lbl.style.marginRight = 6;
            row.Add(lbl);
            foreach (var uid in option.Chars)
            {
                var c = state.Characters[uid];
                bool on = plan.Confronts.Any(x => x.Uid == uid && x.ThreatUid == t.Uid);
                var b = Art.Kit("small", $"{CharShort(uid)} {Query.ConfrontForce(content, state, c, t)}", 26, () => ToggleConfront(uid, t.Uid));
                b.style.marginRight = 4;
                if (on) { Art.Border(b, 2, Art.Gold2, 4); }
                row.Add(b);
            }
            return row;
        }

        // ---- the hand: cards on their frames (CardFace.tsx, the .card.tpl rules) ----

        VisualElement BuildHand()
        {
            var hand = new VisualElement();
            hand.AddToClassList("hand");
            var ps = state.Players[Me];
            var row = new VisualElement();
            row.style.flexDirection = FlexDirection.Row;
            row.style.justifyContent = Justify.Center;
            row.style.alignItems = Align.FlexEnd;
            hand.Add(row);
            foreach (var cardId in ps.Hand)
            {
                var opt = opts.Plays.FirstOrDefault(o => o.CardId == cardId);
                bool planned = plan.Plays.Any(pl => pl.CardId == cardId);
                bool playable = opt != null && state.Phase == Rules.PhasePlanning;
                int cost = Query.CardCost(content, cardId, state, Me);
                var card = BuildCard(cardId, cost, planned, !playable && !planned, selectedCard == cardId);
                var id = cardId;
                card.RegisterCallback<ClickEvent>(_ => { if (state.Phase == Rules.PhasePlanning) PickCard(id); });
                row.Add(card);
            }
            var statusLabel = Art.Text(status);
            Art.Body(statusLabel, 600, 16, Art.Hex("#fff0c8"));
            statusLabel.style.unityTextAlign = TextAnchor.MiddleCenter;
            statusLabel.style.marginTop = 6;
            statusLabel.style.height = 22;
            hand.Add(statusLabel);
            return hand;
        }

        VisualElement BuildCard(string cardId, int cost, bool planned, bool dim, bool selected)
        {
            float W = CardW, H = W * 1426f / 1103f;
            bool isChar = content.CharacterById.TryGetValue(cardId, out var cdef);
            content.EventById.TryGetValue(cardId, out var edef);
            var card = new VisualElement();
            card.style.width = W;
            card.style.height = H;
            card.style.marginRight = 8;
            if (planned) card.style.opacity = 0.5f;
            if (selected) card.style.translate = new Translate(0, -12);
            // Art window.
            var art = new VisualElement();
            if (isChar) Art.Abs(art, left: W * 0.142f, top: W * 0.076f, width: W * 0.715f, height: W * 0.533f);
            else Art.Abs(art, left: W * 0.103f, top: W * 0.074f, width: W * 0.796f, height: W * 0.575f);
            art.style.backgroundColor = Art.Hue(cardId);
            Art.Cover(art, Art.Tex((isChar ? "characters/" : "events/") + cardId), 18);
            art.style.overflow = Overflow.Hidden;
            card.Add(art);
            if (dim)
            {
                var veil = new VisualElement();
                Art.Fill(veil);
                veil.style.backgroundColor = Art.Rgba(6, 10, 18, 0.45f);
                art.Add(veil);
            }
            // Frame.
            var frame = new VisualElement();
            Art.Fill(frame);
            Art.Stretch(frame, Art.Tex(isChar ? $"frames/character-sm-{(cardId == "black_jesus" ? "wood" : Rank(cdef.Cost))}" : "frames/event-sm"));
            frame.pickingMode = PickingMode.Ignore;
            card.Add(frame);
            // Cost.
            int printed = isChar ? cdef.Cost : edef.Cost;
            card.Add(Num(cost.ToString(), isChar ? W * 0.1606f : W * 0.14f, isChar ? W * 0.121f : W * 0.136f, isChar ? W * 0.083f : W * 0.09f, dim ? Art.Hex("#ff6b62") : cost < printed ? Art.Hex("#d8ffe4") : Color.white));
            // The parchment: name, then the summary.
            var body = new VisualElement();
            if (isChar) Art.Abs(body, left: W * 0.149f, right: W * 0.149f, top: W * 0.641f, height: W * 0.413f);
            else Art.Abs(body, left: W * 0.13f, right: W * 0.128f, top: W * 0.675f, height: W * 0.37f);
            body.style.overflow = Overflow.Hidden;
            card.Add(body);
            string name = Setup.CardName(content, cardId);
            int longest = name.Split(' ').Max(w => w.Length);
            float nameSize = name.Length > 22 || longest > 11 ? W * 0.044f : name.Length > 15 || longest > 9 ? W * 0.052f : W * 0.062f;
            var nm = Art.Text(name);
            Art.Display(nm, 800, Math.Max(9, nameSize), Art.Ink);
            nm.style.unityTextAlign = TextAnchor.MiddleCenter;
            nm.style.borderBottomWidth = 1;
            nm.style.borderBottomColor = Art.Hex("#a5763c");
            nm.style.paddingBottom = 2;
            body.Add(nm);
            var summary = Art.Text(isChar ? cdef.Summary ?? "" : edef.Summary ?? edef.Text ?? "");
            Art.Body(summary, 600, Math.Max(9.5f, W * 0.044f), Art.Hex("#2a2418"));
            summary.style.unityTextAlign = TextAnchor.UpperCenter;
            summary.style.paddingTop = 2;
            summary.style.flexShrink = 1;
            body.Add(summary);
            if (isChar)
            {
                card.Add(Num(cdef.Influence.ToString(), W * 0.132f, W * 1.142f, W * 0.09f, Color.white));
                card.Add(Num(cdef.Force.ToString(), W * 0.864f, W * 1.142f, W * 0.09f, Color.white));
            }
            if (selected)
            {
                var glow = new VisualElement();
                Art.Abs(glow, left: W * 0.03f, right: W * 0.03f, top: W * 0.02f, bottom: W * 0.02f);
                Art.Border(glow, 3, Color.white, W * 0.06f);
                glow.pickingMode = PickingMode.Ignore;
                card.Add(glow);
            }
            return card;
        }

        /// <summary>A number in a medallion: centred on (cx, cy), Cinzel 800, white with the web's heavy shadow.</summary>
        VisualElement Num(string text, float cx, float cy, float size, Color color)
        {
            var l = Art.Text(text);
            float box = size * 2.2f;
            Art.Abs(l, left: cx - box / 2, top: cy - box / 2, width: box, height: box);
            Art.Display(l, 800, size, color);
            l.style.unityTextAlign = TextAnchor.MiddleCenter;
            Art.Shadow(l, size * 0.06f, size * 0.12f, Art.Rgba(0, 0, 0, 0.9f));
            l.pickingMode = PickingMode.Ignore;
            return l;
        }

        // ---- the log and the result ----

        VisualElement BuildLog()
        {
            var box = new VisualElement();
            box.AddToClassList("log");
            box.style.height = 190;
            var head = new VisualElement();
            head.style.flexDirection = FlexDirection.Row;
            head.style.alignItems = Align.Center;
            head.style.marginBottom = 4;
            box.Add(head);
            var tag = Art.Text(history.Count > 0 ? history[history.Count - 1].ToUpperInvariant() : "THE MATCH BEGINS");
            Art.Display(tag, 700, 10, Art.Hex("#1a1200"));
            tag.style.backgroundColor = Art.Gold2;
            tag.style.letterSpacing = 2;
            Art.Pad(tag, 2, 8, 2, 8);
            tag.style.borderTopLeftRadius = tag.style.borderTopRightRadius = tag.style.borderBottomLeftRadius = tag.style.borderBottomRightRadius = 3;
            head.Add(tag);
            var title = Art.Text(history.Count > 0 ? "What happened" : "");
            Art.Display(title, 700, 12, Art.Gold2);
            title.style.marginLeft = 8;
            head.Add(title);
            var scroll = new ScrollView(ScrollViewMode.Vertical);
            scroll.style.flexGrow = 1;
            box.Add(scroll);
            foreach (var e in log)
            {
                var line = Art.Text(e.Text);
                Art.Body(line, e.Type == "turnStart" ? 700 : 500, 14, e.Type == "turnStart" ? Art.Gold2 : e.Type == "setback" || e.Type == "clash" ? Art.Hex("#ffb3ae") : e.Player == Me ? Art.Hex("#fae2aa") : e.Player == Ai ? Art.Hex("#a0c4fa") : Art.TextColor);
                line.style.marginBottom = 4;
                scroll.Add(line);
            }
            return box;
        }

        VisualElement BuildResult()
        {
            var r = state.Result;
            var panel = new VisualElement();
            panel.AddToClassList("result");
            var headline = Art.Text(r.Winner == Me ? "You win" : r.Winner == null ? "A draw" : "Harborlight wins");
            Art.Display(headline, 800, 34, Art.Gold2);
            headline.style.marginBottom = 8;
            panel.Add(headline);
            var detail = Art.Text($"{r.Reason} · stakes ×{r.Stakes}{(r.Sweep ? " · sweep" : "")} · payout {r.Payout}");
            Art.Body(detail, 600, 16, Art.TextColor);
            detail.style.marginBottom = 8;
            detail.style.unityTextAlign = TextAnchor.MiddleCenter;
            panel.Add(detail);
            var locs = Art.Text(string.Join("   ", r.LocationWinners.Select((w, i) => $"{Setup.LocName(content, state, i)}: {(w == Me ? "you" : w == Ai ? "Harborlight" : w ?? "nobody")}")));
            Art.Body(locs, 600, 15, Art.TextColor);
            locs.style.marginBottom = 12;
            locs.style.unityTextAlign = TextAnchor.MiddleCenter;
            panel.Add(locs);
            panel.Add(Art.Kit("secondary", "Play again", 56, StartMatch));
            return panel;
        }
    }
}
