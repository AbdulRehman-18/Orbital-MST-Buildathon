# Accessibility — automated and manual

**Standard:** WCAG 2.1 AA (also required by GIGW 3.0). **Automated** checks run on every PR (`apps/web/e2e/a11y.spec.ts`, axe-core): every public page in English, ಕನ್ನಡ, தமிழ், हिन्दी; the dark theme; and the citizen, official, auditor and contractor workspaces. Automation finds roughly a third of real problems — the manual pass below is required before the pilot.

## Fixed during Phase 6 (found by the automation)
- Status badges failed contrast (raw status colour on its own tint) → text now derives from the hue mixed toward black/white per theme.
- Progress bars had no accessible name → `aria-label` + integer `aria-valuenow`.
- Skip-to-content link added and covered by a test; every icon-only button has an `aria-label`.

## Manual pass — protocol
Two testers, **one per platform**, each language once:

| | Desktop | Mobile |
|---|---|---|
| Screen reader | NVDA (Windows) + Firefox, or VoiceOver (macOS) + Safari | TalkBack (Android) + Chrome; VoiceOver (iOS) + Safari |
| Languages | en, kn, ta, hi (each with the OS voice for that language, or English voice + note) | same |

Tasks (each must be doable **without sight or a mouse**):
1. Land on the home page: hear the headline, the four totals, and reach "Explore projects".
2. Find a project by search and open it; hear status, budget, progress ("Progress 40 percent") and milestones.
3. Verify a record on `/verify`.
4. Open the Transparency page; hear who holds admin and the trust assumption.
5. Citizen login: hear the consent notice, tick the box, enter a phone number, receive and enter the code.
6. File and upvote a grievance.
7. As an official (wallet): create/approve; as an auditor: review a proof; as a contractor: upload proof (camera/file picker).
8. Switch language and theme; zoom to 200 % and 400 % (reflow, no horizontal scroll); Windows High Contrast.

Record for each task: pass / fail / friction, the exact announcement heard, and a screenshot or audio note. File defects as issues labelled `a11y`, severity by blocked task.

## Known limits to check by hand
- Leaflet map: markers are keyboard-focusable but the map is supplementary — every project is also in the list view and each project page; confirm the list is discoverable from the map heading.
- Indic-language screen-reader voices vary by OS; note the voice used.
- Live-updating counters (socket) should not steal focus or spam announcements — verify.

## Sign-off
| Language | Desktop tester / date | Mobile tester / date | Blocking defects open |
|---|---|---|---|
| English | | | |
| ಕನ್ನಡ | | | |
| தமிழ் | | | |
| हिन्दी | | | |
