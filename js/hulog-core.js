/*!
 * Hulog Paluwagan Planner - core logic (no DOM).
 * Pure functions for schedules, payouts, contribution tracking, the seeded
 * "bunutan" draw, CSV/JSON export and safe import.
 * Works in the browser (window.HulogCore) and in Node (require()).
 * MIT (c) 2026 Efraim Ray - https://www.efraimray.com/
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HulogCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly'];
  var FREQ_LABELS = {
    weekly: 'Weekly',
    biweekly: 'Every 2 weeks',
    semimonthly: 'Kinsenas at katapusan (15th & end of month)',
    monthly: 'Monthly'
  };
  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MAX_MEMBERS = 60;
  var MAX_HANDS = 5;
  var MAX_AMOUNT_CENTS = 100000000; // PHP 1,000,000.00 per hand per round

  /* ---------------------------------------------------------------------
   * Dates: always 'YYYY-MM-DD' strings, computed in UTC so no timezone or
   * daylight-saving shift can move a payday.
   * ------------------------------------------------------------------- */
  function isYmd(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = parseYmd(s);
    return toYmd(d) === s;
  }
  function parseYmd(s) {
    var p = s.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }
  function toYmd(d) {
    return d.toISOString().slice(0, 10);
  }
  function addDays(ymd, n) {
    return toYmd(new Date(parseYmd(ymd).getTime() + n * 86400000));
  }
  function daysInMonth(y, m0) {
    return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  }
  function weekday(ymd) {
    return parseYmd(ymd).getUTCDay();
  }
  function formatDate(ymd) {
    var d = parseYmd(ymd);
    return DAY_NAMES[d.getUTCDay()] + ', ' + MONTH_NAMES[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
  }
  function formatShortDate(ymd) {
    var d = parseYmd(ymd);
    return MONTH_NAMES[d.getUTCMonth()] + ' ' + d.getUTCDate();
  }
  /** Today's date in the Philippines (Asia/Manila), as YYYY-MM-DD. */
  function todayManila(now) {
    var date = now || new Date();
    try {
      var parts = {};
      new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(date).forEach(function (x) { parts[x.type] = x.value; });
      return parts.year + '-' + parts.month + '-' + parts.day;
    } catch (e) {
      return toYmd(new Date(date.getTime() + 8 * 3600000)); // UTC+8 fallback
    }
  }

  /** Semi-monthly paydays: the 15th and the last day of each month. */
  function nextSemimonthly(ymd) {
    var d = parseYmd(ymd);
    var y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
    var eom = daysInMonth(y, m);
    if (day <= 15) return toYmd(new Date(Date.UTC(y, m, 15)));
    if (day <= eom) return toYmd(new Date(Date.UTC(y, m, eom)));
    return null; // unreachable
  }

  /**
   * Build the list of payout dates.
   * @param {string} start  first possible payout date (YYYY-MM-DD)
   * @param {string} freq   weekly | biweekly | semimonthly | monthly
   * @param {number} count  number of rounds
   * @param {string} sundayRule 'none' or 'monday' (move Sunday payouts to Monday)
   */
  function payoutDates(start, freq, count, sundayRule) {
    var out = [];
    var i, d;
    if (!isYmd(start) || count < 1) return out;
    if (freq === 'weekly' || freq === 'biweekly') {
      var step = freq === 'weekly' ? 7 : 14;
      for (i = 0; i < count; i++) out.push(addDays(start, i * step));
    } else if (freq === 'semimonthly') {
      d = nextSemimonthly(start);
      for (i = 0; i < count; i++) {
        out.push(d);
        d = nextSemimonthly(addDays(d, 1));
      }
    } else {
      // monthly: same day as the start, clamped to short months (Jan 31 -> Feb 28 -> Mar 31)
      var s = parseYmd(start);
      var y = s.getUTCFullYear(), m = s.getUTCMonth(), day = s.getUTCDate();
      for (i = 0; i < count; i++) {
        var mm = m + i;
        var yy = y + Math.floor(mm / 12);
        mm = mm % 12;
        out.push(toYmd(new Date(Date.UTC(yy, mm, Math.min(day, daysInMonth(yy, mm))))));
      }
    }
    if (sundayRule === 'monday') {
      out = out.map(function (x) { return weekday(x) === 0 ? addDays(x, 1) : x; });
    }
    return out;
  }

  /* ---------------------------------------------------------------------
   * Money: everything is stored in centavos (integers) to avoid float errors.
   * ------------------------------------------------------------------- */
  function toCents(pesos) {
    var n = typeof pesos === 'number' ? pesos : parseFloat(String(pesos).replace(/[,\s₱]/g, ''));
    if (!isFinite(n)) return NaN;
    return Math.round(n * 100);
  }
  function formatPeso(cents) {
    var neg = cents < 0;
    var abs = Math.abs(Math.round(cents));
    var whole = Math.floor(abs / 100), frac = abs % 100;
    var s = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + '₱' + s + (frac ? '.' + (frac < 10 ? '0' : '') + frac : '');
  }

  function totalHands(group) {
    return group.members.reduce(function (sum, m) { return sum + m.hands; }, 0);
  }
  function feeFor(group, pot) {
    var f = group.fee || { type: 'none', value: 0 };
    if (f.type === 'fixed') return Math.min(pot, Math.max(0, Math.round(f.value)));
    if (f.type === 'percent') return Math.min(pot, Math.max(0, Math.round(pot * f.value / 100)));
    return 0;
  }
  function memberById(group, id) {
    for (var i = 0; i < group.members.length; i++) if (group.members[i].id === id) return group.members[i];
    return null;
  }

  /**
   * Make the payout order match the members' hands: each member appears
   * exactly `hands` times. Keeps the existing order where possible and
   * appends any missing slots at the end.
   */
  function normalizeOrder(group) {
    var need = {};
    group.members.forEach(function (m) { need[m.id] = m.hands; });
    var out = [];
    (group.order || []).forEach(function (id) {
      if (need[id] > 0) { out.push(id); need[id]--; }
    });
    group.members.forEach(function (m) {
      while (need[m.id] > 0) { out.push(m.id); need[m.id]--; }
    });
    return out;
  }

  function paidKey(round, memberId) {
    return round + '|' + memberId;
  }
  function isPaid(group, round, memberId) {
    return !!(group.paid && group.paid[paidKey(round, memberId)]);
  }

  /**
   * The full schedule with collection status for every round.
   * status: done (fully collected and paid out date reached), collecting
   * (current round), late (date passed but not fully collected), upcoming.
   */
  function buildSchedule(group, today) {
    var order = normalizeOrder(group);
    var hands = order.length;
    var dates = payoutDates(group.startDate, group.frequency, hands, group.sundayRule);
    var pot = group.amount * hands;
    var fee = feeFor(group, pot);
    var now = today || todayManila();
    var currentFound = false;
    return order.map(function (memberId, r) {
      var collected = 0, payers = 0, unpaid = [];
      group.members.forEach(function (m) {
        if (isPaid(group, r, m.id)) { collected += group.amount * m.hands; payers++; }
        else unpaid.push(m.id);
      });
      var date = dates[r];
      var complete = collected >= pot;
      var status;
      if (date < now) status = complete ? 'done' : 'late';
      else if (!currentFound) { status = 'collecting'; currentFound = true; }
      else status = 'upcoming';
      if (status === 'collecting' && date === now && complete) status = 'done';
      var rec = memberById(group, memberId);
      return {
        round: r,
        number: r + 1,
        date: date,
        recipientId: memberId,
        recipient: rec ? rec.name : '?',
        pot: pot,
        fee: fee,
        net: pot - fee,
        collected: collected,
        payers: payers,
        unpaid: unpaid,
        status: status
      };
    });
  }

  /** Per-member totals: what each person pays in and gets out. */
  function ledger(group) {
    var sched = buildSchedule(group, '9999-12-31');
    return group.members.map(function (m) {
      var rounds = sched.length;
      var payIn = group.amount * m.hands * rounds;
      var receive = 0, rounds_ = [];
      sched.forEach(function (s) {
        if (s.recipientId === m.id) { receive += s.net; rounds_.push(s.number); }
      });
      var paidSoFar = 0;
      for (var r = 0; r < rounds; r++) if (isPaid(group, r, m.id)) paidSoFar += group.amount * m.hands;
      return { id: m.id, name: m.name, hands: m.hands, payIn: payIn, receive: receive, net: receive - payIn, paidSoFar: paidSoFar, payoutRounds: rounds_ };
    });
  }

  /** Dashboard numbers for the summary strip. */
  function summary(group, today) {
    var sched = buildSchedule(group, today);
    var current = null, late = 0, behind = {};
    sched.forEach(function (s) {
      if (!current && (s.status === 'collecting')) current = s;
      if (s.status === 'late') {
        late++;
        s.unpaid.forEach(function (id) { behind[id] = (behind[id] || 0) + 1; });
      }
    });
    if (current) current.unpaid.forEach(function (id) { if (!behind[id]) behind[id] = 0; });
    var behindList = Object.keys(behind).filter(function (id) { return behind[id] > 0; }).map(function (id) {
      var m = memberById(group, id);
      return { id: id, name: m ? m.name : '?', rounds: behind[id] };
    });
    var doneCount = sched.filter(function (s) { return s.status === 'done'; }).length;
    return {
      rounds: sched.length,
      hands: sched.length,
      pot: sched.length ? sched[0].pot : 0,
      current: current,
      lateRounds: late,
      behind: behindList,
      doneCount: doneCount,
      endDate: sched.length ? sched[sched.length - 1].date : null,
      finished: !current && late === 0 && sched.length > 0
    };
  }

  /* ---------------------------------------------------------------------
   * Bunutan (draw lots): a seeded shuffle so anyone can re-run the same
   * seed and get the same order. Fair and checkable in the group chat.
   * ------------------------------------------------------------------- */
  function hashSeed(str) {
    // FNV-1a 32-bit
    var h = 0x811c9dc5;
    var s = String(str);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function drawOrder(group, seed) {
    var slots = [];
    group.members.forEach(function (m) { for (var i = 0; i < m.hands; i++) slots.push(m.id); });
    var rand = mulberry32(hashSeed(seed));
    for (var i = slots.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = slots[i]; slots[i] = slots[j]; slots[j] = t;
    }
    return slots;
  }
  /** Moving the order changes who gets which round; the paid map is per round, so it is kept. */
  function moveSlot(order, index, delta) {
    var to = index + delta;
    if (to < 0 || to >= order.length) return order.slice();
    var out = order.slice();
    var t = out[index]; out[index] = out[to]; out[to] = t;
    return out;
  }

  /* ---------------------------------------------------------------------
   * Export
   * ------------------------------------------------------------------- */
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    // Stop spreadsheet formula injection (=, +, -, @ at the start).
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function plainAmount(cents) {
    return (cents / 100).toFixed(2);
  }
  function scheduleCsv(group, today) {
    var rows = [['Round', 'Payout date', 'Recipient', 'Pot (PHP)', 'Fee (PHP)', 'Net payout (PHP)', 'Collected (PHP)', 'Status']];
    buildSchedule(group, today).forEach(function (s) {
      rows.push([s.number, s.date, s.recipient, plainAmount(s.pot), plainAmount(s.fee), plainAmount(s.net), plainAmount(s.collected), s.status]);
    });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }
  function shareText(group, today) {
    var sched = buildSchedule(group, today);
    var lines = [];
    lines.push('PALUWAGAN: ' + group.name);
    lines.push('Hulog: ' + formatPeso(group.amount) + ' per ulo, ' + FREQ_LABELS[group.frequency].toLowerCase());
    lines.push('Pot per round: ' + formatPeso(sched.length ? sched[0].pot : 0) + (sched.length && sched[0].fee ? ' (net ' + formatPeso(sched[0].net) + ' after fee)' : ''));
    lines.push('');
    sched.forEach(function (s) {
      var mark = s.status === 'done' ? '[x]' : s.status === 'late' ? '[!]' : s.status === 'collecting' ? '[>]' : '[ ]';
      lines.push(mark + ' ' + s.number + '. ' + formatShortDate(s.date) + ' - ' + s.recipient);
    });
    var sum = summary(group, today);
    if (sum.current) {
      var names = sum.current.unpaid.map(function (id) { var m = memberById(group, id); return m ? m.name : '?'; });
      lines.push('');
      lines.push('Next payout: ' + formatDate(sum.current.date) + ' to ' + sum.current.recipient);
      if (names.length) lines.push('Waiting for hulog from: ' + names.join(', '));
    }
    lines.push('');
    lines.push('Made with Hulog Paluwagan Planner');
    return lines.join('\n');
  }
  function exportJson(groups) {
    return JSON.stringify({ app: 'hulog-paluwagan', version: VERSION, exported: new Date().toISOString(), groups: groups }, null, 2);
  }

  /* ---------------------------------------------------------------------
   * Import / validation: never trust a pasted backup.
   * ------------------------------------------------------------------- */
  function cleanText(s, max) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  }
  function uid(prefix) {
    return (prefix || 'm') + Math.random().toString(36).slice(2, 9);
  }
  function sanitizeGroup(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Group data is missing.');
    var g = {};
    g.id = /^[a-z0-9_-]{1,24}$/i.test(raw.id || '') ? raw.id : uid('g');
    g.name = cleanText(raw.name, 60) || 'Untitled paluwagan';
    g.amount = Math.round(Number(raw.amount));
    if (!(g.amount > 0) || g.amount > MAX_AMOUNT_CENTS) throw new Error('Contribution amount must be between ₱1 and ₱1,000,000.');
    g.frequency = FREQUENCIES.indexOf(raw.frequency) >= 0 ? raw.frequency : 'semimonthly';
    if (!isYmd(raw.startDate)) throw new Error('Start date must be a real date (YYYY-MM-DD).');
    g.startDate = raw.startDate;
    g.sundayRule = raw.sundayRule === 'monday' ? 'monday' : 'none';
    var fee = raw.fee || {};
    var ft = ['none', 'fixed', 'percent'].indexOf(fee.type) >= 0 ? fee.type : 'none';
    var fv = Number(fee.value) || 0;
    if (ft === 'percent') fv = Math.min(20, Math.max(0, fv));
    if (ft === 'fixed') fv = Math.max(0, Math.round(fv));
    g.fee = { type: ft, value: ft === 'none' ? 0 : fv };
    if (!Array.isArray(raw.members) || raw.members.length < 2) throw new Error('A paluwagan needs at least 2 members.');
    if (raw.members.length > MAX_MEMBERS) throw new Error('Up to ' + MAX_MEMBERS + ' members per group.');
    var seen = {};
    g.members = raw.members.map(function (m) {
      var id = /^[a-z0-9_-]{1,24}$/i.test((m && m.id) || '') && !seen[m.id] ? m.id : uid('m');
      seen[id] = true;
      var hands = Math.round(Number(m && m.hands));
      return { id: id, name: cleanText(m && m.name, 40) || 'Member', hands: Math.min(MAX_HANDS, Math.max(1, hands || 1)) };
    });
    g.order = Array.isArray(raw.order) ? raw.order.filter(function (id) { return seen[id]; }) : [];
    g.order = normalizeOrder(g);
    g.paid = {};
    if (raw.paid && typeof raw.paid === 'object') {
      Object.keys(raw.paid).forEach(function (k) {
        var p = k.split('|');
        if (p.length === 2 && /^\d{1,3}$/.test(p[0]) && +p[0] < g.order.length && seen[p[1]] && raw.paid[k] === true) g.paid[k] = true;
      });
    }
    g.seed = cleanText(raw.seed, 60);
    return g;
  }
  function importJson(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('That is not valid JSON. Paste the whole backup text.'); }
    var list = Array.isArray(data) ? data : (data && Array.isArray(data.groups) ? data.groups : (data && data.members ? [data] : null));
    if (!list || !list.length) throw new Error('No paluwagan groups found in that backup.');
    return list.slice(0, 20).map(sanitizeGroup);
  }

  /* ---------------------------------------------------------------------
   * Sample group: dated relative to today so the demo always looks "live".
   * ------------------------------------------------------------------- */
  function sampleGroup(today) {
    var now = today || todayManila();
    // Start three kinsenas/katapusan paydays ago.
    var d = now;
    var back = [];
    for (var i = 0; i < 4; i++) {
      d = addDays(d, -1);
      while (parseYmd(d).getUTCDate() !== 15 && nextSemimonthly(d) !== d) d = addDays(d, -1);
      back.push(d);
    }
    var start = back[2]; // three paydays before the upcoming one
    var names = [['Ate Liza', 2], ['Kuya Jun', 1], ['Mae', 1], ['Rodel', 1], ['Joy', 1], ['Bong', 1], ['Tess', 1], ['Arnel', 1], ['Grace', 1]];
    var members = names.map(function (n, idx) { return { id: 'm' + (idx + 1), name: n[0], hands: n[1] }; });
    var g = {
      id: 'sample', name: 'Barkada sa Opisina (sample)', amount: 100000, frequency: 'semimonthly',
      startDate: start, sundayRule: 'monday', fee: { type: 'none', value: 0 },
      members: members, order: [], paid: {}, seed: 'barkada-2026'
    };
    g.order = drawOrder(g, g.seed);
    var sched = buildSchedule(g, now);
    sched.forEach(function (s) {
      if (s.date < now) {
        members.forEach(function (m) {
          // Round 3: Bong has not paid yet (shows the "late" state).
          if (!(s.round === 2 && m.id === 'm6')) g.paid[paidKey(s.round, m.id)] = true;
        });
      } else if (s.status === 'collecting') {
        ['m1', 'm2', 'm3', 'm5', 'm7'].forEach(function (id) { g.paid[paidKey(s.round, id)] = true; });
      }
    });
    return g;
  }

  function newGroup(today) {
    var g = {
      id: uid('g'), name: 'New paluwagan', amount: 50000, frequency: 'semimonthly',
      startDate: today || todayManila(), sundayRule: 'monday', fee: { type: 'none', value: 0 },
      members: [{ id: uid('m'), name: 'Member 1', hands: 1 }, { id: uid('m'), name: 'Member 2', hands: 1 }, { id: uid('m'), name: 'Member 3', hands: 1 }],
      order: [], paid: {}, seed: ''
    };
    g.order = normalizeOrder(g);
    return g;
  }

  return {
    VERSION: VERSION,
    FREQUENCIES: FREQUENCIES,
    FREQ_LABELS: FREQ_LABELS,
    MAX_HANDS: MAX_HANDS,
    MAX_MEMBERS: MAX_MEMBERS,
    isYmd: isYmd,
    addDays: addDays,
    weekday: weekday,
    formatDate: formatDate,
    formatShortDate: formatShortDate,
    todayManila: todayManila,
    payoutDates: payoutDates,
    toCents: toCents,
    formatPeso: formatPeso,
    totalHands: totalHands,
    feeFor: feeFor,
    normalizeOrder: normalizeOrder,
    paidKey: paidKey,
    isPaid: isPaid,
    buildSchedule: buildSchedule,
    ledger: ledger,
    summary: summary,
    hashSeed: hashSeed,
    drawOrder: drawOrder,
    moveSlot: moveSlot,
    csvCell: csvCell,
    scheduleCsv: scheduleCsv,
    shareText: shareText,
    exportJson: exportJson,
    cleanText: cleanText,
    sanitizeGroup: sanitizeGroup,
    importJson: importJson,
    sampleGroup: sampleGroup,
    newGroup: newGroup,
    uid: uid
  };
});
