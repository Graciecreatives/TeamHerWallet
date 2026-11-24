# LearnPurse design system

## Current direction

The connected polish pass supersedes the rejected flat photographic layout. The reference is bunaistore.shop's frosted material, soft depth and rounded controls, applied to a creator course studio in berry, blush and lilac. There are no page-load fade-up reveals and no decorative eyebrow labels around each heading.

See [refinement direction](refinement-direction.md) for the composition and motion brief, and [photography](photography.md) for locally served image credits.

## Palette and contrast

| Role | Value | Use |
| --- | --- | --- |
| Ink | `#2F1730` | Main text |
| Reading plum | `#654D60` | Supporting text |
| Berry | `#A31C60` | Primary actions, selections, focus |
| Dark berry | `#811448` | Inline actions and hover |
| Blush | `#FCE8F1` | Warm creator surfaces |
| Lilac | `#EEE8FC` | Product and wallet surfaces |
| Canvas | `#FFF9FC` | Setup background |
| Paper | `#FFFFFF` | Reading and frosted surfaces |
| Success | `#0F7553` | Saved and completed states |
| Error | `#B52A45` | Inline errors and destructive actions |

Native tests verify text tokens at 4.5:1 against paper/canvas/blush/lilac, white labels on filled actions at 4.5:1, and focus/error/field boundaries at 3:1. Bright gradients sit behind content in the hero and illustrations, not behind long passages of low-contrast text.

## Typography and spacing

Self-hosted Outfit Variable is the primary family. Inter remains an installed fallback. The rounded family restores the reference's approachable feel without borrowing its branding.

- Main heading: responsive 45–84px, weight 550.
- Section headings: 36–56px, weight 500.
- Reading copy: 18–21px, generous line-height and constrained measure.
- Setup fields: 18px text, 72px height, floating labels, visible boundaries and focus.
- Supporting copy: normally 14–17px. No 10–12px marketing captions.
- Large actions: 60px, 18px labels. The header action is compact but touch-friendly.

The content width caps at 1200px. Page gutters range from 16px on phones to 32px on wider screens. Hero inset spacing and card inset spacing are independent so the photo and text align deliberately rather than stretching to arbitrary edges.

## Navigation and composition

A simple brand/action header replaces the pill navbar. A three-position floating dock provides Discover, The studio and Questions, with one moving selection surface and an observed current section. Keyboard activation remains native button behavior.

The landing has one main headline and one supporting paragraph. It continues through three photographic course ideas, an interactive three-state studio illustration, the wallet direction, a genuine three-step process, present/planned availability, expanding questions and a single final invitation. Example curricula are real validated draft data, not invented customer purchases.

## Connected motion

`app/utils/motion.ts` uses native View Transitions when available. The hero panel, setup card and editor share `journey-panel`; selected course photography shares `course-image` with its sheet. This interpolates position and dimensions instead of making an unrelated object slide into view.

Setup keeps one card, a growing progress rail and a stable action region. Dock/demo selection and FAQ expansion are geometric CSS changes. Snapshot failures apply the requested state once, never block navigation. Reduced-motion and unsupported browsers update directly.

## Functional boundaries

Profile setup is device-local, not authenticated sign-in. Draft save/export, validation, module ordering and review remain functional. Freighter access requests a public address and network, never a seed or secret key. Publication, enrollment, Soroban execution and payments remain unavailable.

Custom PrimeVue sheets handle in-app confirmations. Browser-tab unload retains the browser's safeguard because websites cannot replace that prompt.

## Verification

```bash
npm test
npm run test:ui
npm run typecheck
npm run build
npm run test:smoke
npm run test:browser
```

The browser suite uses an isolated production server on 3198, not the user's dev tab. Responsive coverage spans 320 through 1920px and short landscape. Manual Safari/iOS, screen-reader and live Freighter acceptance remain separate gates. Screenshot and automated geometry evidence do not prove subjective design approval.
