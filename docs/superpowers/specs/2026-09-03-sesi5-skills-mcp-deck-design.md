# Design Spec — SESI-5 Deck: "From Static to Interactive" (Skills, MCP & the DRR Portfolio)

Date: 2026-09-03
Status: Approved for build

## 1. Context

U-INSPIRE 101 Bootcamp (Decode Risk. Ship Impact.), SESI-5. The session introduces
`freebuff` and `opencode` as coding-agent partners and asks participants to build an
interactive, deployable DRR / climate-resilience portfolio — not just AI-generated
static infographics.

This deck is the teaching artifact for that session. It explains **Agent Skills** and
**MCP (Model Context Protocol)**, why each registration service is needed, how to write
a PRD and break work into small passes before throwing it at a coding agent, and how to
ship a working prototype. It includes one embedded interactive mini-app so participants
experience "interactive vs static" rather than just reading about it.

## 2. Decisions

| Aspect | Decision |
|---|---|
| Deliverable | Single self-contained `index.html`, opens in any browser, works fully offline (no CDN, no network) |
| Slide engine | Hand-rolled lightweight engine (custom JS/CSS, keyboard navigation, slide counter, section tags) |
| Language | Full English |
| Visual style | Light editorial — white canvas, near-black ink, amber/risk-orange accent, serif display headings + monospace for tool names |
| Structure | 22 slides in 6 acts, Approach A narrative ("From Static to Interactive") |
| Demo case | Landslide risk, Bandung — "parents deciding safe school route after heavy rain" |
| Demo data | Realistic embedded sample data for 5 Bandung wards, labeled "exploratory, not official" |
| Interactive demo | Slide 20 embeds a client-side mini-app "Bandung Route Check" (ward selector → risk verdict) |

## 3. Visual system

- Background: `#FFFFFF`
- Ink: `#111111` / near-black
- Accent: amber `#F59E0B` (risk) with supporting `#EF4444` (danger) and `#10B981` (safe)
- Muted text: `#6B7280`
- Typography: serif display (Georgia / ui-serif) for slide titles; system sans for body;
  monospace (`ui-monospace`) for `freebuff`, `opencode`, `MCP`, code/prompts
- Slide chrome: top-right section tag `01 / 22`, bottom slide counter + act label
- Keyboard: `←` / `→` / Space / PageUp / PageDown to navigate; `Home` / `End` for first/last
- Each slide is a full viewport (16:9-safe, works at 1280×720 and up, scrollable if content overflows on small screens)

## 4. Slide-by-slide spec

### Act 1 — The Shift (slides 1–3)

**1. Cover**
- Title: "From Static to Interactive"
- Subtitle: "Agent Skills · MCP · building your DRR portfolio with freebuff + opencode"
- Footer: "U-INSPIRE 101 Bootcamp — Decode Risk. Ship Impact. — SESI-5"

**2. Why interactive > infographic**
- Left column "AI infographic": explain · static · one-way · read-once
- Right column "Interactive app": explore · decide · act · reusable
- Takeaway: "An infographic tells a story. A prototype supports a decision."
- Context: portfolio prototypes should prove thinking, not just look good.

**3. The target**
- Re-state the bootcamp bar: small · evidence-based · usable · honest
- "Deployed prototype, not a PDF." — repo + URL + case study
- Bridge: this session shows the tools to get from idea → deployed.

### Act 2 — Meet the stack & the spec (slides 4–11)

**4. Stack overview**
- Diagram: `freebuff` + `opencode` (agent) → build (Next.js/Tailwind) → deploy (Vercel/Cloudflare)
- Data: Turso (SQLite at edge)
- Note: 4 services you need — GitHub, Turso, Cloudflare, Gravatar

**5. GitHub — why register**
- Purpose: source control + identity (Vercel/Cloudflare/opencode auth)
- Why it matters for THIS bootcamp: your repo is the proof — evidence of thinking, PRD, passes, README case study
- Deliverable: public repository

**6. Turso — why register**
- Purpose: SQLite-compatible database that runs at the edge — no server to manage
- Where it fits: ward data, rainfall, slope/risk scores = schema + seed data
- Why it matters: your app reads real structured data, not hardcoded JS
- Deliverable: database URL/credentials for the app

**7. Cloudflare + Gravatar — why register**
- Cloudflare: DNS + deploy (alternative/companion to Vercel)
- Gravatar: free avatar + free subdomain (`yourname.gravatar.com`) = your portfolio URL
- Why it matters: a public URL is what makes a prototype a portfolio
- Deliverable: a live link you can share

**8. Why a PRD before code**
- "Discipline before code" (links to bootcamp principle)
- PRD = contract between you and the agent
- 3 reasons: shared understanding · scope control · measurable completion
- Without a PRD the agent guesses, scope creeps, output is hard to audit

**9. Anatomy of a PRD**
- Visual "PRD card" with sections:
  - user (who) · purpose (which decision) · pages/flow (one core journey)
  - tech stack · database design/schema · API · UI/UX flow
  - constraints · seed data · expected states (normal/empty/error) · non-goals
- Note: a PRD covers everything from stack to pixels — that's why it lives next to the stack slides

**10. Break it into small passes**
- Why: each pass demonstrable · small failure surface · easy to audit
- Pass 01 — Foundation: app shell, navigation, schema, seed data, visible disclaimer
- Pass 02 — Core journey: one dashboard/map flow, one interaction, one action
- Pass 03 — Quality: mobile layout, validation, error states, accessibility, attribution
- Pass 04 — Portfolio polish: methodology, screenshots, demo reset, clean explanation
- Rule: never start the next pass until the current one is verified

**11. The prompt**
- Copyable prompt template (monospace block), e.g.:
  "You are building a Next.js app. User: … Purpose: … Pages: … Data model: … API: … Tech stack: … Language: English. Seed data: … Expected states: … Non-goals: … Build Pass 01 only, then stop and report."
- Guidance: one pass at a time · verify · then continue · spec, not a vague wish

### Act 3 — Agent Skills (slides 12–14)

**12. What is a Skill**
- Definition: a packaged workflow + knowledge that an agent loads on demand
- Not a plugin, not hardcoded behavior
- Analogy: a recipe card — the agent follows it when the task matches

**13. Anatomy of a skill**
- SKILL.md (instructions) + optional scripts/resources
- Triggered by context (task matches the skill's description)
- The agent reads it and follows the workflow, then applies its tools

**14. Skills for DRR**
- Table mapping skills to portfolio needs:
  - frontend-design → polished interactive UI
  - quick-research / websearch / open-link → evidence & context
  - generate-image / search-image → visuals & assets
  - data/search skills → finding and structuring datasets
- Takeaway: skills = "how to do a class of work well" (research, design, image, data)

### Act 4 — MCP (slides 15–17)

**15. What is MCP**
- Model Context Protocol: an open standard for agents ↔ external tools & data servers
- MCP servers = "what to reach": databases, files, web services
- One protocol, many integrations

**16. MCP in your project**
- Diagram: agent ↔ MCP servers ↔ Turso (DB), GitHub (repo), Cloudflare/Vercel (deploy), data APIs
- These are live connections used during the build — not one-off files
- Example: reading ward/rainfall data from Turso via MCP while the agent writes code

**17. Skill vs MCP**
- Comparison table:
  - Skill: static packaged procedure · activated by topic · "how to think/do"
  - MCP: live connection · activated by tool call · "what to reach/read"
- They work together: a skill defines the workflow; MCP gives it live data

### Act 5 — From spec to deployed: Bandung Landslide (slides 18–21)

**18. The case, bounded**
- Problem statement (from template):
  "Parents in a Bandung school-route area struggle to decide if it's safe to walk after heavy rain because landslide-risk information is fragmented."
- One location (pilot wards) · one user group (parents/school staff) · one journey (route decision)
- Why it fits: specific enough to research, small enough to prototype in 1–2 weeks

**19. The evidence**
- Source trail shown as labeled cards, each with: source · period · use · limitation:
  - Rainfall: BMKG / Open-Meteo historical + forecast
  - Slope & elevation: DEM (open elevation data)
  - Land cover: open land-cover data
  - Incident records: reported events (news/timeline metadata)
- Disclaimer reminder: official data = factual foundation; crawled data = contextual/exploratory

**20. Live demo: "Bandung Route Check" (interactive mini-app)**
- Full client-side, sample data clearly labeled
- Interaction: pick a ward from 5 (Cidadap, Coblong, Bandung Wetan, Sukajadi, Cibeunying Kaler)
- Shows: rainfall level · slope risk · verdict (Safe to walk / Take a detour / Stay home) + one-line reason
- Verdict rule (deterministic, sample data):
  - Stay home when rainfall ≥ heavy AND slope risk ≥ high
  - Take a detour when rainfall ≥ heavy OR slope risk ≥ high
  - Safe to walk otherwise
- Each ward has a fixed sample profile: {rainfall, slopeRisk, routeNote} encoded in the dataset
- Persistent disclaimer banner: "This prototype is an exploratory portfolio project. It is not an official emergency-warning system and does not replace information from authorized agencies."
- Callouts on slide: skill used (frontend-design) · MCP connection (Turso data)

**21. Deploy & prove**
- Deploy checklist: repo (GitHub) ✔ · database (Turso) ✔ · URL (Gravatar/Cloudflare) ✔
- One deploy command example
- Test: 3–5 people like the target user; one focused iteration
- Honest limits: what it can claim (demonstrates the flow) vs cannot claim (official warning)

### Act 6 — Your portfolio (slide 22)

**22. Checklist + CTA**
- By the end, each participant has: bounded local case · documented data catalog · PRD · deployed URL · GitHub repo · portfolio case study
- CTA: ask in the group chat if stuck; next steps for their own project

## 5. Technical implementation notes

- Single `index.html`, no external dependencies (works offline — bootcamp venue may have flaky internet)
- CSS custom properties for the palette; `prefers-reduced-motion` respected
- Slide engine: array of sections; JS handles keyboard nav, counter updates, act labels; slides hidden except active
- Mini-app (slide 20): embedded HTML/CSS/JS with its own sample dataset object; styled to feel like a real app card
- Prompt template (slide 11): click-to-copy button (falls back gracefully to manual select)
- Accessible: visible focus states, semantic headings, `aria-label` on nav, sufficient contrast

## 6. Out of scope (non-goals)

- No live API calls (no Open-Meteo fetch; sample data only)
- No real Turso/Cloudflare connection inside the deck — those are shown as concepts/diagrams
- No multi-language version (English only)
- No build tooling (no npm/bundler) — plain HTML/CSS/JS
