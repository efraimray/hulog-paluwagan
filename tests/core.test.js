// Run with: node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../js/hulog-core.js');

function group(overrides) {
  const g = Object.assign({
    id: 'g1', name: 'Test', amount: 100000, frequency: 'semimonthly', startDate: '2026-01-10',
    sundayRule: 'none', fee: { type: 'none', value: 0 },
    members: [{ id: 'a', name: 'Ana', hands: 1 }, { id: 'b', name: 'Ben', hands: 2 }, { id: 'c', name: 'Cora', hands: 1 }],
    order: [], paid: {}
  }, overrides || {});
  g.order = H.normalizeOrder(g);
  return g;
}

test('semi-monthly dates land on the 15th and the last day (leap year Feb)', () => {
  assert.deepEqual(H.payoutDates('2028-01-20', 'semimonthly', 4, 'none'), ['2028-01-31', '2028-02-15', '2028-02-29', '2028-03-15']);
  assert.deepEqual(H.payoutDates('2026-02-16', 'semimonthly', 2, 'none'), ['2026-02-28', '2026-03-15']);
});

test('monthly dates clamp to short months and return to day 31', () => {
  assert.deepEqual(H.payoutDates('2026-01-31', 'monthly', 4, 'none'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(H.payoutDates('2026-11-30', 'monthly', 3, 'none'), ['2026-11-30', '2026-12-30', '2027-01-30']);
});

test('weekly / biweekly and the Sunday-to-Monday rule', () => {
  assert.deepEqual(H.payoutDates('2026-10-18', 'weekly', 2, 'none'), ['2026-10-18', '2026-10-25']);
  assert.deepEqual(H.payoutDates('2026-10-18', 'weekly', 2, 'monday'), ['2026-10-19', '2026-10-26']);
  assert.deepEqual(H.payoutDates('2026-10-01', 'biweekly', 3, 'none'), ['2026-10-01', '2026-10-15', '2026-10-29']);
  // 2026-11-15 is a Sunday
  assert.deepEqual(H.payoutDates('2026-11-01', 'semimonthly', 2, 'monday'), ['2026-11-16', '2026-11-30']);
});

test('order has one slot per hand and the pot is amount x hands', () => {
  const g = group();
  assert.equal(g.order.length, 4);
  assert.equal(g.order.filter(x => x === 'b').length, 2);
  const s = H.buildSchedule(g, '2026-01-01');
  assert.equal(s.length, 4);
  assert.equal(s[0].pot, 400000);
  assert.equal(s[0].net, 400000);
});

test('everyone breaks even without a fee; fee is deducted from the net', () => {
  const g = group();
  H.ledger(g).forEach(r => assert.equal(r.net, 0));
  const f = group({ fee: { type: 'percent', value: 2 } });
  const s = H.buildSchedule(f, '2026-01-01');
  assert.equal(s[0].fee, 8000);
  assert.equal(s[0].net, 392000);
  const fixed = group({ fee: { type: 'fixed', value: 5000 } });
  assert.equal(H.buildSchedule(fixed, '2026-01-01')[0].net, 395000);
});

test('status: done, late, collecting, upcoming', () => {
  const g = group();
  // rounds on Jan 15, Jan 31, Feb 15, Feb 28
  ['a', 'b', 'c'].forEach(id => { g.paid[H.paidKey(0, id)] = true; });
  g.paid[H.paidKey(1, 'a')] = true;
  const s = H.buildSchedule(g, '2026-02-10');
  assert.deepEqual(s.map(x => x.status), ['done', 'late', 'collecting', 'upcoming']);
  assert.equal(s[1].collected, 100000);
  const sum = H.summary(g, '2026-02-10');
  assert.equal(sum.current.number, 3);
  assert.equal(sum.lateRounds, 1);
  assert.deepEqual(sum.behind.map(b => b.name).sort(), ['Ben', 'Cora']);
});

test('bunutan draw is repeatable for the same seed and keeps hand counts', () => {
  const g = group();
  const a = H.drawOrder(g, 'office-2026');
  const b = H.drawOrder(g, 'office-2026');
  const c = H.drawOrder(g, 'another seed');
  assert.deepEqual(a, b);
  assert.equal(a.length, 4);
  assert.equal(a.filter(x => x === 'b').length, 2);
  assert.ok(Array.isArray(c));
});

test('peso formatting and parsing', () => {
  assert.equal(H.formatPeso(100000), '₱1,000');
  assert.equal(H.formatPeso(123456789), '₱1,234,567.89');
  assert.equal(H.formatPeso(5), '₱0.05');
  assert.equal(H.toCents('1,500.50'), 150050);
  assert.equal(H.toCents('₱ 2,000'), 200000);
  assert.ok(Number.isNaN(H.toCents('abc')));
});

test('CSV escapes quotes and blocks formula injection', () => {
  assert.equal(H.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(H.csvCell('Dela Cruz, Ana'), '"Dela Cruz, Ana"');
  const csv = H.scheduleCsv(group(), '2026-01-01');
  assert.equal(csv.split('\r\n').length, 6); // header + 4 rounds + trailing
});

test('import rejects bad data and strips HTML from names', () => {
  assert.throws(() => H.importJson('not json'), /valid JSON/);
  assert.throws(() => H.importJson('{"groups":[{"amount":0,"startDate":"2026-01-01","members":[{},{}]}]}'), /amount/);
  assert.throws(() => H.importJson('{"groups":[{"amount":100,"startDate":"2026-02-30","members":[{},{}]}]}'), /real date/);
  const out = H.importJson(JSON.stringify({ groups: [group({ name: '<img src=x onerror=alert(1)>Barkada', paid: { '0|a': true, '99|a': true, '0|zz': true } })] }));
  assert.equal(out[0].name, 'img src=x onerror=alert(1)Barkada');
  assert.deepEqual(Object.keys(out[0].paid), ['0|a']);
});

test('sample group is live relative to today', () => {
  const g = H.sampleGroup('2026-10-21');
  assert.equal(g.startDate, '2026-09-15');
  const s = H.buildSchedule(g, '2026-10-21');
  assert.equal(s.length, 10);
  assert.deepEqual(s.slice(0, 4).map(x => x.status), ['done', 'done', 'late', 'collecting']);
  assert.equal(s[3].date, '2026-10-31');
  assert.equal(s[3].payers, 5);
});

test('share text lists every round and who is still unpaid', () => {
  const g = H.sampleGroup('2026-10-21');
  const t = H.shareText(g, '2026-10-21');
  assert.match(t, /PALUWAGAN: Barkada sa Opisina/);
  assert.equal((t.match(/^\[[ x!>]\] \d+\./gm) || []).length, 10);
  assert.match(t, /Waiting for hulog from:/);
});
