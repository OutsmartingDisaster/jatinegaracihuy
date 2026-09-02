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
  { name: 'slide count = 13', find: 'slide' },
  { name: 'progress bar', find: 'id="progress"' },
  { name: 'nav dots', find: 'id="dots"' },
  { name: 'slide index', find: 'id="idx"' },
  { name: 'scroll-snap base', find: 'scroll-snap-type' },
  { name: 'controller class', find: 'IntersectionObserver' }
];

checks.forEach(function (c) {
  var ok = html.indexOf(c.find) !== -1;
  report(c.name, ok);
});

report('slides array length is 13', slides.length === 13);

var titles = [
  'From static',                                        // 1 cover
  'A familiar feeling when you open InaRISK.',          // 2 itch
  'Interactive beats infographic.',                     // 3 why
  'Kampung Melayu, Jatinegara',                         // 4 case
  'The data you',                                       // 5 wall
  'Coding partners + 4 accounts.',                      // 6 stack
  'Write the PRD first.',                               // 7 prd
  'Break it down. Ship it demonstrable.',               // 8 passes
  'The prompt that ships.',                             // 9 prompt
  'What is a',                                          // 10 skill
  'What is',                                            // 11 mcp
  'route through history',                              // 12 prototype
  'Deploy. Test. Prove.'                                // 13 proof
];

titles.forEach(function (t, i) {
  var block = slides[i] || '';
  report('slide ' + (i + 1) + ' title', block.indexOf(t) !== -1);
});

var appEls = ['id="evSelect"', 'id="evVerdict"', 'id="evHist"', 'disclaimer'];
appEls.forEach(function (el) {
  report('mini-app has ' + el, html.indexOf(el) !== -1);
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
