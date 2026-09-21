using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace StandOnBusiness.Game
{
    /// <summary>
    /// The web game's look, reused as-is: its pictures and frames (Resources/art, the same files public/art ships,
    /// WebP converted to PNG), its fonts (Cinzel for display, Crimson Pro for body) and its colours (theme.css :root).
    /// Everything here is a small helper over UI Toolkit styles so MatchScreen reads like the web layout.
    /// </summary>
    public static class Art
    {
        // ---- colours (theme.css :root) ----
        public static readonly Color Bg = Hex("#08131f");
        public static readonly Color Panel = Hex("#0f1f33");
        public static readonly Color Line = Hex("#2a4466");
        public static readonly Color TextColor = Hex("#f1e9d6");
        public static readonly Color Muted = Hex("#a9b4c2");
        public static readonly Color Gold = Hex("#e9b93a");
        public static readonly Color Gold2 = Hex("#f6d77a");
        public static readonly Color GoldDark = Hex("#8a6a14");
        public static readonly Color Blue = Hex("#2f7bff");
        public static readonly Color Danger = Hex("#e04a3f");
        public static readonly Color Ok = Hex("#4fc46f");
        public static readonly Color Parchment = Hex("#f3e8cf");
        public static readonly Color Ink = Hex("#1b1a17");

        public static Color Hex(string hex)
        {
            ColorUtility.TryParseHtmlString(hex, out var c);
            return c;
        }

        public static Color Rgba(int r, int g, int b, float a) => new Color(r / 255f, g / 255f, b / 255f, a);

        /// <summary>display.ts hueFor: the tile colour behind a portrait, from the card id.</summary>
        public static Color Hue(string id)
        {
            int h = 0;
            foreach (var ch in id) h = (h * 31 + ch) % 360;
            return Color.HSVToRGB(h / 360f, 0.35f, 0.32f);
        }

        // ---- assets ----
        static readonly Dictionary<string, Texture2D> Textures = new Dictionary<string, Texture2D>();
        static readonly Dictionary<string, Font> Fonts = new Dictionary<string, Font>();

        /// <summary>A picture under Resources/art, by path without extension ("characters/harriet_tubman"); null when missing.</summary>
        public static Texture2D Tex(string path)
        {
            if (Textures.TryGetValue(path, out var t)) return t;
            t = Resources.Load<Texture2D>("art/" + path);
            Textures[path] = t;
            return t;
        }

        public static Font FontOf(string name)
        {
            if (Fonts.TryGetValue(name, out var f)) return f;
            f = Resources.Load<Font>("fonts/" + name);
            Fonts[name] = f;
            return f;
        }

        static string CinzelFile(int weight) => weight >= 800 ? "Cinzel-ExtraBold" : weight >= 700 ? "Cinzel-Bold" : "Cinzel-SemiBold";
        static string CrimsonFile(int weight) => weight >= 700 ? "CrimsonPro-Bold" : weight >= 600 ? "CrimsonPro-SemiBold" : "CrimsonPro-Medium";

        /// <summary>Cinzel: the display face (names, numbers, labels).</summary>
        public static void Display(VisualElement ve, int weight, float size, Color color)
        {
            var f = FontOf(CinzelFile(weight));
            if (f != null) ve.style.unityFontDefinition = new StyleFontDefinition(f);
            ve.style.fontSize = size;
            ve.style.color = color;
        }

        /// <summary>Crimson Pro: the body face (rules, log, summaries).</summary>
        public static void Body(VisualElement ve, int weight, float size, Color color)
        {
            var f = FontOf(CrimsonFile(weight));
            if (f != null) ve.style.unityFontDefinition = new StyleFontDefinition(f);
            ve.style.fontSize = size;
            ve.style.color = color;
        }

        /// <summary>A Label with the theme's default resets: no margins or padding, wrapping text.</summary>
        public static Label Text(string s)
        {
            var l = new Label(s);
            l.style.marginLeft = l.style.marginRight = l.style.marginTop = l.style.marginBottom = 0;
            l.style.paddingLeft = l.style.paddingRight = l.style.paddingTop = l.style.paddingBottom = 0;
            l.style.whiteSpace = WhiteSpace.Normal;
            return l;
        }

        public static void Shadow(VisualElement ve, float dy, float blur, Color color)
        {
            ve.style.textShadow = new TextShadow { offset = new Vector2(0, dy), blurRadius = blur, color = color };
        }

        public static void Border(VisualElement ve, float width, Color color, float radius)
        {
            ve.style.borderLeftWidth = ve.style.borderRightWidth = ve.style.borderTopWidth = ve.style.borderBottomWidth = width;
            ve.style.borderLeftColor = ve.style.borderRightColor = ve.style.borderTopColor = ve.style.borderBottomColor = color;
            ve.style.borderTopLeftRadius = ve.style.borderTopRightRadius = ve.style.borderBottomLeftRadius = ve.style.borderBottomRightRadius = radius;
        }

        public static void Pad(VisualElement ve, float top, float right, float bottom, float left)
        {
            ve.style.paddingTop = top;
            ve.style.paddingRight = right;
            ve.style.paddingBottom = bottom;
            ve.style.paddingLeft = left;
        }

        public static void Abs(VisualElement ve, float? left = null, float? top = null, float? right = null, float? bottom = null, float? width = null, float? height = null)
        {
            ve.style.position = Position.Absolute;
            if (left != null) ve.style.left = left.Value;
            if (top != null) ve.style.top = top.Value;
            if (right != null) ve.style.right = right.Value;
            if (bottom != null) ve.style.bottom = bottom.Value;
            if (width != null) ve.style.width = width.Value;
            if (height != null) ve.style.height = height.Value;
        }

        public static void Fill(VisualElement ve)
        {
            ve.style.position = Position.Absolute;
            ve.style.left = ve.style.top = ve.style.right = ve.style.bottom = 0;
        }

        /// <summary>A picture stretched to the element (the web's `center / 100% 100%`): frames, plates, kit sprites.</summary>
        public static void Stretch(VisualElement ve, Texture2D tex)
        {
            if (tex == null) return;
            ve.style.backgroundImage = new StyleBackground(tex);
            ve.style.backgroundSize = new BackgroundSize(Length.Percent(100), Length.Percent(100));
            ve.style.backgroundRepeat = new BackgroundRepeat(Repeat.NoRepeat, Repeat.NoRepeat);
        }

        /// <summary>A picture cover-fitted to the element (the web's `object-fit: cover; object-position: center N%`).</summary>
        public static void Cover(VisualElement ve, Texture2D tex, float topPercent = 50)
        {
            if (tex == null) return;
            ve.style.backgroundImage = new StyleBackground(tex);
            ve.style.backgroundSize = new BackgroundSize(BackgroundSizeType.Cover);
            ve.style.backgroundRepeat = new BackgroundRepeat(Repeat.NoRepeat, Repeat.NoRepeat);
            ve.style.backgroundPositionX = new BackgroundPosition(BackgroundPositionKeyword.Center);
            ve.style.backgroundPositionY = new BackgroundPosition(BackgroundPositionKeyword.Top, Length.Percent(topPercent));
        }

        /// <summary>Nine-slice (the web's border-image): the caps are the sprite's, scaled so the sprite's height becomes `height`.</summary>
        public static void Slice(VisualElement ve, Texture2D tex, float height, int l = 75, int t = 75, int r = 75, int b = 79)
        {
            if (tex == null) return;
            ve.style.backgroundImage = new StyleBackground(tex);
            ve.style.backgroundSize = new BackgroundSize(Length.Percent(100), Length.Percent(100));
            ve.style.unitySliceLeft = l;
            ve.style.unitySliceTop = t;
            ve.style.unitySliceRight = r;
            ve.style.unitySliceBottom = b;
            ve.style.unitySliceScale = height / tex.height;
        }

        /// <summary>
        /// A button from the UI Kit Maker cut (public/art/kit, theme.css "The kit"): a piece ("primary", "secondary",
        /// "small", "stand-btn-on") in its four states, nine-sliced so the sprite's height becomes kh. Hover and press swap
        /// the sprite, never the size (the web's rule: kit hover never swaps sprites' scale, only the frame).
        /// </summary>
        public static Button Kit(string piece, string text, float kh, Action onClick, bool enabled = true)
        {
            var b = new Button(onClick) { text = text };
            b.style.backgroundColor = Color.clear;
            b.style.borderLeftWidth = b.style.borderRightWidth = b.style.borderTopWidth = b.style.borderBottomWidth = 0;
            b.style.marginLeft = b.style.marginRight = b.style.marginTop = b.style.marginBottom = 0;
            b.style.height = kh;
            b.style.minHeight = kh;
            float cap = kh * 0.205f;
            Pad(b, 0, cap + kh * 0.1f, kh * 0.03f, cap + kh * 0.1f);
            bool small = piece == "small";
            int sl = small ? 56 : 75, st = small ? 56 : 75, sr = small ? 56 : 75, sb = small ? 59 : 79;
            void Show(string st8) => Slice(b, Tex($"kit/{piece}-{st8}"), kh, sl, st, sr, sb);
            Show(enabled ? "default" : "disabled");
            var dark = piece == "secondary" || piece == "lock-locked";
            Display(b, 700, kh * 0.33f, dark ? Hex("#0c1c36") : piece == "stand-btn-on" ? Hex("#fff4d5") : Hex("#f9e6cd"));
            b.style.unityTextAlign = TextAnchor.MiddleCenter;
            b.style.letterSpacing = 1;
            if (!dark) Shadow(b, 2, 3, Rgba(11, 18, 40, 0.75f));
            b.SetEnabled(enabled);
            if (enabled)
            {
                b.RegisterCallback<PointerEnterEvent>(_ => Show("hover"));
                b.RegisterCallback<PointerLeaveEvent>(_ => Show("default"));
                b.RegisterCallback<PointerDownEvent>(_ => Show("pressed"), TrickleDown.TrickleDown);
                b.RegisterCallback<PointerUpEvent>(_ => Show("hover"), TrickleDown.TrickleDown);
            }
            return b;
        }
    }
}
