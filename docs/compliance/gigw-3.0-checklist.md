# GIGW 3.0 (Guidelines for Indian Government Websites and Applications) — self-assessment

Needed if the pilot is hosted on a government domain (`*.gov.in` / `*.nic.in`) or run by a government body. Status as of Phase 6; "Evidence" is where an assessor should look. **Open** items are for the operator or for the audit by an STQC/NIC-empanelled assessor; this table is a preparation aid, not a certificate.

| # | Area | Requirement (abridged) | Status | Evidence / action |
|---|---|---|---|---|
| 1 | **Accessibility** | WCAG 2.1 AA (2.x), keyboard operable, screen-reader friendly | Automated ✔ / manual **open** | axe: 0 violations on all public pages × en/kn/ta/hi, dark theme and 4 signed-in workspaces (`apps/web/e2e/a11y.spec.ts`); manual NVDA/TalkBack pass in [`docs/pilot/accessibility.md`](../pilot/accessibility.md) |
| 2 | Language | Bilingual/multilingual content, language switcher | ✔ | English, ಕನ್ನಡ, தமிழ், हिन्दी; persistent switcher in every header |
| 3 | Content | Ownership, last-updated, contact | Partial | Footer + Privacy/Terms with version/date; add department name/logo and "content owned by" line before launch |
| 4 | Policies | Privacy, terms, copyright, hyperlinking, accessibility statement, help | Partial | Privacy ✔, Terms ✔ (draft, counsel review); **open:** accessibility statement, copyright/hyperlinking policy, help page |
| 5 | Usability | Consistent navigation, search, responsive | ✔ | one header/nav pattern, works to 375 px; `/verify` search; PWA |
| 6 | Performance | Fast load, low bandwidth | ✔ | first-load JS+CSS ≈ 358 kB gzip (CI budget 450 kB), lazy map/dashboards, PWA cache; k6 load gate |
| 7 | Security | Latest TLS, security headers, no mixed content, vulnerability assessment | Partial | CSP/HSTS/XFO/etc. in Nginx; ZAP baseline in CI; **open:** third-party VAPT before go-live; TLS config at the terminator |
| 8 | Hosting | On MeitY-empanelled/NIC infrastructure, India-resident | **Open** | operator decision; deployment is container-based and portable |
| 9 | Open data | Publish datasets | ✔ | `/api/public/export.csv|json`, RTI s.4 note on the home page |
| 10 | Mobile | Works on phones | ✔ | responsive + installable PWA |
| 11 | Charter / Terms | Website policies visible | Partial | see #4 |
| 12 | Metadata | Title, description, language, canonical | ✔ | `index.html`; per-page `<html lang>` follows the chosen language |
| 13 | Documents | Downloadable formats stated | Partial | CSV/JSON exports; state size/format next to links |
| 14 | Contact | Grievance officer, feedback | ✔ | `/privacy`, `/transparency` |

Before launch: close #3, #4, #7 (VAPT) and #8, and run the manual accessibility pass (#1).
