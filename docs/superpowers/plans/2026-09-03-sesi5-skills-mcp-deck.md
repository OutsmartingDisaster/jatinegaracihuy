# SESI-5 "From Static to Interactive" Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single self-contained, offline `index.html` — a 22-slide light-editorial deck for U-INSPIRE SESI-5 explaining Agent Skills, MCP, the PRD workflow, and shipping a deployable DRR portfolio, with an embedded interactive "Bandung Route Check" mini-app.

**Architecture:** One HTML file with an embedded hand-rolled slide engine (CSS classes + vanilla JS keyboard nav). Slide 20 contains a client-side mini-app with a pure verdict function separated by `// PURE-START` / `// PURE-END` markers so Node can unit-test it without a DOM. A single Node verification harness (`tools/verify.js`) checks required markers and unit-tests the pure logic at every task boundary.

**Tech Stack:** Plain HTML5 + CSS3 + vanilla ES5-safe JS. No dependencies, no bundler, no CDN, works fully offline. Node.js (already required by the bootcamp) only for the verification harness.

## Global Constraints

- Language: Full English (all slide copy).
- Visual: light editorial — `--bg:#FFFFFF`, `--ink:#111111`, `--muted:#6B7280`, `--accent:#F59E0B`, `--danger:#EF4444`, `--safe:#10B981`; serif display headings (Georgia), system sans body, monospace for tool names.
- 22 slides, 6 acts, slide IDs `slide-1`…`slide-22`, each with `data-act` attribute (e.g. `data-act="Act 1 · The Shift"`).
- Works offline; no external requests; `prefers-reduced-motion` respected; visible focus states; semantic headings; sufficient contrast.
- Every slide body wrapped in `<section class="slide" id="slide-N" data-act="...">`.
- Verdict rule (deterministic, sample data): Stay home when rain=heavy AND slope=high; Take a detour when rain=heavy OR slope=high; Safe to walk otherwise.
- Required disclaimer on the mini-app: "This prototype is an exploratory portfolio project. It is not an official emergency-warning system and does not replace information from authorized agencies."
- Mini-app wards (exact ids): `cidadap`, `coblong`, `bandung-wetan`, `sukajadi`, `cibeunying-kaler`.

---

### Task 1: Foundation — slide engine, chrome, and verification harness

**Files:**
- Create: `index.html`
- Create: `tools/verify.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `index.html` with 22 empty `<section class="slide" id="slide-N" data-act="...">` elements; fixed chrome bar `#chrome` with `#counter` and `#actLabel`; `document.addEventListener('keydown', ...)` engine; CSS tokens from Global Constraints. `tools/verify.js` exposes a `run(checks)` pattern with `PASS`/`FAIL` output and exit code.

- [ ] **Step 1: Create `index.html` skeleton with full CSS system and slide engine**

Write `index.html` with exactly this content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SESI-5 · From Static to Interactive</title>
<style>
:root{
  --bg:#FFFFFF; --ink:#111111; --muted:#6B7280;
  --accent:#F59E0B; --danger:#EF4444; --safe:#10B981;
  --serif: Georgia, 'Times New Roman', serif;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace;
  --line:#EEEEEE;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.55;-webkit-font-smoothing:antialiased}
.slide{display:none;min-height:100vh;padding:64px 88px 120px;position:relative;max-width:1280px;margin:0 auto}
.slide.active{display:block}
.slide .tag{font-family:var(--mono);font-size:12px;letter-spacing:.16em;color:var(--muted);text-transform:uppercase}
.slide h1{font-family:var(--serif);font-size:58px;line-height:1.05;margin:.35em 0 .4em;font-weight:400}
.slide h2{font-family:var(--serif);font-size:32px;line-height:1.15;font-weight:400;margin:0 0 .5em}
.slide h3{font-family:var(--serif);font-size:20px;font-weight:400;margin:1.2em 0 .35em}
.slide p{font-size:17px;color:#333}
.slide ul{font-size:16px;color:#333}
.slide li{margin:.25em 0}
.tool{font-family:var(--mono);background:#F3F4F6;border:1px solid var(--line);border-radius:4px;padding:.05em .3em;font-size:.92em}
.lead{font-size:20px;color:var(--muted)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:40px}
.card{border:1px solid var(--line);border-radius:10px;padding:20px 22px;background:#fff}
.card h3{margin-top:0}
.kicker{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:2px}
.note{font-size:14px;color:var(--muted)}
.badge{display:inline-block;font-family:var(--mono);font-size:11px;letter-spacing:.08em;padding:3px 8px;border-radius:20px;text-transform:uppercase}
.badge.amber{background:#FEF3C7;color:#92400E}
.badge.red{background:#FEE2E2;color:#991B1B}
.badge.green{background:#D1FAE5;color:#065F46}
pre.code{background:#111;color:#E5E7EB;font-family:var(--mono);font-size:14px;line-height:1.5;padding:18px 20px;border-radius:10px;overflow-x:auto}
pre.code .copy{float:right;background:#374151;color:#fff;border:0;border-radius:6px;padding:4px 10px;font-family:var(--mono);font-size:12px;cursor:pointer}
#chrome{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:space-between;align-items:center;padding:14px 24px;font-family:var(--mono);font-size:12px;color:var(--muted);background:rgba(255,255,255,.92);border-top:1px solid var(--line);z-index:50}
#chrome #actLabel{letter-spacing:.12em;text-transform:uppercase}
#counter{letter-spacing:.1em}
#help{position:fixed;top:16px;right:20px;font-family:var(--mono);font-size:11px;color:var(--muted);z-index:50;text-align:right}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:2px}
@media (max-width:820px){
  .slide{padding:40px 28px 110px}
  .slide h1{font-size:36px}
  .cols{grid-template-columns:1fr;gap:20px}
}
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{transition:none!important;animation:none!important}
}
</style>
</head>
<body>
<div id="help">← → to navigate · Home / End</div>
<main id="deck">

<section class="slide" id="slide-1" data-act="Act 1 · The Shift"></section>
<section class="slide" id="slide-2" data-act="Act 1 · The Shift"></section>
<section class="slide" id="slide-3" data-act="Act 1 · The Shift"></section>
<section class="slide" id="slide-4" data-act="Act 2 · Stack &amp; Spec"></section>
<section class="slide" id="slide-5" data-act="Act 2 · Stack &amp; Spec"></section>
<section class="slide" id="slide-6" data-act="Act 2 · Stack &amp; Spec"></section>
<section class="slide" id="slide-7" data-act="Act 2 · Stack &amp; Spec"></section>
<section class="slide" id="slide-8" data-act="Act 2 · Stack &amp; Spec"></section>
<section class="slide" id="slide-9" data-act="Act 2 · Stack &amp; Spec"></section>
<section class="slide" id="slide-10" data-act="Act 2 · Stack &amp; Spec"></section>
<section class="slide" id="slide-11" data-act="Act 2 · Stack &amp; Spec"></section>
<section class="slide" id="slide-12" data-act="Act 3 · Agent Skills"></section>
<section class="slide" id="slide-13" data-act="Act 3 · Agent Skills"></section>
<section class="slide" id="slide-14" data-act="Act 3 · Agent Skills"></section>
<section class="slide" id="slide-15" data-act="Act 4 · MCP"></section>
<section class="slide" id="slide-16" data-act="Act 4 · MCP"></section>
<section class="slide" id="slide-17" data-act="Act 4 · MCP"></section>
<section class="slide" id="slide-18" data-act="Act 5 · Bandung Landslide"></section>
<section class="slide" id="slide-19" data-act="Act 5 · Bandung Landslide"></section>
<section class="slide" id="slide-20" data-act="Act 5 · Bandung Landslide"></section>
<section class="slide" id="slide-21" data-act="Act 5 · Bandung Landslide"></section>
<section class="slide" id="slide-22" data-act="Act 6 · Your Portfolio"></section>

</main>
<div id="chrome"><span id="actLabel"></span><span id="counter"></span></div>
<script>
(function () {
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var counter = document.getElementById('counter');
  var actLabel = document.getElementById('actLabel');
  var current = 0;
  function render() {
    slides.forEach(function (s, i) { s.classList.toggle('active', i === current); });
    counter.textContent = (current + 1) + ' / ' + slides.length;
    actLabel.textContent = slides[current].getAttribute('data-act') || '';
  }
  function goTo(n) {
    current = Math.max(0, Math.min(slides.length - 1, n));
    render();
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); goTo(current + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goTo(current - 1); }
    else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
    else if (e.key === 'End') { e.preventDefault(); goTo(slides.length - 1); }
  });
  render();
})();
</script>
</body>
</html>
```

- [ ] **Step 2: Create `tools/verify.js` verification harness**

Write `tools/verify.js` with exactly this content:

```js
var fs = require('fs');
var vm = require('vm');
var path = require('path');

var htmlPath = path.join(__dirname, '..', 'index.html');
var html = fs.readFileSync(htmlPath, 'utf8');

var checks = [
  { name: 'doctype', find: '<!DOCTYPE html>' },
  { name: '22 slide sections', find: 'class="slide"' },
  { name: 'slide-22 exists', find: 'id="slide-22"' },
  { name: 'chrome counter', find: 'id="counter"' },
  { name: 'chrome act label', find: 'id="actLabel"' },
  { name: 'keydown engine', find: "addEventListener('keydown'" }
];

var fail = 0;
function report(name, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
  if (!ok) fail = 1;
}

checks.forEach(function (c) {
  var ok = html.indexOf(c.find) !== -1;
  report(c.name, ok);
});

var pureMatch = html.match(/\/\/ PURE-START([\s\S]*?)\/\/ PURE-END/);
if (!pureMatch) {
  report('PURE-START/END markers present', false);
} else {
  report('PURE-START/END markers present', true);
  var sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(pureMatch[1], sandbox);
  var verdict = sandbox.PURE && sandbox.PURE.verdict;
  if (typeof verdict !== 'function') {
    report('PURE.verdict is a function', false);
  } else {
    report('PURE.verdict is a function', true);
    var heavyHigh = verdict({ rain: 'heavy', slope: 'high' });
    report('heavy+high => stay', heavyHigh && heavyHigh.key === 'stay');
    var heavyLow = verdict({ rain: 'heavy', slope: 'low' });
    report('heavy+low => detour', heavyLow && heavyLow.key === 'detour');
    var modHigh = verdict({ rain: 'moderate', slope: 'high' });
    report('moderate+high => detour', modHigh && modHigh.key === 'detour');
    var modLow = verdict({ rain: 'moderate', slope: 'low' });
    report('moderate+low => safe', modLow && modLow.key === 'safe');
  }
}

process.exit(fail);
```

- [ ] **Step 3: Run verification**

Run: `node tools/verify.js`
Expected: every line `PASS`, exit code 0. The PURE logic checks will PASS only after Task 8 — until then they will FAIL. **Important:** this Task intentionally finishes with PURE checks failing (the mini-app logic does not exist yet). Confirm the base checks (`doctype`, `22 slide sections`, `slide-22`, `counter`, `actLabel`, `keydown engine`, `PURE markers present`) all PASS. Do NOT attempt to make the pure-logic checks pass in this task.

- [ ] **Step 4: Manual browser check**

Open `index.html` in a browser (double-click). Expected: blank pages but chrome bar shows `1 / 22` and act label `ACT 1 · THE SHIFT`; arrow keys advance; `Home`/`End` jump.

- [ ] **Step 5: Commit**

```bash
git add index.html tools/verify.js
git commit -m "feat: slide engine shell + verification harness"
```

---

### Task 2: Act 1 — slides 1–3 (The Shift)

**Files:**
- Modify: `index.html` (fill `slide-1`, `slide-2`, `slide-3`)

**Interfaces:**
- Consumes: slide sections and CSS classes from Task 1 (`.tag`, `.lead`, `.cols`, `.card`, `.kicker`, `.tool`).
- Produces: complete content for slides 1–3; marker substrings `From Static to Interactive`, `An infographic tells a story. A prototype supports a decision.`, `small · evidence-based · usable · honest`.

- [ ] **Step 1: Fill slide 1 (cover)**

Replace `<section class="slide" id="slide-1" data-act="Act 1 · The Shift"></section>` with:

```html
<section class="slide" id="slide-1" data-act="Act 1 · The Shift">
  <p class="tag">U-INSPIRE 101 · Decode Risk. Ship Impact. · SESI-5</p>
  <h1>From Static to Interactive</h1>
  <p class="lead">Agent Skills · MCP · building your DRR portfolio with <span class="tool">freebuff</span> + <span class="tool">opencode</span></p>
  <p class="note">The session: understand the tools, then ship a working prototype — not just an AI-generated infographic.</p>
</section>
```

- [ ] **Step 2: Fill slide 2 (why interactive > infographic)**

Replace slide-2's empty tag with:

```html
<section class="slide" id="slide-2" data-act="Act 1 · The Shift">
  <p class="tag">01 · Why this matters</p>
  <h1>Why interactive <em>beats</em> infographic</h1>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">AI infographic</h3>
      <ul>
        <li>Explain — tells you something once</li>
        <li>Static — the same image every time</li>
        <li>One-way — you read, then it ends</li>
        <li>Read-once — shared, admired, forgotten</li>
      </ul>
    </div>
    <div class="card">
      <h3 class="kicker">Interactive app</h3>
      <ul>
        <li>Explore — the user chooses the inputs</li>
        <li>Decide — supports a real decision</li>
        <li>Act — gives one clear next action</li>
        <li>Reusable — deployed, linkable, testable</li>
      </ul>
    </div>
  </div>
  <h3>An infographic tells a story. A prototype supports a decision.</h3>
  <p class="note">A portfolio prototype should prove the thinking behind the product — not just the product itself.</p>
</section>
```

- [ ] **Step 3: Fill slide 3 (the target)**

Replace slide-3's empty tag with:

```html
<section class="slide" id="slide-3" data-act="Act 1 · The Shift">
  <p class="tag">02 · The target</p>
  <h1>The bar for your portfolio</h1>
  <p class="lead">Build something small, evidence-based, usable, and honest about its limitations.</p>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">Small</h3>
      <p>One location. One user group. One key journey.</p>
    </div>
    <div class="card">
      <h3 class="kicker">Evidence-based</h3>
      <p>Every source carries a trail — URL, date, method, limitation, license.</p>
    </div>
    <div class="card">
      <h3 class="kicker">Usable</h3>
      <p>Someone can try it and act on it — not just look at it.</p>
    </div>
    <div class="card">
      <h3 class="kicker">Honest</h3>
      <p>Clearly labeled as exploratory. Not an official warning system.</p>
    </div>
  </div>
  <h3>Deployed prototype, not a PDF.</h3>
  <p class="note">This session shows the tools to go from idea → deployed: <span class="tool">freebuff</span>, <span class="tool">opencode</span>, skills, MCP.</p>
</section>
```

- [ ] **Step 4: Run verification**

Run: `node tools/verify.js`
Expected: all base checks still PASS (pure-logic checks may still FAIL — expected until Task 8). Confirm these now also pass by inspecting the file: `From Static to Interactive`, `An infographic tells a story. A prototype supports a decision.`, `small, evidence-based, usable, and honest` present. (The harness does not check these exact strings; verify manually via grep or reading the file.)

- [ ] **Step 5: Manual browser check**

Open `index.html`. Expected: slide 1 cover renders; → arrow shows slide 2 with the two-column comparison; slide 3 shows the four "bar" cards.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: Act 1 slides (cover, why interactive, the target)"
```

---

### Task 3: Act 2 part 1 — slides 4–7 (the stack: GitHub, Turso, Cloudflare + Gravatar)

**Files:**
- Modify: `index.html` (fill `slide-4` … `slide-7`)

**Interfaces:**
- Consumes: Task 1 CSS classes.
- Produces: content for slides 4–7. Each service slide answers "why register" for this bootcamp. Marker substrings: `id="slide-7"` already present; new copy `GitHub — why register`, `Turso — why register`, `Cloudflare + Gravatar`.

- [ ] **Step 1: Fill slide 4 (stack overview)**

Replace slide-4's empty tag with:

```html
<section class="slide" id="slide-4" data-act="Act 2 · Stack &amp; Spec">
  <p class="tag">03 · Meet the stack</p>
  <h1>Your new stack</h1>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">Coding partners</h3>
      <p><span class="tool">freebuff</span> — your agent CLI for building and iterating.</p>
      <p><span class="tool">opencode</span> — your interactive agent workspace.</p>
      <p class="note">You bring the case and the evidence. They bring tools, workflow, and building.</p>
    </div>
    <div class="card">
      <h3 class="kicker">Shipping layer</h3>
      <p>App: Next.js + TypeScript + Tailwind (or your choice).</p>
      <p>Data: <span class="tool">Turso</span> — SQLite that runs at the edge.</p>
      <p>Deploy: <span class="tool">Cloudflare</span> / Vercel + a public URL.</p>
    </div>
  </div>
  <h3>Four services to register — each one has a job.</h3>
  <p class="lead">GitHub · Turso · Cloudflare · Gravatar</p>
</section>
```

- [ ] **Step 2: Fill slide 5 (GitHub — why register)**

Replace slide-5's empty tag with:

```html
<section class="slide" id="slide-5" data-act="Act 2 · Stack &amp; Spec">
  <p class="tag">04 · Stack / GitHub</p>
  <h1>GitHub — why register</h1>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">What it does</h3>
      <ul>
        <li>Source control — every pass tracked, auditable</li>
        <li>Identity — used by Vercel, Cloudflare, and <span class="tool">opencode</span> for auth</li>
        <li>Public profile — the first thing a reviewer sees</li>
      </ul>
    </div>
    <div class="card">
      <h3 class="kicker">Why it matters for THIS project</h3>
      <p>Your repository is the <strong>proof</strong>: the PRD, the data catalog, the build passes, the README case study.</p>
      <p class="note">Deliverable: a public repository with a case-study README.</p>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Fill slide 6 (Turso — why register)**

Replace slide-6's empty tag with:

```html
<section class="slide" id="slide-6" data-act="Act 2 · Stack &amp; Spec">
  <p class="tag">05 · Stack / Turso</p>
  <h1>Turso — why register</h1>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">What it does</h3>
      <ul>
        <li>SQLite-compatible database that runs at the edge</li>
        <li>No server to provision or pay for</li>
        <li>A connection string your app can read from anywhere</li>
      </ul>
    </div>
    <div class="card">
      <h3 class="kicker">Why it matters for THIS project</h3>
      <p>Your wards, rainfall, slope, and risk scores live here as <strong>schema + seed data</strong>.</p>
      <p>Your app reads real structured data — not hardcoded JS.</p>
      <p class="note">Deliverable: a database URL your deployed app connects to via MCP.</p>
    </div>
  </div>
</section>
```

- [ ] **Step 4: Fill slide 7 (Cloudflare + Gravatar — why register)**

Replace slide-7's empty tag with:

```html
<section class="slide" id="slide-7" data-act="Act 2 · Stack &amp; Spec">
  <p class="tag">06 · Stack / Cloudflare + Gravatar</p>
  <h1>Cloudflare + Gravatar — why register</h1>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">Cloudflare</h3>
      <ul>
        <li>DNS + fast global deploy of static and edge apps</li>
        <li>Alternative/companion to Vercel for the public URL</li>
        <li>Free tier covers a bootcamp portfolio</li>
      </ul>
    </div>
    <div class="card">
      <h3 class="kicker">Gravatar</h3>
      <ul>
        <li>Free avatar that follows your email</li>
        <li>Free subdomain: <span class="tool">yourname.gravatar.com</span></li>
        <li>Your portfolio URL — a live link, not a file</li>
      </ul>
    </div>
  </div>
  <p class="lead">A public URL is what turns a prototype into a portfolio.</p>
</section>
```

- [ ] **Step 5: Run verification**

Run: `node tools/verify.js`
Expected: base checks PASS; pure-logic checks may still FAIL (Task 8). Grep the file to confirm `GitHub — why register`, `Turso — why register`, `Cloudflare + Gravatar` all present.

- [ ] **Step 6: Manual browser check**

Open `index.html`, navigate to slides 4–7. Expected: overview slide with four service names; each service slide has two cards (what it does / why it matters).

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: Act 2 stack slides (GitHub, Turso, Cloudflare + Gravatar)"
```

---

### Task 4: Act 2 part 2 — slides 8–11 (PRD, passes, the prompt)

**Files:**
- Modify: `index.html` (fill `slide-8` … `slide-11`)

**Interfaces:**
- Consumes: Task 1 CSS (`.badge`, `pre.code`, `#deck`).
- Produces: slides 8–11 including the PRD anatomy card (tech stack, DB schema, API, UI/UX flow, user, purpose, pages, constraints, seed data, expected states, non-goals), the four build passes, and a copyable prompt block. Markers: `Why a PRD before code`, `Anatomy of a PRD`, `Pass 01`, and copy button element `class="copy"`.

- [ ] **Step 1: Fill slide 8 (why a PRD before code)**

Replace slide-8's empty tag with:

```html
<section class="slide" id="slide-8" data-act="Act 2 · Stack &amp; Spec">
  <p class="tag">07 · Spec before code</p>
  <h1>Why a PRD before code?</h1>
  <p class="lead">Discipline before code — a PRD is the <strong>contract</strong> between you and your coding agent.</p>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">Shared understanding</h3>
      <p>Both you and the agent agree on who the user is and what decision the app supports.</p>
    </div>
    <div class="card">
      <h3 class="kicker">Scope control</h3>
      <p>Non-goals are as important as goals — the agent won't invent features you never asked for.</p>
    </div>
    <div class="card">
      <h3 class="kicker">Measurable completion</h3>
      <p>"Done" means the spec's expected states are met — not "the screen looks nice."</p>
    </div>
    <div class="card">
      <h3 class="kicker">Without it</h3>
      <p>The agent guesses, scope creeps, and the output is hard to audit.</p>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Fill slide 9 (anatomy of a PRD)**

Replace slide-9's empty tag with:

```html
<section class="slide" id="slide-9" data-act="Act 2 · Stack &amp; Spec">
  <p class="tag">08 · Spec before code</p>
  <h1>Anatomy of a PRD</h1>
  <p class="lead">One document covering everything — from stack to pixels.</p>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">Purpose</h3>
      <ul>
        <li><strong>User</strong> — who has the problem</li>
        <li><strong>Purpose</strong> — which decision it supports</li>
        <li><strong>Pages / flow</strong> — one core journey</li>
      </ul>
      <h3 class="kicker">Product</h3>
      <ul>
        <li><strong>Tech stack</strong> — framework, language, styling</li>
        <li><strong>Database design</strong> — tables, schema, seed data</li>
        <li><strong>API</strong> — endpoints / data access the app needs</li>
        <li><strong>UI/UX flow</strong> — screens and the interaction between them</li>
      </ul>
    </div>
    <div class="card">
      <h3 class="kicker">Guardrails</h3>
      <ul>
        <li><strong>Constraints</strong> — stack rules, language, disclaimer</li>
        <li><strong>Expected states</strong> — normal, empty, error</li>
        <li><strong>Non-goals</strong> — what this version will NOT do</li>
      </ul>
      <p class="note">A PRD is a small file, not a novel — but it must be explicit.</p>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Fill slide 10 (break it into small passes)**

Replace slide-10's empty tag with:

```html
<section class="slide" id="slide-10" data-act="Act 2 · Stack &amp; Spec">
  <p class="tag">09 · Spec before code</p>
  <h1>Break it into small passes</h1>
  <p class="lead">Each pass is demonstrable, has a small failure surface, and is easy to audit.</p>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">Pass 01 · Foundation</h3>
      <p>App shell, navigation, schema, seed data, visible disclaimer.</p>
    </div>
    <div class="card">
      <h3 class="kicker">Pass 02 · Core journey</h3>
      <p>One dashboard/map flow, one interaction, one action.</p>
    </div>
    <div class="card">
      <h3 class="kicker">Pass 03 · Quality</h3>
      <p>Mobile layout, validation, error states, accessibility, attribution.</p>
    </div>
    <div class="card">
      <h3 class="kicker">Pass 04 · Portfolio polish</h3>
      <p>Methodology, screenshots, demo reset, clean explanation.</p>
    </div>
  </div>
  <h3>Never start the next pass until the current one is verified.</h3>
</section>
```

- [ ] **Step 4: Fill slide 11 (the prompt, copyable)**

Replace slide-11's empty tag with:

```html
<section class="slide" id="slide-11" data-act="Act 2 · Stack &amp; Spec">
  <p class="tag">10 · Spec before code</p>
  <h1>The prompt</h1>
  <p class="lead">Spec, not a vague wish. One pass at a time — then verify.</p>
  <pre class="code"><button class="copy" onclick="copyPrompt(this)">Copy</button>You are building a Next.js app for a DRR portfolio.

User: Parents deciding a school route after heavy rain.
Purpose: Show whether the route is safe, a detour, or stay-home.
Pages: One route-check page (ward selector + verdict).
Data model: wards(id, name, rainfall, slope, note).
API: read wards; compute verdict server-side.
Tech stack: Next.js, TypeScript, Tailwind, Turso.
Language: English.
Seed data: 5 Bandung wards with sample profiles.
Expected states: ward selected -> verdict shown; no ward -> prompt.
Non-goals: no real warnings, no auth, no admin.

Build Pass 01 only, then stop and report.</pre>
  <p class="note">Build one pass · verify it · then continue. Prompt with a spec, not a wish.</p>
</section>
```

- [ ] **Step 5: Add the `copyPrompt` helper**

Before the slide engine `<script>` block, add a small helper script (append right after `</main>`):

```html
<script>
function copyPrompt(btn) {
  var pre = btn.closest('pre');
  var text = pre.innerText.replace('Copy', '').trim();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
    });
  } else {
    var ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    btn.textContent = 'Copied!';
    setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
  }
}
</script>
```

- [ ] **Step 6: Run verification**

Run: `node tools/verify.js`
Expected: base checks PASS. Grep to confirm `Why a PRD before code`, `Anatomy of a PRD`, `Pass 01`, and `class="copy"` present.

- [ ] **Step 7: Manual browser check**

Navigate to slide 11. Click **Copy**. Expected: button changes to "Copied!"; pasting elsewhere yields the full prompt text without the word "Copy".

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: Act 2 spec slides (PRD, passes, prompt with copy)"
```

---

### Task 5: Act 3 — slides 12–14 (Agent Skills)

**Files:**
- Modify: `index.html` (fill `slide-12` … `slide-14`)

**Interfaces:**
- Consumes: Task 1 CSS.
- Produces: slides 12–14; markers `What is a Skill`, `Anatomy of a skill`, `Skills for DRR`.

- [ ] **Step 1: Fill slide 12 (what is a Skill)**

Replace slide-12's empty tag with:

```html
<section class="slide" id="slide-12" data-act="Act 3 · Agent Skills">
  <p class="tag">11 · Agent Skills</p>
  <h1>What is a Skill?</h1>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">Definition</h3>
      <p>A skill is a <strong>packaged workflow + knowledge</strong> that an agent loads on demand.</p>
      <ul>
        <li>Not a plugin — no code injected into every run</li>
        <li>Not hardcoded behavior — it is loaded when the task matches</li>
      </ul>
    </div>
    <div class="card">
      <h3 class="kicker">Analogy</h3>
      <p>A <strong>recipe card</strong>. You don't read every card in the box — you pull the one whose title matches the dish you're cooking.</p>
      <p class="note">The agent follows the recipe, applies its tools, and produces the dish.</p>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Fill slide 13 (anatomy of a skill)**

Replace slide-13's empty tag with:

```html
<section class="slide" id="slide-13" data-act="Act 3 · Agent Skills">
  <p class="tag">12 · Agent Skills</p>
  <h1>Anatomy of a skill</h1>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">What's inside</h3>
      <ul>
        <li><strong>SKILL.md</strong> — the instructions: what the skill is for, the workflow to follow</li>
        <li><strong>Optional scripts / resources</strong> — helpers the workflow can call</li>
      </ul>
    </div>
    <div class="card">
      <h3 class="kicker">How it activates</h3>
      <ul>
        <li>Triggered by <strong>context</strong> — the task matches the skill's description</li>
        <li>The agent reads the instructions, then follows the workflow</li>
        <li>Skills are versioned — they evolve, so read the current version</li>
      </ul>
    </div>
  </div>
  <p class="lead">Skill = <em>how to do a class of work well</em>.</p>
</section>
```

- [ ] **Step 3: Fill slide 14 (skills for DRR)**

Replace slide-14's empty tag with:

```html
<section class="slide" id="slide-14" data-act="Act 3 · Agent Skills">
  <p class="tag">13 · Agent Skills</p>
  <h1>Skills for DRR work</h1>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">Research &amp; evidence</h3>
      <ul>
        <li><span class="tool">quick-research</span> — structured evidence summaries</li>
        <li><span class="tool">websearch</span> / <span class="tool">open-link</span> — context and source reading</li>
        <li><span class="tool">a-stock-analysis</span>, market, data skills — pattern hunting</li>
      </ul>
    </div>
    <div class="card">
      <h3 class="kicker">Build &amp; visuals</h3>
      <ul>
        <li><span class="tool">frontend-design</span> — polished interactive UI</li>
        <li><span class="tool">mobile-app-ui-design</span> — mobile-first screens</li>
        <li><span class="tool">generate-image</span> / <span class="tool">search-image</span> — assets and maps</li>
      </ul>
    </div>
  </div>
  <p class="lead">Pick skills per stage: research the case, design the UI, then build.</p>
</section>
```

- [ ] **Step 4: Run verification**

Run: `node tools/verify.js`; base checks PASS. Grep for `What is a Skill`, `Anatomy of a skill`, `Skills for DRR`.

- [ ] **Step 5: Manual browser check**

Navigate slides 12–14. Expected: definition + analogy cards; anatomy + activation; two-column skill table.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: Act 3 Agent Skills slides"
```

---

### Task 6: Act 4 — slides 15–17 (MCP)

**Files:**
- Modify: `index.html` (fill `slide-15` … `slide-17`)

**Interfaces:**
- Consumes: Task 1 CSS.
- Produces: slides 15–17; markers `What is MCP`, `MCP in your project`, `Skill vs MCP`.

- [ ] **Step 1: Fill slide 15 (what is MCP)**

Replace slide-15's empty tag with:

```html
<section class="slide" id="slide-15" data-act="Act 4 · MCP">
  <p class="tag">14 · MCP</p>
  <h1>What is MCP?</h1>
  <p class="lead">Model Context Protocol — an <strong>open standard</strong> for agents to connect to external tools and data.</p>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">The idea</h3>
      <ul>
        <li>One protocol, many integrations</li>
        <li>MCP <strong>servers</strong> expose tools and data to the agent</li>
        <li>The agent calls them like built-in tools</li>
      </ul>
    </div>
    <div class="card">
      <h3 class="kicker">Mental model</h3>
      <ul>
        <li><strong>Skill</strong> = how to think / do (a procedure)</li>
        <li><strong>MCP</strong> = what to reach / read (a live connection)</li>
      </ul>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Fill slide 16 (MCP in your project)**

Replace slide-16's empty tag with:

```html
<section class="slide" id="slide-16" data-act="Act 4 · MCP">
  <p class="tag">15 · MCP</p>
  <h1>MCP in your project</h1>
  <p class="lead">Live connections the agent uses while it builds — not one-off files.</p>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">Agent ↔ services</h3>
      <ul>
        <li><span class="tool">Turso</span> — read/write ward &amp; rainfall data</li>
        <li><span class="tool">GitHub</span> — create the repo, push passes</li>
        <li><span class="tool">Cloudflare</span> / Vercel — deploy the app</li>
        <li>Data APIs — pull evidence into the schema</li>
      </ul>
    </div>
    <div class="card">
      <h3 class="kicker">Why it changes the build</h3>
      <p>While writing code, the agent can <strong>read live data</strong> from your Turso database through MCP — schema, seed rows, sample queries.</p>
      <p class="note">Your app ships connected to real data, not stubbed constants.</p>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Fill slide 17 (skill vs MCP)**

Replace slide-17's empty tag with:

```html
<section class="slide" id="slide-17" data-act="Act 4 · MCP">
  <p class="tag">16 · MCP</p>
  <h1>Skill vs MCP</h1>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">Skill</h3>
      <ul>
        <li>Static packaged procedure</li>
        <li>Activated by <strong>topic</strong></li>
        <li>"How to think / do"</li>
        <li>Example: frontend-design</li>
      </ul>
    </div>
    <div class="card">
      <h3 class="kicker">MCP</h3>
      <ul>
        <li>Live connection to a tool/server</li>
        <li>Activated by <strong>tool call</strong></li>
        <li>"What to reach / read"</li>
        <li>Example: Turso database</li>
      </ul>
    </div>
  </div>
  <h3>They work together.</h3>
  <p class="lead">A skill defines the workflow; MCP gives it live data.</p>
</section>
```

- [ ] **Step 4: Run verification**

Run: `node tools/verify.js`; base checks PASS. Grep for `What is MCP`, `MCP in your project`, `Skill vs MCP`.

- [ ] **Step 5: Manual browser check**

Navigate slides 15–17. Expected: definition, live-connections, and comparison table render correctly.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: Act 4 MCP slides"
```

---

### Task 7: Act 5 part 1 — slides 18–19 (bounded case + evidence)

**Files:**
- Modify: `index.html` (fill `slide-18`, `slide-19`)

**Interfaces:**
- Consumes: Task 1 CSS (`.badge.amber`, `.card`, `.kicker`).
- Produces: slides 18–19; markers `The case, bounded`, `The evidence`.

- [ ] **Step 1: Fill slide 18 (the case, bounded)**

Replace slide-18's empty tag with:

```html
<section class="slide" id="slide-18" data-act="Act 5 · Bandung Landslide">
  <p class="tag">17 · From spec to deployed</p>
  <h1>The case, bounded</h1>
  <p class="lead">Parents in a Bandung school-route area struggle to decide whether it is safe to walk after heavy rain, because landslide-risk information is fragmented.</p>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">One location</h3>
      <p>Five pilot wards in Bandung (Cidadap, Coblong, Bandung Wetan, Sukajadi, Cibeunying Kaler).</p>
    </div>
    <div class="card">
      <h3 class="kicker">One user group</h3>
      <p>Parents and school staff deciding the route to school.</p>
    </div>
    <div class="card">
      <h3 class="kicker">One journey</h3>
      <p>Check today's route risk → get one action (walk / detour / stay home).</p>
    </div>
    <div class="card">
      <h3 class="kicker">Why it fits</h3>
      <p>Specific enough to research; small enough to prototype in 1–2 weeks.</p>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Fill slide 19 (the evidence)**

Replace slide-19's empty tag with:

```html
<section class="slide" id="slide-19" data-act="Act 5 · Bandung Landslide">
  <p class="tag">18 · From spec to deployed</p>
  <h1>The evidence</h1>
  <p class="lead">Every source carries a trail — source, period, use, limitation.</p>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">Rainfall</h3>
      <p><span class="tool">BMKG</span> / Open-Meteo — historical + forecast.</p>
      <p class="note">Use: today's risk. Limitation: point forecasts, not street-level.</p>
    </div>
    <div class="card">
      <h3 class="kicker">Slope &amp; elevation</h3>
      <p>Open elevation (DEM). Use: route slope risk.</p>
      <p class="note">Limitation: regional resolution.</p>
    </div>
    <div class="card">
      <h3 class="kicker">Land cover</h3>
      <p>Open land-cover data. Use: which areas slide-prone.</p>
      <p class="note">Limitation: periodic, not real-time.</p>
    </div>
    <div class="card">
      <h3 class="kicker">Incident records</h3>
      <p>Reported events / news timeline. Use: recurring locations.</p>
      <p class="note">Limitation: contextual and exploratory — not official data.</p>
    </div>
  </div>
  <p class="note">Official data = factual foundation. Crawled data = context only.</p>
</section>
```

- [ ] **Step 3: Run verification**

Run: `node tools/verify.js`; base checks PASS. Grep for `The case, bounded`, `The evidence`.

- [ ] **Step 4: Manual browser check**

Navigate slides 18–19. Expected: bounded-case cards; four evidence source cards each with a limitation line.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: Act 5 case + evidence slides"
```

---

### Task 8: Act 5 part 2 — slide 20 (interactive mini-app "Bandung Route Check")

**Files:**
- Modify: `index.html` (fill `slide-20`; append PURE block + app CSS + app JS)

**Interfaces:**
- Consumes: Task 1 CSS tokens; PURE markers tested by `tools/verify.js`.
- Produces: `slide-20` containing an `.app-card`, a ward `<select id="wardSelect">`, verdict output `<div id="verdict">`, a persistent disclaimer, plus the pure function `PURE.verdict(profile)` (must be enclosed between exactly `// PURE-START` and `// PURE-END`) and `PURE.WARDS` (same 5 ward ids as Global Constraints). The harness unit-tests `PURE.verdict` in Node.

- [ ] **Step 1: Add mini-app CSS**

Append to the `<style>` block (before the closing `</style>`) this CSS:

```css
.app-card{border:2px solid var(--ink);border-radius:14px;padding:24px;background:#fff;max-width:560px}
.app-card label{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:8px}
#wardSelect{width:100%;font-size:17px;font-family:var(--sans);padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:#fff}
#verdict{margin-top:20px;padding:16px 18px;border-radius:10px;color:#fff;min-height:74px}
#verdict .big{font-family:var(--serif);font-size:26px;margin-bottom:6px}
#verdict .sub{font-size:15px;opacity:.92}
#verdict.pending{background:var(--muted)}
#verdict.safe{background:var(--safe)}
#verdict.detour{background:var(--accent)}
#verdict.stay{background:var(--danger)}
.disclaimer{margin-top:18px;border-left:4px solid var(--accent);padding:10px 14px;background:#FFFBEB;font-size:13px;color:#92400E}
.risk-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}
.risk-cell{border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-size:14px}
.risk-cell b{display:block;font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
</style>
```

- [ ] **Step 2: Fill slide 20 (the live demo)**

Replace slide-20's empty tag with:

```html
<section class="slide" id="slide-20" data-act="Act 5 · Bandung Landslide">
  <p class="tag">19 · From spec to deployed</p>
  <h1>Live: Bandung Route Check</h1>
  <p class="lead">The same story — now a decision, not a picture.</p>
  <div class="cols">
    <div class="app-card">
      <label for="wardSelect">Choose a school-route ward</label>
      <select id="wardSelect" aria-label="Select ward"></select>
      <div class="risk-grid">
        <div class="risk-cell"><b>Rainfall today</b><span id="rainVal">—</span></div>
        <div class="risk-cell"><b>Slope risk</b><span id="slopeVal">—</span></div>
      </div>
      <div id="verdict" class="pending"><span class="big">Select a ward</span><span class="sub">Sample data · exploratory</span></div>
      <div class="disclaimer">This prototype is an exploratory portfolio project. It is not an official emergency-warning system and does not replace information from authorized agencies.</div>
    </div>
    <div>
      <div class="card">
        <h3 class="kicker">What you're seeing</h3>
        <ul>
          <li>Skill used: <span class="tool">frontend-design</span> — the interface</li>
          <li>MCP connection: <span class="tool">Turso</span> — the ward data lives in a database</li>
          <li>Sample data, clearly labeled — honest about limits</li>
        </ul>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Add the PURE block and app logic script**

Append this `<script>` block just before the existing slide-engine `<script>` (i.e., directly after the mini-app CSS change, at end of body, before `</body>` — place it right after `</main>` alongside `copyPrompt`):

```html
<script>
// PURE-START
var PURE = {};
PURE.WARDS = [
  { id: 'cidadap', name: 'Cidadap', rain: 'heavy', slope: 'high',
    safeNote: 'Route is clear today.', detourNote: 'Use the main road — avoid the hill path.',
    stayNote: 'High rain on steep ground. Stay home today.' },
  { id: 'coblong', name: 'Coblong', rain: 'moderate', slope: 'high',
    safeNote: 'Route is clear today.', detourNote: 'Take the flat route along the canal.',
    stayNote: 'Steep slopes are unstable. Avoid travel.' },
  { id: 'bandung-wetan', name: 'Bandung Wetan', rain: 'moderate', slope: 'low',
    safeNote: 'Low rain and flat terrain. Safe to walk.',
    detourNote: 'Minor risk — use the primary road.',
    stayNote: 'Unusual conditions — stay home today.' },
  { id: 'sukajadi', name: 'Sukajadi', rain: 'heavy', slope: 'low',
    safeNote: 'Flat terrain — walking is fine.',
    detourNote: 'Heavy rain on low risk — take the covered route.',
    stayNote: 'Heavy rain — avoid exposed roads.' },
  { id: 'cibeunying-kaler', name: 'Cibeunying Kaler', rain: 'moderate', slope: 'moderate',
    safeNote: 'Route is clear today.', detourNote: 'Use the southern road — safer gradient.',
    stayNote: 'Conditions worsening — stay home today.' }
];
PURE.verdict = function (p) {
  var rainHeavy = p.rain === 'heavy';
  var slopeHigh = p.slope === 'high';
  if (rainHeavy && slopeHigh) {
    return { key: 'stay', label: 'Stay home', note: p.stayNote };
  }
  if (rainHeavy || slopeHigh) {
    return { key: 'detour', label: 'Take a detour', note: p.detourNote };
  }
  return { key: 'safe', label: 'Safe to walk', note: p.safeNote };
};
// PURE-END
(function () {
  var select = document.getElementById('wardSelect');
  var rainVal = document.getElementById('rainVal');
  var slopeVal = document.getElementById('slopeVal');
  var verdict = document.getElementById('verdict');
  function renderVerdict(id) {
    if (!id) {
      verdict.className = 'pending';
      verdict.innerHTML = '<span class="big">Select a ward</span><span class="sub">Sample data · exploratory</span>';
      rainVal.textContent = '—'; slopeVal.textContent = '—';
      return;
    }
    var ward = null;
    for (var i = 0; i < PURE.WARDS.length; i++) {
      if (PURE.WARDS[i].id === id) { ward = PURE.WARDS[i]; break; }
    }
    if (!ward) return;
    rainVal.textContent = ward.rain.charAt(0).toUpperCase() + ward.rain.slice(1);
    slopeVal.textContent = ward.slope.charAt(0).toUpperCase() + ward.slope.slice(1);
    var v = PURE.verdict(ward);
    verdict.className = v.key;
    verdict.innerHTML = '<span class="big">' + v.label + '</span><span class="sub">' + v.note + '</span>';
  }
  PURE.WARDS.forEach(function (w) {
    var opt = document.createElement('option');
    opt.value = w.id; opt.textContent = w.name;
    select.appendChild(opt);
  });
  select.addEventListener('change', function () { renderVerdict(select.value); });
})();
</script>
```

- [ ] **Step 4: Run verification**

Run: `node tools/verify.js`
Expected: ALL lines PASS, including:
- `heavy+high => stay` PASS
- `heavy+low => detour` PASS
- `moderate+high => detour` PASS
- `moderate+low => safe` PASS
Exit code 0.

- [ ] **Step 5: Manual browser check**

Open `index.html`, go to slide 20. Expected:
- Ward dropdown lists all 5 wards.
- Selecting Cidadap → red "Stay home". Coblong → amber "Take a detour". Bandung Wetan → green "Safe to walk". Sukajadi → amber "Take a detour". Cibeunying Kaler → green "Safe to walk".
- Disclaimer banner always visible.
- Resize narrow → app card stacks full-width.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: interactive Bandung Route Check mini-app with verdict logic"
```

---

### Task 9: Act 5 part 3 + Act 6 — slides 21–22 (deploy & prove, checklist)

**Files:**
- Modify: `index.html` (fill `slide-21`, `slide-22`)

**Interfaces:**
- Consumes: Task 1 CSS (`.badge.green`, `.badge.amber`, `.badge.red`).
- Produces: slides 21–22; markers `Deploy & prove`, `Checklist`.

- [ ] **Step 1: Fill slide 21 (deploy & prove)**

Replace slide-21's empty tag with:

```html
<section class="slide" id="slide-21" data-act="Act 5 · Bandung Landslide">
  <p class="tag">20 · From spec to deployed</p>
  <h1>Deploy &amp; prove</h1>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">Ship checklist</h3>
      <ul>
        <li><span class="badge green">✔</span> Repo — GitHub, public, with README</li>
        <li><span class="badge green">✔</span> Database — Turso, schema + seed</li>
        <li><span class="badge green">✔</span> URL — Gravatar subdomain / Cloudflare</li>
      </ul>
      <p class="note">Example: <span class="tool">npx vercel --prod</span> or a Cloudflare Pages deploy.</p>
    </div>
    <div class="card">
      <h3 class="kicker">Test it</h3>
      <p>"You expect heavy rain today. Use this prototype to decide what to do."</p>
      <p>Test with 3–5 people like the target user. Watch, learn, make <strong>one</strong> focused iteration.</p>
    </div>
  </div>
  <h3>Be honest about limits.</h3>
  <p class="note"><span class="badge green">Can claim</span> demonstrates the flow, data trail, and decision support · <span class="badge red">Cannot claim</span> official early-warning authority.</p>
</section>
```

- [ ] **Step 2: Fill slide 22 (checklist + CTA)**

Replace slide-22's empty tag with:

```html
<section class="slide" id="slide-22" data-act="Act 6 · Your Portfolio">
  <p class="tag">21 · Your portfolio</p>
  <h1>By the end, each participant has</h1>
  <div class="cols">
    <div class="card">
      <h3 class="kicker">Your six deliverables</h3>
      <ul>
        <li>01 · A bounded local case</li>
        <li>02 · A documented data catalog</li>
        <li>03 · A problem statement + PRD</li>
        <li>04 · A deployed prototype URL</li>
        <li>05 · A GitHub repository</li>
        <li>06 · A portfolio-ready case study</li>
      </ul>
    </div>
    <div class="card">
      <h3 class="kicker">Next steps</h3>
      <ul>
        <li>Stuck or an install error? Ask in the group chat.</li>
        <li>Pick your own case and write the PRD this week.</li>
        <li>Run Pass 01 with <span class="tool">freebuff</span> or <span class="tool">opencode</span>.</li>
      </ul>
    </div>
  </div>
  <p class="lead">Decode Risk. Ship Impact.</p>
</section>
```

- [ ] **Step 3: Run verification**

Run: `node tools/verify.js`
Expected: ALL PASS, exit 0.

- [ ] **Step 4: Full deck manual walkthrough**

Open `index.html`. Walk all 22 slides in order. For each: title renders, no overflow at 1280×720, act label updates, counter matches position. Test the mini-app verdicts on slide 20 (see Task 8 Step 5). Test Copy button on slide 11.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: deploy + checklist slides, full deck complete"
```

---

### Task 10: Final quality pass — a11y, reduced motion, cross-check spec

**Files:**
- Modify: `index.html` (final review + any fixes)
- Modify: `tools/verify.js` (add final content checks)

**Interfaces:**
- Consumes: the completed deck.
- Produces: a deck that satisfies every Global Constraint; an expanded verification harness covering all slide titles.

- [ ] **Step 1: Expand verification harness with slide title checks**

Append to the `checks` array in `tools/verify.js` (before `checks.forEach`):

```js
var slideTitles = [
  'From Static to Interactive',
  'Why interactive <em>beats</em> infographic',
  'The bar for your portfolio',
  'Your new stack',
  'GitHub — why register',
  'Turso — why register',
  'Cloudflare + Gravatar — why register',
  'Why a PRD before code?',
  'Anatomy of a PRD',
  'Break it into small passes',
  'The prompt',
  'What is a Skill?',
  'Anatomy of a skill',
  'Skills for DRR work',
  'What is MCP?',
  'MCP in your project',
  'Skill vs MCP',
  'The case, bounded',
  'The evidence',
  'Live: Bandung Route Check',
  'Deploy &amp; prove',
  'By the end, each participant has'
];
slideTitles.forEach(function (t, i) {
  var block = html.split('id="slide-' + (i + 1) + '"')[1].split('<section class="slide"')[0];
  checks.push({ name: 'slide ' + (i + 1) + ' title', find: t, block: block });
});
```

Then update the check runner to search the slide block when `block` is present:

```js
checks.forEach(function (c) {
  var haystack = c.block !== undefined ? c.block : html;
  var ok = haystack.indexOf(c.find) !== -1;
  report(c.name, ok);
});
```

- [ ] **Step 2: Run verification**

Run: `node tools/verify.js`
Expected: ALL PASS including `slide N title` for slides 1–22 and all four verdict unit tests. Exit 0. Fix any missing/mismatched title (note: slide titles must match exactly the `h1` text, including `&amp;`/`<em>` HTML entities as written).

- [ ] **Step 3: Audit against Global Constraints**

Read `index.html` and confirm:
1. Language: all copy English.
2. Offline: no `http`/`https` references in the file (grep: `grep -n "http" index.html` must return nothing).
3. Accessibility: `:focus-visible` rule present; `aria-label` on `#wardSelect`; semantic `<h1>` per slide; `lang="en"` on `<html>`.
4. Reduced motion: `@media (prefers-reduced-motion: reduce)` block present.
5. Disclaimer text present verbatim on slide 20.

- [ ] **Step 4: Final manual review**

Open the deck; verify at 1280×720 and at narrow width (responsive single column). Confirm all 6 acts' labels appear as you navigate. Confirm keyboard nav, Copy button, and mini-app all still work.

- [ ] **Step 5: Commit**

```bash
git add index.html tools/verify.js
git commit -m "chore: final quality pass, expanded verification"
```
