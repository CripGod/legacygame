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
            long seed = Seed != 0 ? Seed : Random.Range(1, int.MaxValue);
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

        // ---------- rendering ----------

        string CharShort(string uid) => Query.CharDef(content, state.Characters[uid].DefId).Short;

        void Render()
        {
            root.Clear();
            var screen = new VisualElement();
            screen.AddToClassList("screen");
            root.Add(screen);
            screen.Add(BuildHud());
            var middle = new VisualElement();
            middle.AddToClassList("middle");
            screen.Add(middle);
            middle.Add(BuildBoard());
            middle.Add(BuildLog());
            screen.Add(BuildHand());
            if (state.Phase == Rules.PhaseEnded) screen.Add(BuildResult());
        }

        VisualElement BuildHud()
        {
            var hud = new VisualElement();
            hud.AddToClassList("hud");
            var left = new VisualElement();
            left.AddToClassList("hud-left");
            hud.Add(left);
            var turn = new Label(state.Phase == Rules.PhaseEnded ? "Match over" : $"Turn {state.Turn} of {state.MaxTurns}{(Query.IsNight(state) ? " · night" : "")}");
            turn.AddToClassList("hud-turn");
            left.Add(turn);
            var stakes = new Label($"Stakes ×{Query.EffectiveStakes(state)}" + (state.PendingRaises.Count > 0 ? $" (raise to ×{opts.PendingStakes} pending)" : ""));
            stakes.AddToClassList("hud-line");
            left.Add(stakes);
            if (state.Phase == Rules.PhasePlanning)
            {
                int spent = Query.PlanCost(content, plan, state, Me);
                var energy = new Label($"Energy {opts.Energy - spent} of {opts.Energy} · Relocations {plan.Relocations.Count} of {opts.RelocationsAllowed}");
                energy.AddToClassList("hud-line");
                left.Add(energy);
            }
            var statusLabel = new Label(status);
            statusLabel.AddToClassList("status");
            left.Add(statusLabel);

            var right = new VisualElement();
            right.AddToClassList("hud-right");
            hud.Add(right);
            if (state.Phase == Rules.PhasePlanning)
            {
                if (pendingTarget != null)
                {
                    var skip = new Button(PlayWithoutTarget) { text = "Play without a target" };
                    skip.AddToClassList("btn");
                    right.Add(skip);
                }
                if (opts.CanStepOff)
                {
                    var sit = new Button(ToggleStepOff) { text = plan.StepOff == true ? $"Sitting Down (pay {opts.StepOffCost})" : $"Sit Down (pay {opts.StepOffCost})" };
                    sit.AddToClassList("btn");
                    if (plan.StepOff == true) sit.AddToClassList("btn-on");
                    right.Add(sit);
                }
                if (opts.CanStand)
                {
                    var stand = new Button(ToggleStand) { text = plan.StandOnBusiness == true ? $"Standing on Business (×{opts.ProposedStakes})" : $"Stand on Business (×{opts.ProposedStakes})" };
                    stand.AddToClassList("btn");
                    stand.AddToClassList("btn-stand");
                    if (plan.StandOnBusiness == true) stand.AddToClassList("btn-on");
                    right.Add(stand);
                }
                var lockIn = new Button(LockIn) { text = "Lock In" };
                lockIn.AddToClassList("btn");
                lockIn.AddToClassList("btn-primary");
                right.Add(lockIn);
            }
            else
            {
                var again = new Button(StartMatch) { text = "Play again" };
                again.AddToClassList("btn");
                again.AddToClassList("btn-primary");
                right.Add(again);
            }
            return hud;
        }

        VisualElement BuildBoard()
        {
            var board = new VisualElement();
            board.AddToClassList("board");
            foreach (var loc in state.Locations) board.Add(BuildLocation(loc));
            return board;
        }

        VisualElement BuildLocation(LocationState loc)
        {
            int index = loc.Index;
            var col = new VisualElement();
            col.AddToClassList("location");
            if (loc.Lost) col.AddToClassList("location-lost");
            bool droppable = state.Phase == Rules.PhasePlanning && (
                (selectedCard != null && opts.Plays.First(o => o.CardId == selectedCard).Locations.Contains(index)) ||
                (movingUid != null && opts.Relocations.Any(r => r.Uid == movingUid && r.Destinations.Contains(index))) ||
                (pendingTarget != null && pendingTarget.Target?.CharUid != null && pendingOption.NeedsTarget == "friendlyCharAndLocation"));
            if (droppable) col.AddToClassList("location-droppable");
            col.RegisterCallback<ClickEvent>(e => { if (e.target == col || ((VisualElement)e.target).ClassListContains("drop-zone")) PickLocation(index); });

            var head = new VisualElement();
            head.AddToClassList("location-head");
            head.AddToClassList("drop-zone");
            col.Add(head);
            var name = new Label(loc.Revealed ? Setup.LocName(content, state, index) : $"Location {index + 1} (unrevealed)");
            name.AddToClassList("location-name");
            name.AddToClassList("drop-zone");
            head.Add(name);
            if (loc.Revealed && content.LocationById.TryGetValue(loc.DefId, out var def) && !string.IsNullOrEmpty(def.Rule))
            {
                var rule = new Label(def.Rule);
                rule.AddToClassList("location-rule");
                rule.AddToClassList("drop-zone");
                head.Add(rule);
            }
            if (loc.Lost)
            {
                var lost = new Label($"Lost: {loc.LostReason}");
                lost.AddToClassList("location-lost-text");
                head.Add(lost);
            }
            var inf = Query.InfluenceAt(content, state, index);
            var infLabel = new Label($"You {inf[Me]}  ·  Harborlight {inf[Ai]}");
            infLabel.AddToClassList("location-influence");
            infLabel.AddToClassList("drop-zone");
            var leader = Query.LeaderAt(content, state, index);
            if (leader == Me) infLabel.AddToClassList("lead-me");
            else if (leader == Ai) infLabel.AddToClassList("lead-ai");
            head.Add(infLabel);

            foreach (var t in loc.Threats) col.Add(BuildThreat(t));

            col.Add(BuildZone(index, Rules.ZoneInside, "Inside (+1 Influence, sheltered)"));
            col.Add(BuildZone(index, Rules.ZoneGate, "Gates"));
            return col;
        }

        VisualElement BuildThreat(ThreatInstance t)
        {
            var box = new VisualElement();
            box.AddToClassList("threat");
            var def = content.ThreatById[t.DefId];
            var title = new Label($"{Resolve.ThreatName(content, state, t)} · Force {Query.ThreatForceNeeded(content, state, t)}");
            title.AddToClassList("threat-name");
            box.Add(title);
            var text = new Label(def.Text);
            text.AddToClassList("threat-text");
            box.Add(text);
            var option = opts.Confronts.FirstOrDefault(o => o.ThreatUid == t.Uid);
            if (option != null)
            {
                var row = new VisualElement();
                row.AddToClassList("confront-row");
                var lbl = new Label(option.Assist ? "Assist with:" : "Confront with:");
                lbl.AddToClassList("confront-label");
                row.Add(lbl);
                foreach (var uid in option.Chars)
                {
                    var c = state.Characters[uid];
                    bool on = plan.Confronts.Any(x => x.Uid == uid && x.ThreatUid == t.Uid);
                    var b = new Button(() => ToggleConfront(uid, t.Uid)) { text = $"{CharShort(uid)} ({Query.ConfrontForce(content, state, c, t)})" };
                    b.AddToClassList("btn-small");
                    if (on) b.AddToClassList("btn-on");
                    row.Add(b);
                }
                box.Add(row);
            }
            return box;
        }

        VisualElement BuildZone(int index, string zone, string title)
        {
            var box = new VisualElement();
            box.AddToClassList("zone");
            box.AddToClassList(zone == Rules.ZoneInside ? "zone-inside" : "zone-gate");
            box.AddToClassList("drop-zone");
            var head = new Label(title);
            head.AddToClassList("zone-title");
            head.AddToClassList("drop-zone");
            box.Add(head);
            var row = new VisualElement();
            row.AddToClassList("zone-row");
            row.AddToClassList("drop-zone");
            box.Add(row);
            foreach (var c in Query.CharsAt(state, index, null, zone)) row.Add(BuildCharacter(c));
            if (zone == Rules.ZoneGate)
            {
                foreach (var pl in plan.Plays.Where(pl => pl.Location == index && content.CharacterById.ContainsKey(pl.CardId))) row.Add(BuildGhost(pl));
                foreach (var pl in plan.Plays.Where(pl => pl.Location == index && !content.CharacterById.ContainsKey(pl.CardId))) row.Add(BuildGhost(pl));
                foreach (var r in plan.Relocations.Where(r => r.To == index)) row.Add(BuildArriving(r));
            }
            return box;
        }

        VisualElement BuildCharacter(CharacterInstance c)
        {
            var def = Query.CharDef(content, c.DefId);
            var card = new VisualElement();
            card.AddToClassList("char");
            card.AddToClassList(c.Owner == Me ? "char-me" : "char-ai");
            bool entering = plan.Enters.Contains(c.Uid);
            bool moving = plan.Relocations.Any(r => r.Uid == c.Uid);
            if (entering) card.AddToClassList("char-entering");
            if (moving || movingUid == c.Uid) card.AddToClassList("char-moving");
            if (pendingTarget != null && c.Owner == Me) card.AddToClassList("char-targetable");
            var name = new Label(def.Name);
            name.AddToClassList("char-name");
            card.Add(name);
            var stats = new Label($"{Query.CharInfluence(content, state, c)} Influence · {def.Force} Force");
            stats.AddToClassList("char-stats");
            card.Add(stats);
            var tags = new List<string>();
            if (c.Zone == Rules.ZoneGate) tags.Add(c.Ready ? "Ready" : "Waiting");
            var lockReason = Query.LockReason(content, state, c);
            if (lockReason != null) tags.Add("Held");
            if (Query.IsSuppressed(state, c)) tags.Add("Suppressed");
            if (moving) tags.Add($"moving to L{plan.Relocations.First(r => r.Uid == c.Uid).To + 1}");
            var tagLabel = new Label(string.Join(" · ", tags));
            tagLabel.AddToClassList("char-tags");
            card.Add(tagLabel);
            if (state.Phase == Rules.PhasePlanning && c.Owner == Me)
            {
                var actions = new VisualElement();
                actions.AddToClassList("char-actions");
                if (opts.Enters.Contains(c.Uid))
                {
                    var b = new Button(() => ToggleEnter(c.Uid)) { text = entering ? "Entering" : "Enter" };
                    b.AddToClassList("btn-small");
                    if (entering) b.AddToClassList("btn-on");
                    actions.Add(b);
                }
                if (opts.Relocations.Any(r => r.Uid == c.Uid && r.Destinations.Count > 0))
                {
                    var b = new Button(() => ToggleMove(c.Uid)) { text = moving ? "Moving" : movingUid == c.Uid ? "Pick a Location…" : "Move" };
                    b.AddToClassList("btn-small");
                    if (moving || movingUid == c.Uid) b.AddToClassList("btn-on");
                    actions.Add(b);
                }
                if (actions.childCount > 0) card.Add(actions);
            }
            card.RegisterCallback<ClickEvent>(e => { if (pendingTarget != null) { PickCharacter(c.Uid); e.StopPropagation(); } });
            return card;
        }

        VisualElement BuildGhost(PlayAction pl)
        {
            var card = new VisualElement();
            card.AddToClassList("char");
            card.AddToClassList("char-me");
            card.AddToClassList("char-ghost");
            var name = new Label(Setup.CardName(content, pl.CardId));
            name.AddToClassList("char-name");
            card.Add(name);
            var what = new Label(content.CharacterById.ContainsKey(pl.CardId) ? (pl.Enter == true ? "planned, enters now" : "planned") : "Event, planned");
            what.AddToClassList("char-tags");
            card.Add(what);
            if (pl.Target?.CharUid != null)
            {
                var t = new Label($"target: {CharShort(pl.Target.CharUid)}" + (pl.Target.Location != null ? $" → L{pl.Target.Location + 1}" : ""));
                t.AddToClassList("char-tags");
                card.Add(t);
            }
            var actions = new VisualElement();
            actions.AddToClassList("char-actions");
            var opt = opts.Plays.FirstOrDefault(o => o.CardId == pl.CardId);
            if (opt != null && opt.DirectEntry)
            {
                var enter = new Button(() => { var on = pl.Enter == true; if (Try(() => pl.Enter = on ? null : (bool?)true, "Direct Entry does not work here")) status = on ? "Waits at the Gates." : "Goes straight Inside."; Render(); }) { text = pl.Enter == true ? "Entering now" : "Enter now" };
                enter.AddToClassList("btn-small");
                if (pl.Enter == true) enter.AddToClassList("btn-on");
                actions.Add(enter);
            }
            var remove = new Button(() => PickCard(pl.CardId)) { text = "Take back" };
            remove.AddToClassList("btn-small");
            actions.Add(remove);
            card.Add(actions);
            return card;
        }

        VisualElement BuildArriving(Relocation r)
        {
            var card = new VisualElement();
            card.AddToClassList("char");
            card.AddToClassList("char-me");
            card.AddToClassList("char-ghost");
            var name = new Label(Query.CharDef(content, state.Characters[r.Uid].DefId).Name);
            name.AddToClassList("char-name");
            card.Add(name);
            var what = new Label($"arriving from L{state.Characters[r.Uid].Location + 1}");
            what.AddToClassList("char-tags");
            card.Add(what);
            var undo = new Button(() => ToggleMove(r.Uid)) { text = "Take back" };
            undo.AddToClassList("btn-small");
            card.Add(undo);
            return card;
        }

        VisualElement BuildHand()
        {
            var hand = new VisualElement();
            hand.AddToClassList("hand");
            var ps = state.Players[Me];
            var title = new Label($"Your hand · {ps.DeckCount} in deck · {ps.Discard.Count} discarded · Setbacks {ps.Setbacks}");
            title.AddToClassList("hand-title");
            hand.Add(title);
            var row = new ScrollView(ScrollViewMode.Horizontal);
            row.AddToClassList("hand-row");
            hand.Add(row);
            foreach (var cardId in ps.Hand)
            {
                var card = new VisualElement();
                card.AddToClassList("card");
                bool isChar = content.CharacterById.TryGetValue(cardId, out var cdef);
                content.EventById.TryGetValue(cardId, out var edef);
                var opt = opts.Plays.FirstOrDefault(o => o.CardId == cardId);
                bool planned = plan.Plays.Any(pl => pl.CardId == cardId);
                if (planned) card.AddToClassList("card-planned");
                else if (opt == null || state.Phase != Rules.PhasePlanning) card.AddToClassList("card-unplayable");
                if (selectedCard == cardId) card.AddToClassList("card-selected");
                var name = new Label($"{Setup.CardName(content, cardId)}  ·  {Query.CardCost(content, cardId, state, Me)} Energy");
                name.AddToClassList("card-name");
                card.Add(name);
                var line = new Label(isChar ? $"{cdef.Influence} Influence · {cdef.Force} Force{(cdef.Keywords.Count > 0 ? " · " + string.Join(", ", cdef.Keywords) : "")}" : "Event");
                line.AddToClassList("card-line");
                card.Add(line);
                var summary = new Label(isChar ? cdef.Summary : edef?.Summary ?? edef?.Text ?? "");
                summary.AddToClassList("card-summary");
                card.Add(summary);
                var id = cardId;
                card.RegisterCallback<ClickEvent>(_ => { if (state.Phase == Rules.PhasePlanning) PickCard(id); });
                row.Add(card);
            }
            return hand;
        }

        VisualElement BuildLog()
        {
            var box = new VisualElement();
            box.AddToClassList("log");
            var title = new Label(history.Count > 0 ? $"What happened on {history[history.Count - 1]}" : "The match begins");
            title.AddToClassList("log-title");
            box.Add(title);
            var scroll = new ScrollView(ScrollViewMode.Vertical);
            scroll.AddToClassList("log-scroll");
            box.Add(scroll);
            foreach (var e in log)
            {
                var line = new Label(e.Text);
                line.AddToClassList("log-line");
                line.AddToClassList("log-" + e.Type);
                if (e.Player == Me) line.AddToClassList("log-me");
                else if (e.Player == Ai) line.AddToClassList("log-ai");
                scroll.Add(line);
            }
            return box;
        }

        VisualElement BuildResult()
        {
            var r = state.Result;
            var panel = new VisualElement();
            panel.AddToClassList("result");
            var headline = new Label(r.Winner == Me ? "You win" : r.Winner == null ? "A draw" : "Harborlight wins");
            headline.AddToClassList("result-headline");
            panel.Add(headline);
            var detail = new Label($"{r.Reason} · stakes ×{r.Stakes}{(r.Sweep ? " · sweep" : "")} · payout {r.Payout}");
            detail.AddToClassList("result-detail");
            panel.Add(detail);
            var locs = new Label(string.Join("   ", r.LocationWinners.Select((w, i) => $"{Setup.LocName(content, state, i)}: {(w == Me ? "you" : w == Ai ? "Harborlight" : w ?? "nobody")}")));
            locs.AddToClassList("result-detail");
            panel.Add(locs);
            var again = new Button(StartMatch) { text = "Play again" };
            again.AddToClassList("btn");
            again.AddToClassList("btn-primary");
            panel.Add(again);
            return panel;
        }
    }
}
