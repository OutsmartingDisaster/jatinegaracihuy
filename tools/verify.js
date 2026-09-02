var fs = require('fs');
var vm = require('vm');
var path = require('path');

var htmlPath = path.join(__dirname, '..', 'index.html');
var html = fs.readFileSync(htmlPath, 'utf8');

var fail = 0;
function report(name, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
  if (!ok) fail = 1;
}

function extractSlides(h) {
  var re = /<section class="slide[^"]*"[^>]*>[\s\S]*?<\/section>/g;
  var out = [];
  var m;
  while ((m = re.exec(h)) !== null) out.push(m[0]);
  return out;
}

var slides = extractSlides(html);

var checks = [
  { name: 'doctype', find: '<!DOCTYPE html>' },
  { name: 'slide count = 24', find: 'slide' },
  { name: 'progress bar', find: 'id="progress"' },
  { name: 'nav dots', find: 'id="dots"' },
  { name: 'slide index', find: 'id="idx"' },
  { name: 'stage wrapper', find: 'class="stage"' },
  { name: 'scale-to-fit controller', find: 'function fit()' },
  { name: 'active-class controller', find: 'classList.toggle(\'active\'' }
];

checks.forEach(function (c) {
  var ok = html.indexOf(c.find) !== -1;
  report(c.name, ok);
});

report('slides array length is 24', slides.length === 24);

var titles = [
  'From static',                                    // 1 cover
  'A familiar feeling when you open InaRISK.',      // 2 itch
  'Interactive beats infographic.',                 // 3 why
  'Kampung Melayu, Jatinegara',                     // 4 case
  'The data you',                                   // 5 wall
  "Today's session",                                // 6 flow
  'What you ship today.',                           // 7 outcome
  'Before you start.',                              // 8 prereq
  'Accounts — checklist.',                          // 9 accounts
  'Write the PRD first.',                           // 10 prd
  'freebuff',                                       // 11 freebuff
  'opencode',                                       // 12 opencode
  'Passes, with acceptance criteria.',              // 13 passes
  'Turso',                                          // 14 turso
  'Deploy — pick your path.',                       // 15 deploy
  'Errors &amp; agent etiquette.',                  // 16 errors
  'What is a',                                      // 17 skill
  'What is',                                        // 18 mcp
  'Skills in practice',                             // 19 skills in practice
  'MCP in practice',                                // 20 mcp in practice
  'Jatinegara workflow',                            // 21 skill + mcp workflow
  'route through history',                          // 22 prototype
  'Definition of done.',                            // 23 done
  "Now it's your turn."                             // 24 your turn
];

titles.forEach(function (t, i) {
  var block = slides[i] || '';
  report('slide ' + (i + 1) + ' title', block.indexOf(t) !== -1);
});

var appEls = ['id="evSelect"', 'id="evVerdict"', 'id="evHist"', 'disclaimer'];
appEls.forEach(function (el) {
  report('mini-app has ' + el, html.indexOf(el) !== -1);
});

var opEls = ['TURSO_DATABASE_URL', 'CREATE TABLE events', 'id="evSelect"'];
opEls.forEach(function (el) {
  report('operational slide has ' + el, html.indexOf(el) !== -1);
});

var pureMatch = html.match(/\/\/ PURE-START([\s\S]*?)\/\/ PURE-END/);
if (!pureMatch) {
  report('PURE-START/END markers present', false);
} else {
  report('PURE-START/END markers present', true);
  var sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(pureMatch[1], sandbox);
  var P = sandbox.PURE;
  report('PURE.EVENTS has 5 events', Array.isArray(P && P.EVENTS) && P.EVENTS.length === 5);
  report('PURE.classify is a function', typeof (P && P.classify) === 'function');
  if (P && typeof P.classify === 'function') {
    report('tma 950 => bahaya', P.classify(950, 'extreme').key === 'bahaya');
    report('tma 880 + heavy => bahaya', P.classify(880, 'heavy').key === 'bahaya');
    report('tma 760 => siaga', P.classify(760, 'moderate').key === 'siaga');
    report('tma 700 => siaga', P.classify(700, 'moderate').key === 'siaga');
    report('tma 600 => waspada', P.classify(600, 'moderate').key === 'waspada');
    report('tma 470 => aman', P.classify(470, 'moderate').key === 'aman');
    report('tma 300 + extreme escalates to waspada', P.classify(300, 'extreme').key === 'waspada');
    report('tma 600 + extreme escalates to siaga', P.classify(600, 'extreme').key === 'siaga');
  }
}

process.exit(fail);
