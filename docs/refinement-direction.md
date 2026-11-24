# Connected interface polish

## User correction
The flat photographic pass was rejected. It had too much small peripheral copy, weak depth, a generic header and motion that introduced disconnected elements instead of transforming existing ones. This pass supersedes that direction.

## Visual direction
- Keep the reference's frosted white material, inset highlights, rounded controls and soft elevation. Use it in a pink/lilac creator setting, not a replica of the reference store.
- Deep plum `#2F1730`, reading plum `#654D60`, berry `#A31C60`, blush `#FCE8F1`, lilac `#EEE8FC`, white. Color-rich backgrounds live inside composed hero/product surfaces. Reading sections remain quiet.
- Self-hosted Outfit gives the interface the reference's rounded, friendly character. Hero display 45–84px, section headings 36–56px, body 18–21px, field text 18px. Supporting labels do a real job, not decorate the headline.
- Remove the secondary hero slogan, capability strip, tiny photograph subtitles, repeated section eyebrows and example prices scattered around the landing.
- Replace the top pill navigation with a simple brand header and a floating three-position navigation dock. Its selected surface physically moves between destinations.

## Composition
```
brand                                      get started
[       rose/lilac hero with generous inset space      ]
[  one headline + body + CTA     frosted creator card  ]

what could you teach?              one useful paragraph
[ photographic idea ] [ photographic idea ] [ idea    ]

studio explanation       [ interactive idea / lesson / course ]
[ wallet material ]       payment direction and clear limits
three actual creation steps
preview availability
questions with expanding answers
one final invitation
                      [ discover | studio | questions ]
```

## Connected motion
- Hero creator surface and setup card share `journey-panel`, then become the editor surface. Browser View Transitions interpolate their geometry, with a direct update fallback.
- A selected course photograph becomes the large photograph in its course sheet and returns when closed.
- Setup retains the same card and action region while content changes. Its progress rail grows rather than being replaced by an unrelated entrance animation.
- Navigation and studio-demo selection use one moving background. FAQs expand their existing layout space.
- No page-load fade-up reveals. Reduced-motion preference skips shared-element snapshots and uses immediate state changes.
- Snapshot errors cannot block an action. The state update is guarded to run once.

## Responsive and honest
All desktop splits collapse by role, with the supporting signup photo removed below 900px. No external assets at runtime, browser-native confirmation prompts or native selects are introduced. The custom browser-tab unload safeguard remains because browsers do not permit a replacement.

The profile/drafts remain device-local. Authentication, publication, enrollment, contract execution and payments are not made functional by this design pass. Availability and FAQ state that plainly, without repeating tiny disclaimers around every action.
