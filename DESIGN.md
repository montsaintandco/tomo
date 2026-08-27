---
name: TOMO
description: Korea–Japan secondhand market where two speech bubbles meet and make a heart.
colors:
  tomo-ivory: "#FBF9F4"
  ink: "#26333F"
  ink-soft: "#5C6B77"
  ink-faint: "#93A0AB"
  tomo-blue: "#9CC5EC"
  tomo-pink: "#F2AFAF"
  tomo-coral: "#E2807F"
  tomo-coral-deep: "#C14E4C"
  tomo-navy: "#0C447C"
  tomo-rose: "#A34543"
typography:
  display:
    fontFamily: "Cafe24Ssurround, Pretendard, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    letterSpacing: "0"
  title:
    fontFamily: "Pretendard, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.375
  price:
    fontFamily: "Pretendard, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 800
  body:
    fontFamily: "Pretendard, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Pretendard, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 700
  micro:
    fontFamily: "Pretendard, -apple-system, sans-serif"
    fontSize: "10px"
    fontWeight: 700
rounded:
  chip-tail: "9px"
  chip-tail-cut: "2px"
  thumb: "16px"
  chat: "18px"
  card: "20px"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.tomo-coral-deep}"
    textColor: "#FFFFFF"
    rounded: "{rounded.full}"
    padding: "10px 24px"
  button-navy:
    backgroundColor: "{colors.tomo-navy}"
    textColor: "#FFFFFF"
    rounded: "{rounded.full}"
    padding: "10px 24px"
  card:
    backgroundColor: "#FFFFFF"
    rounded: "{rounded.card}"
  chip-bubble-kr:
    backgroundColor: "rgba(156, 197, 236, 0.35)"
    textColor: "{colors.tomo-navy}"
    padding: "2px 6px"
  chip-bubble-jp:
    backgroundColor: "rgba(242, 175, 175, 0.38)"
    textColor: "{colors.tomo-rose}"
    padding: "2px 6px"
  tab-active:
    backgroundColor: "{colors.tomo-navy}"
    textColor: "#FFFFFF"
    rounded: "{rounded.full}"
    padding: "6px 14px"
  input-search:
    backgroundColor: "#FFFFFF"
    rounded: "{rounded.full}"
    padding: "10px 16px 10px 40px"
---

# Design System: TOMO

## Overview

**Creative North Star: "두 말풍선이 만나면 하트가 된다" (When two speech bubbles meet, they become a heart)**

TOMO is a kawaii, tactile, mobile-first world built on ivory paper and navy ink. Country and language are never signalled by flags or gray badges: they are pastel speech-bubble chips — Korea speaks in blue with a left tail, Japan in pink with a right tail. The blue→pink bridge gradient and the coral heart appear only at cross-border moments (travel direct-deals, proxy purchase, translated chat); everywhere else the feed reads as calm, dense marketplace paper. Gray marketplace chrome is refused — every neutral is navy-tinted, down to the shadows, scrollbar, and text selection.

The build is dense in the Daangn/Mercari idiom (horizontal listing rows, image-first grid cards, price boldest) but every touchable surface answers with a springy squish press. Action is always coral: the deep coral CTA carries white text; the pastel coral is reserved for decorative hearts.

**Key Characteristics:**
- Ivory paper + navy-tinted ink scale; no achromatic gray anywhere
- Country = speech-bubble chip color, never a flag or label
- Cross-border moments get the blue→pink gradient and heart; nothing else does
- One perpetual motion per page: the wordmark's heartbeat
- Squish-press feedback on everything tappable

## Colors

A two-nation pastel pair (blue/pink) over ivory and navy ink, with coral as the single action voice.

### Primary
- **Tomo Coral Deep** (#C14E4C): the action color — CTA buttons, the sell FAB, send button, auction badges, input caret, focus ring. Carries white text (the pastel coral fails AA, so actions always use this deep step).
- **Tomo Coral** (#E2807F): decorative hearts only — the wordmark heart, the TomoSymbol heart, the travel-deal heart glyph. Never a button fill.

### Secondary
- **Tomo Blue** (#9CC5EC): Korea's voice. Bubble-KR chip fill (at 35% alpha), Korean chat bubbles (40% alpha), active nav pill (30% alpha), text selection.
- **Tomo Pink** (#F2AFAF): Japan's voice. Bubble-JP chip fill (38% alpha), Japanese chat bubbles (45% alpha), the warm end of gauges.
- **Tomo Navy** (#0C447C): deep structural accent — wordmark text, active tab fill, login/navy buttons, text on blue fields, and the tint inside every shadow and overlay (`tomo-navy/70` sold overlays, `tomo-navy/5` image wells and hairline borders).
- **Tomo Rose** (#A34543): deep text on pink fields — JP chip text, Japanese chat text, error text (4.5:1 on pink tints).

### Neutral
- **Tomo Ivory** (#FBF9F4): the page paper; also input fills sitting on white.
- **Ink** (#26333F): primary text (navy-tinted, not black).
- **Ink Soft** (#5C6B77): secondary text — metadata, placeholders, inactive nav.
- **Ink Faint** (#93A0AB): reserved strictly for sold/disabled de-emphasis and decorative icon strokes. Never body copy.

### Named Rules
**The Bridge Rule.** The blue→pink gradient (`.grad-bridge`, `.grad-bridge-soft`) appears only where the two countries actually meet: the proxy-purchase banner, travel direct-deal badges, translated-chat moments. It is never generic decoration — even the trust gauge uses its own pink→coral warm gradient instead.
**The No-Gray Rule.** There is no achromatic gray. Every neutral, border, shadow, scrim, and scrollbar is tinted with navy (`rgba(12,68,124,…)`); loading skeletons shimmer in warm ivory tones.
**The Deep-Ink-On-Tint Rule.** Pastel fields never carry pastel text: blue fields take navy (#0C447C), pink fields take rose (#A34543), and white-text surfaces use coral-deep or navy fills only.

## Typography

**Display Font:** Cafe24 Ssurround (with Pretendard fallback) — `.font-brand`, logo and brand-voice numerals only
**Body Font:** Pretendard variable 300–800 (with -apple-system, Hiragino Kaku Gothic ProN, Yu Gothic fallbacks — the stack carries Japanese glyphs)

**Character:** A rounded, friendly Korean display face over a neutral pan-CJK body. Hierarchy is carried by weight jumps (400 → 700 → 800) and tiny size steps, not large type.

### Hierarchy
- **Display** (700, ~24px `.font-brand`): the wordmark and brand-voice numbers (trust temperature). Not used for section headings.
- **Title** (400, 15px, snug): listing titles in rows and detail; 2-line clamp in lists.
- **Price** (800, 16px, `.tnum`): the boldest thing on any card — prices always out-weigh their titles and always use tabular numerals.
- **Body** (400, 14px, relaxed): descriptions, chat messages, empty-state copy.
- **Label** (700, 12–13px): metadata rows, tabs, nav labels.
- **Micro** (700, 10px): chips, badges, nav captions, gauge tick labels.

### Named Rules
**The Price-Loudest Rule.** On any commerce surface, price is the heaviest text (extrabold 800, tabular-nums); the title stays regular weight.
**The Two-Tongue Rule.** User-facing hints and empty states speak both languages in one breath ("번역 보기 · 翻訳を見る"), Korean first, joined by a middle dot.

## Layout

Responsive two-shell layout. Mobile (<768px): `max-w-md` centered shell, `px-4` gutters, fixed bottom nav with `pb-24` body clearance, sticky page headers with `bg-tomo-ivory/95 backdrop-blur`. Desktop (md+): the bottom nav hides and a sticky ivory top GNB (SiteHeader: wordmark, pill nav links, coral 판매하기 CTA, max-w-6xl) plus a white SiteFooter carry the chrome; page headers go static. Feeds widen to `max-w-6xl` — the home feed flips from Daangn rows to a 3–4 column image-first card grid (same ListingRow markup), the global market grid grows to 4–5 columns, and detail pages become a two-column grid (sticky rounded image column left, info + inline CTA right, `max-w-5xl`). Operate pages (chat, mypage, profile, sell, transactions) stay a single `max-w-2xl` column. Feeds are dense Daangn-style rows (96px square thumb, `py-3.5`, hairline `border-tomo-navy/5` separators, sold items sunk below active); the global market uses a Mercari-style image-first grid of square-thumb cards. Spacing rhythm is tight: gaps of 1–3 Tailwind steps (4–12px), section padding 16px. Light mode is locked (`color-scheme: light`, theme color #FBF9F4).

## Elevation & Depth

Depth comes from navy-tinted shadows on white cards over ivory — never borders-plus-shadow, and never neutral black shadows. Flat surfaces (rows, chips) separate with `tomo-navy/5` hairlines and tint wells instead of elevation.

### Shadow Vocabulary
- **Soft** (`--shadow-soft`: `0 1px 2px rgba(12,68,124,0.05), 0 4px 16px rgba(12,68,124,0.07)`): resting cards, search pill, active tab.
- **Lift** (`--shadow-lift`: `0 2px 6px rgba(12,68,124,0.09), 0 12px 28px rgba(12,68,124,0.11)`): card hover, paired with a −1px translate.
- **Float** (`--shadow-float`: `0 4px 10px rgba(193,78,76,0.25), 0 10px 30px rgba(12,68,124,0.14)`): the coral sell FAB only — a coral-warmed halo over the navy ambient.

### Named Rules
**The Tinted-Shadow Rule.** Every shadow is navy-tinted (the float adds coral); pure-black rgba shadows do not exist in this world.

## Shapes

Everything is round. Buttons, chips, tabs, inputs, and scrollbar thumbs are full-round pills (9999px); cards are 20px; image thumbs 16px; chat bubbles 18px. The signature silhouette is the speech-bubble tail: country chips keep three 9px corners and cut one to 2px (KR cuts bottom-left, JP cuts bottom-right), and chat bubbles cut their bottom corner toward the speaker (mine = bottom-right 4px, theirs = bottom-left 4px). Sharp rectangles do not appear.

## Components

### Buttons
- **Shape:** full-round pill (9999px), bold 700 text.
- **Primary:** coral-deep (#C14E4C) fill, white text — the single action voice (CTAs, send, sell FAB).
- **Navy variant:** tomo-navy fill, white text — account/structural actions (login, region setup).
- **Hover / Active:** hover eases to 0.94 opacity; active squishes to `scale(0.95)` on the `--squish` spring; disabled drops to 0.45 opacity.

### Chips
- **Country chips (`.bubble-kr` / `.bubble-jp`):** 10px bold text, pastel tint fill, deep-ink text, one squared tail corner. KR = blue/navy tail-left; JP = pink/rose tail-right. This is the only country signal — no flags.
- **Badges:** full-round micro pills — source labels on navy/60 scrims with backdrop-blur, auction state on coral-deep, travel-deal on `.grad-bridge-soft` with navy text and a coral heart.

### Cards / Containers
- **Corner Style:** 20px (`rounded-card`); thumbnails 16px.
- **Background:** white on ivory; image wells `tomo-navy/5`.
- **Shadow Strategy:** `--shadow-soft` at rest, `--shadow-lift` + `translateY(-1px)` on hover, `scale(0.98)` on press. No borders on cards.
- **Loading:** `.skeleton` ivory shimmer fills empty image wells; `TomoSymbol` (two bubbles + heart) fills empty states.

### Inputs / Fields
- **Style:** borderless full-round pills; white fill with soft shadow on ivory headers, ivory fill on white composers; inline SVG leading icon in ink-faint.
- **Focus:** global 2px coral-deep (#C14E4C) outline, 2px offset; caret is coral-deep.
- **Placeholder:** ink-soft, conversational Korean ("어떤 물건을 찾으세요?").

### Navigation
- **Bottom nav (mobile only, hidden md+):** fixed, max-w-md, `bg-white/95 backdrop-blur`, hairline top border. Five items, 10px bold labels, custom rounded-geometry stroke icons (1.7 stroke inactive → 2.1 active, active pill `tomo-blue/30`, active text navy, inactive ink-soft). Center slot is the raised coral sell FAB (48px circle, coral-deep, `--shadow-float`, −20px offset).
- **Tabs:** pill segments; active = navy fill + white text + soft shadow, inactive = white fill + ink-soft.

### Chat Bubbles (signature)
Language decides color, not sender: Korean messages sit on `tomo-blue/40` with navy accents, Japanese on `tomo-pink/45` with rose accents; message text itself is ink. Mine/theirs only decides alignment and which bottom corner is cut (4px). Foreign messages carry an inline "원문 보기 · 原文を見る" toggle.

### Brand Primitives (signature)
`Wordmark` (TOM + coral heart SVG replacing the final O — the heart carries `.heartbeat`, the page's only perpetual motion, 2.6s), `TomoSymbol` (blue + pink bubbles overlapping into a coral heart — empty states and broken-image fields), `CountryChip`. All hearts share one canonical SVG path.

### Motion
`--squish: cubic-bezier(0.34, 1.56, 0.64, 1)` is the world's deliberate tactile signature: `.press` scales to 0.96, buttons to 0.95, cards to 0.98 on :active, ~180ms. One perpetual animation per page (wordmark heartbeat); skeleton shimmer runs only while loading. `prefers-reduced-motion` collapses everything to ~0ms.

## Do's and Don'ts

### Do:
- **Do** signal country/language with bubble chips and bubble tints only — blue/navy for Korea, pink/rose for Japan.
- **Do** put `.press` (or `.btn`/`.card` states) on every tappable element; the squish spring is the house feel.
- **Do** set prices in extrabold 800 with `.tnum`, heavier than their titles.
- **Do** draw icons as inline rounded-geometry SVGs (1.7–2.2 stroke, round caps); reuse the canonical heart path.
- **Do** use ink-faint only for sold/disabled de-emphasis and decorative icon strokes.

### Don't:
- **Don't** use the bridge gradient outside cross-border moments (proxy banner, travel deals, translated chat).
- **Don't** introduce achromatic grays, black shadows, borders on cards, flags, or sharp corners.
- **Don't** put white text on pastel blue/pink/coral — deep steps (navy, rose, coral-deep) carry text.
- **Don't** add a second perpetual animation; the wordmark heartbeat is the only one.
- **Don't** use Cafe24 Ssurround for section headings or body copy — logo and brand-voice numerals only.
