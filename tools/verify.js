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