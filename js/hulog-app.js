/*!
 * Hulog Paluwagan Planner - user interface
 * Renders the planner from state, saves to localStorage (wrapped in try/catch),
 * and wires every control with event delegation (no inline handlers).
 * Depends on js/hulog-core.js (window.HulogCore).
 * MIT (c) 2026 Efraim Ray - https://www.efraimray.com/
 */
(function () {
  'use strict';
  var H = window.HulogCore;
  if (!H) return;

  var STORE_KEY = 'hulog-paluwagan:v1';
  var THEME_KEY = 'hulog-paluwagan:theme';
  var doc = document;
  var isStandalone = doc.documentElement.getAttribute('data-build') === 'standalone';

  /* ------------------------------------------------------------------ state */
  var state = { groups: [], activeId: null, tab: 'schedule' };
  var pendingConfirm = null; // { key, timer } for two-step destructive buttons
  var today = H.todayManila();

  function load() {
    var raw = null;
    try { raw = window.localStorage.getItem(STORE_KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        var data = JSON.parse(raw);
        state.groups = H.importJson(JSON.stringify({ groups: data.groups || [] }));
        state.activeId = data.activeId;
        state.tab = data.tab || 'schedule';
      } catch (e) { state.groups = []; }
    }
    if (!state.groups.length) {
      state.groups = [H.sampleGroup(today)];
      state.activeId = 'sample';
    }
    if (!activeGroup()) state.activeId = state.groups[0].id;
  }
  function save() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({ groups: state.groups, activeId: state.activeId, tab: state.tab }));
    } catch (e) { /* storage blocked (private mode): the planner still works for this visit */ }
  }
  function activeGroup() {
    for (var i = 0; i < state.groups.length; i++) if (state.groups[i].id === state.activeId) return state.groups[i];
    return null;
  }

  /* ---------------------------------------------------------------- helpers */
  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var STATUS_LABEL = { done: 'Paid out', collecting: 'Collecting', late: 'Late hulog', upcoming: 'Upcoming' };
  function chip(status) { return '<span class="chip chip-' + status + '">' + STATUS_LABEL[status] + '</span>'; }
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function memberName(g, id) {
    for (var i = 0; i < g.members.length; i++) if (g.members[i].id === id) return g.members[i].name;
    return '?';
  }
  function ordinal(n) { return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }

  function copyText(text, label) {
    function fallback() {
      var ta = doc.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      doc.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
      doc.body.removeChild(ta);
      toast(ok ? label + ' copied' : 'Copy blocked here. Select the text and copy it manually.');
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast(label + ' copied'); }, fallback);
        return;
      }
    } catch (e) { /* fall through */ }
    fallback();
  }
  function download(filename, text, type) {
    try {
      var blob = new Blob([text], { type: type });
      var url = URL.createObjectURL(blob);
      var a = doc.createElement('a');
      a.href = url;
      a.download = filename;
      doc.body.appendChild(a);
      a.click();
      doc.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('Saved ' + filename);
    } catch (e) { toast('Download failed. Use Copy instead.'); }
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'paluwagan'; }

  function confirmStep(key, btn, label) {
    if (pendingConfirm && pendingConfirm.key === key) {
      clearTimeout(pendingConfirm.timer);
      pendingConfirm = null;
      return true;
    }
    if (pendingConfirm) clearTimeout(pendingConfirm.timer);
    var original = btn.textContent;
    btn.textContent = label;
    pendingConfirm = {
      key: key,
      timer: setTimeout(function () { pendingConfirm = null; if (btn.isConnected) btn.textContent = original; }, 4000)
    };
    return false;
  }

  /* -------------------------------------------------------------- rendering */
  function renderAll(skip) {
    var g = activeGroup();
    g.order = H.normalizeOrder(g);
    renderSelect();
    renderHero(g);
    if (skip !== 'schedule') renderSchedule(g);
    if (skip !== 'tracker') renderTracker(g);
    if (skip !== 'members') renderMembers(g);
    if (skip !== 'settings') renderSettings(g);
    if (skip !== 'share') renderShare(g);
    showTab(state.tab, false);
    save();
  }

  function renderSelect() {
    var sel = $('#groupSelect');
    sel.innerHTML = state.groups.map(function (g) {
      return '<option value="' + esc(g.id) + '"' + (g.id === state.activeId ? ' selected' : '') + '>' + esc(g.name) + '</option>';
    }).join('');
  }

  function renderHero(g) {
    var sum = H.summary(g, today);
    var members = g.members.length;
    $('#groupTitle').textContent = g.name;
    $('#groupMeta').textContent = members + ' members · ' + sum.hands + ' ulo · ' + H.FREQ_LABELS[g.frequency].replace(/ \(.*\)$/, '');
    doc.title = isStandalone ? doc.title : g.name + ' · Hulog Paluwagan Planner';

    var c = sum.current;
    var next;
    if (c) {
      var pct = c.pot ? Math.round(c.collected / c.pot * 100) : 0;
      next = '<article class="card next-card">' +
        '<div class="next-top"><div class="stat"><span class="eyebrow">Next payout</span>' +
        '<span class="next-who">' + esc(c.recipient) + '</span>' +
        '<span class="stat-sub">' + esc(H.formatDate(c.date)) + (c.date === today ? ' · today' : '') + '</span></div>' +
        '<div class="stamp" aria-label="Round ' + c.number + ' of ' + sum.rounds + '"><span><b>' + c.number + '</b><small>of ' + sum.rounds + '</small></span></div></div>' +
        '<div class="next-amt">' + H.formatPeso(c.net) + (c.fee ? ' <span class="stat-sub">after ' + H.formatPeso(c.fee) + ' fee</span>' : '') + '</div>' +
        '<div class="meter" role="progressbar" aria-label="Hulog collected this round" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span style="width:' + pct + '%"></span></div>' +
        '<div class="meter-row"><span><b class="num">' + H.formatPeso(c.collected) + '</b> of ' + H.formatPeso(c.pot) + ' collected</span><span>' + c.payers + ' of ' + members + ' members paid</span></div>' +
        '</article>';
    } else {
      next = '<article class="card next-card"><span class="eyebrow">Next payout</span><span class="next-who">' +
        (sum.lateRounds ? 'Waiting for late hulog' : 'All rounds paid out') + '</span><span class="stat-sub">' +
        (sum.endDate ? 'Last round: ' + esc(H.formatDate(sum.endDate)) : '') + '</span></article>';
    }
    var pot = '<article class="card stat"><span class="eyebrow">Pot per round</span><span class="stat-val">' + H.formatPeso(sum.pot) + '</span>' +
      '<span class="stat-sub">' + H.formatPeso(g.amount) + ' hulog × ' + sum.hands + ' ulo</span>' +
      '<span class="stat-sub">' + sum.doneCount + ' of ' + sum.rounds + ' paid out · ends ' + esc(H.formatShortDate(sum.endDate)) + '</span></article>';
    var behind = '<article class="card stat"><span class="eyebrow">Behind on hulog</span><span class="stat-val" style="color:var(' + (sum.behind.length ? '--bad' : '--ok') + ')">' + sum.behind.length + '</span>' +
      (sum.behind.length
        ? '<div class="behind-list">' + sum.behind.map(function (b) { return '<span class="chip chip-late">' + esc(b.name) + (b.rounds > 1 ? ' ×' + b.rounds : '') + '</span>'; }).join('') + '</div>'
        : '<span class="stat-sub">Everyone is up to date on past rounds.</span>') +
      '</article>';
    $('#summary').innerHTML = next + pot + behind;
  }

  function renderSchedule(g) {
    var sched = H.buildSchedule(g, today);
    var hasFee = sched.length && sched[0].fee > 0;
    var seen = {};
    var rows = sched.map(function (s) {
      seen[s.recipientId] = (seen[s.recipientId] || 0) + 1;
      var hands = 0;
      g.members.forEach(function (m) { if (m.id === s.recipientId) hands = m.hands; });
      var slotTag = hands > 1 ? ' <span class="chip chip-gold">' + ordinal(seen[s.recipientId]) + ' ulo</span>' : '';
      return '<tr class="st-' + s.status + (s.status === 'collecting' ? ' is-current' : '') + '">' +
        '<td><span class="round-no">' + s.number + '</span></td>' +
        '<td class="date-cell">' + esc(H.formatDate(s.date)) + '</td>' +
        '<td><span class="who">' + esc(s.recipient) + '</span>' + slotTag + '</td>' +
        '<td class="money hide-sm">' + H.formatPeso(s.pot) + '</td>' +
        (hasFee ? '<td class="money hide-sm">' + H.formatPeso(s.fee) + '</td>' : '') +
        '<td class="money"><b>' + H.formatPeso(s.net) + '</b></td>' +
        '<td class="money hide-sm">' + H.formatPeso(s.collected) + '</td>' +
        '<td>' + chip(s.status) + '</td></tr>';
    }).join('');
    var led = H.ledger(g).map(function (r) {
      return '<tr><th scope="row">' + esc(r.name) + (r.hands > 1 ? ' <span class="chip chip-gold">' + r.hands + ' ulo</span>' : '') + '</th>' +
        '<td class="num">' + r.payoutRounds.join(', ') + '</td>' +
        '<td class="money">' + H.formatPeso(r.payIn) + '</td>' +
        '<td class="money">' + H.formatPeso(r.receive) + '</td>' +
        '<td class="money hide-sm">' + H.formatPeso(r.paidSoFar) + '</td></tr>';
    }).join('');
    $('#panel-schedule').innerHTML =
      '<div class="panel-head"><div><h2>Payout schedule</h2><p>Every member pays the hulog each round. One ulo (slot) receives the whole pot per round, in the order below.</p></div>' +
      '<div class="row no-print"><button type="button" class="btn btn-ghost btn-sm site-only" data-act="print">Print schedule</button></div></div>' +
      '<div class="table-wrap"><table><caption class="sr-only">Payout schedule for ' + esc(g.name) + '</caption><thead><tr><th>Round</th><th>Payout date</th><th>Recipient</th><th class="money hide-sm">Pot</th>' +
      (hasFee ? '<th class="money hide-sm">Fee</th>' : '') + '<th class="money">Net payout</th><th class="money hide-sm">Collected</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="panel-head"><div><h3>Per-member totals</h3><p>What each person puts in over the whole cycle and what they take home. Without a fee everyone breaks even; the early rounds work like an interest-free loan.</p></div></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Member</th><th>Payout round</th><th class="money">Pays in</th><th class="money">Receives</th><th class="money hide-sm">Paid so far</th></tr></thead><tbody>' + led + '</tbody></table></div>';
  }

  function renderTracker(g) {
    var sched = H.buildSchedule(g, today);
    var head = '<th scope="col">Member</th>' + sched.map(function (s) {
      return '<th scope="col" class="' + (s.status === 'collecting' ? 'col-current' : '') + '">R' + s.number + '<br><span class="num" style="font-size:.68rem">' + esc(H.formatShortDate(s.date)) + '</span></th>';
    }).join('');
    var body = g.members.map(function (m) {
      var cells = sched.map(function (s) {
        var paid = H.isPaid(g, s.round, m.id);
        var late = !paid && s.status === 'late';
        var rec = s.recipientId === m.id;
        var label = (paid ? 'Unmark ' : 'Mark ') + m.name + ' paid for round ' + s.number + ' (' + H.formatShortDate(s.date) + ')' + (rec ? ', payout round' : '') + (late ? ', late' : '');
        return '<td class="' + (s.status === 'collecting' ? 'col-current' : '') + '"><button type="button" class="tick' + (late ? ' is-late' : '') + (rec ? ' is-recipient' : '') +
          '" data-act="tick" data-round="' + s.round + '" data-member="' + esc(m.id) + '" aria-pressed="' + paid + '" aria-label="' + esc(label) + '" title="' + esc(label) + '"></button></td>';
      }).join('');
      return '<tr><th scope="row">' + esc(m.name) + (m.hands > 1 ? ' <span class="chip chip-gold">×' + m.hands + '</span>' : '') + '</th>' + cells + '</tr>';
    }).join('');
    var foot = '<th scope="row">Paid</th>' + sched.map(function (s) {
      return '<td class="' + (s.status === 'collecting' ? 'col-current' : '') + '">' + s.payers + '/' + g.members.length + '</td>';
    }).join('');
    var sum = H.summary(g, today);
    var quick = sum.current
      ? '<button type="button" class="btn btn-sm" data-act="round-all" data-round="' + sum.current.round + '">Mark all paid for round ' + sum.current.number + '</button>'
      : '';
    $('#panel-tracker').innerHTML =
      '<div class="panel-head"><div><h2>Hulog tracker</h2><p>Tap a box when a member pays. Members with two ulo pay double, so their box counts twice. Late boxes turn red after the payout date.</p></div><div class="row">' + quick + '</div></div>' +
      '<div class="grid-legend"><span><i class="lg lg-paid"></i> Paid</span><span><i class="lg"></i> Not yet</span><span><i class="lg lg-late"></i> Late</span><span><i class="lg lg-rec"></i> Their payout round</span></div>' +
      '<div class="table-wrap"><table class="grid-table"><caption class="sr-only">Hulog tracker</caption><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody><tfoot><tr>' + foot + '</tr></tfoot></table></div>';
  }

  function renderMembers(g) {
    var dates = H.payoutDates(g.startDate, g.frequency, g.order.length, g.sundayRule);
    var list = g.members.map(function (m) {
      return '<li><label class="sr-only" for="mname-' + esc(m.id) + '">Name</label>' +
        '<input class="input" id="mname-' + esc(m.id) + '" data-field="member-name" data-member="' + esc(m.id) + '" value="' + esc(m.name) + '" maxlength="40" autocomplete="off">' +
        '<span class="stepper" role="group" aria-label="Number of ulo for ' + esc(m.name) + '">' +
        '<button type="button" data-act="hand-" data-member="' + esc(m.id) + '" aria-label="One less ulo">−</button>' +
        '<output>' + m.hands + ' ulo</output>' +
        '<button type="button" data-act="hand+" data-member="' + esc(m.id) + '" aria-label="One more ulo">+</button></span>' +
        '<button type="button" class="btn btn-danger btn-sm" data-act="remove-member" data-member="' + esc(m.id) + '" aria-label="Remove ' + esc(m.name) + '">Remove</button></li>';
    }).join('');
    var order = g.order.map(function (id, i) {
      return '<li data-slot="' + i + '"><span class="slot-no">' + (i + 1) + '.</span><span class="slot-name">' + esc(memberName(g, id)) + '</span>' +
        '<span class="slot-date">' + esc(H.formatShortDate(dates[i])) + '</span>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="move" data-index="' + i + '" data-delta="-1" aria-label="Move ' + esc(memberName(g, id)) + ' earlier"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="move" data-index="' + i + '" data-delta="1" aria-label="Move ' + esc(memberName(g, id)) + ' later"' + (i === g.order.length - 1 ? ' disabled' : '') + '>↓</button></li>';
    }).join('');
    $('#panel-members').innerHTML =
      '<div class="two-col">' +
      '<div class="card stack"><h2>Members</h2><p class="fine">' + g.members.length + ' members, ' + g.order.length + ' ulo in total. One person can hold up to ' + H.MAX_HANDS + ' ulo.</p>' +
      '<ul class="member-list">' + list + '</ul>' +
      '<form class="row" data-form="add-member"><label class="sr-only" for="newMember">New member name</label>' +
      '<input class="input" id="newMember" placeholder="Add a member, e.g. Tita Nena" maxlength="40" autocomplete="off" style="flex:1;min-width:160px">' +
      '<button type="submit" class="btn">Add member</button></form><p class="field err" id="memberErr" role="alert"></p></div>' +
      '<div class="card stack"><h2>Payout order</h2>' +
      '<div class="draw-box"><div><b>Bunutan (draw lots)</b><p class="fine">Type any seed the group agrees on, like today’s date and the group name. The same seed always gives the same order, so anyone can check the draw.</p></div>' +
      '<div class="row"><label class="sr-only" for="seed">Draw seed</label><input class="input" id="seed" value="' + esc(g.seed || '') + '" placeholder="e.g. ' + esc(today + ' ' + g.name.split(' ')[0]) + '" maxlength="60">' +
      '<button type="button" class="btn" data-act="draw">Draw order</button><button type="button" class="btn btn-ghost" data-act="sort-az">A–Z</button></div>' +
      (Object.keys(g.paid).length ? '<p class="fine">Hulog marks stay with their round. A new draw only changes who receives each round.</p>' : '') +
      (g.seed ? '<p class="fine">Last draw seed: <code>' + esc(g.seed) + '</code></p>' : '') + '</div>' +
      '<ol class="order-list" id="orderList">' + order + '</ol></div></div>';
  }

  function renderSettings(g) {
    var feeVal = g.fee.type === 'fixed' ? (g.fee.value / 100) : g.fee.value;
    function radio(name, value, label, checked) {
      return '<label><input type="radio" name="' + name + '" value="' + value + '" data-field="' + name + '"' + (checked ? ' checked' : '') + '> ' + label + '</label>';
    }
    $('#panel-settings').innerHTML =
      '<div class="card stack"><h2>Group settings</h2><p class="fine">Changes save automatically in this browser.</p>' +
      '<div class="form-grid">' +
      '<div class="field span-2"><label for="s-name">Group name</label><input class="input" id="s-name" data-field="name" value="' + esc(g.name) + '" maxlength="60"></div>' +
      '<div class="field"><label for="s-amount">Hulog per ulo, per round</label><div class="input-group"><span class="addon">₱</span><input class="input" id="s-amount" data-field="amount" inputmode="decimal" value="' + (g.amount / 100) + '"></div><span class="err" id="err-amount"></span></div>' +
      '<div class="field"><label for="s-start">First payout date</label><input class="input" type="date" id="s-start" data-field="startDate" value="' + esc(g.startDate) + '"><span class="hint">For kinsenas at katapusan, the first 15th or month-end on or after this date.</span><span class="err" id="err-start"></span></div>' +
      '<div class="field span-2"><span class="label" id="freq-l">How often</span><div class="radio-row" role="radiogroup" aria-labelledby="freq-l">' +
      H.FREQUENCIES.map(function (f) { return radio('frequency', f, esc(H.FREQ_LABELS[f]), g.frequency === f); }).join('') + '</div></div>' +
      '<div class="field"><span class="label" id="sun-l">Payout falls on a Sunday</span><div class="radio-row" role="radiogroup" aria-labelledby="sun-l">' +
      radio('sundayRule', 'none', 'Keep Sunday', g.sundayRule !== 'monday') + radio('sundayRule', 'monday', 'Move to Monday', g.sundayRule === 'monday') + '</div></div>' +
      '<div class="field"><span class="label" id="fee-l">Organizer fee (optional)</span><div class="radio-row" role="radiogroup" aria-labelledby="fee-l">' +
      radio('feeType', 'none', 'None', g.fee.type === 'none') + radio('feeType', 'fixed', '₱ fixed', g.fee.type === 'fixed') + radio('feeType', 'percent', '% of pot', g.fee.type === 'percent') + '</div>' +
      '<label class="sr-only" for="s-fee">Fee value</label><input class="input" id="s-fee" data-field="feeValue" inputmode="decimal" value="' + feeVal + '"' + (g.fee.type === 'none' ? ' disabled' : '') + '>' +
      '<span class="hint">Taken from each payout. Percent is capped at 20%.</span></div>' +
      '</div></div>';
  }

  function renderShare(g) {
    $('#panel-share').innerHTML =
      '<div class="share-grid">' +
      '<div class="card stack"><div class="panel-head"><div><h2>Group chat summary</h2><p>Paste this into Messenger or Viber so everyone sees the order and who still owes hulog.</p></div></div>' +
      '<pre class="share-preview" id="shareText">' + esc(H.shareText(g, today)) + '</pre>' +
      '<div class="row"><button type="button" class="btn" data-act="copy-share">Copy summary</button></div></div>' +
      '<div class="stack">' +
      '<div class="card stack"><h3>Spreadsheet</h3><p class="fine">The schedule as CSV for Excel or Google Sheets.</p><div class="row">' +
      '<button type="button" class="btn btn-ghost" data-act="copy-csv">Copy CSV</button><button type="button" class="btn btn-ghost site-only" data-act="download-csv">Download .csv</button></div></div>' +
      '<div class="card stack"><h3>Backup</h3><p class="fine">Your groups live only in this browser. Save a backup before clearing your browser or switching phones.</p><div class="row">' +
      '<button type="button" class="btn btn-ghost" data-act="copy-json">Copy backup</button><button type="button" class="btn btn-ghost site-only" data-act="download-json">Download backup</button></div></div>' +
      '<div class="card stack"><h3>Restore</h3><label class="fine" for="importText">Paste a backup, or choose a backup file.</label>' +
      '<textarea class="input" id="importText" spellcheck="false" placeholder="{ &quot;app&quot;: &quot;hulog-paluwagan&quot;, ... }"></textarea>' +
      '<div class="row"><label class="btn btn-ghost" for="importFile">Choose file</label><input type="file" id="importFile" accept=".json,application/json" class="sr-only">' +
      '<button type="button" class="btn" data-act="import">Restore groups</button></div><p class="field err" id="importErr" role="alert"></p></div>' +
      '<div class="card stack"><h3>This group</h3><div class="row"><button type="button" class="btn btn-danger" data-act="delete-group">Delete this group</button>' +
      '<button type="button" class="btn btn-ghost" data-act="add-sample">Add the sample group</button></div></div>' +
      '</div></div>';
  }

  /* ------------------------------------------------------------------- tabs */
  function showTab(name, focus) {
    state.tab = name;
    doc.querySelectorAll('[role="tab"]').forEach(function (t) {
      var on = t.getAttribute('data-tab') === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    doc.querySelectorAll('[role="tabpanel"]').forEach(function (p) { p.hidden = p.id !== 'panel-' + name; });
  }

  /* ---------------------------------------------------------------- actions */
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') doc.documentElement.setAttribute('data-theme', t);
    else doc.documentElement.removeAttribute('data-theme');
  }
  function toggleTheme() {
    var cur = doc.documentElement.getAttribute('data-theme');
    if (!cur) cur = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { window.localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
  }

  function onClick(e) {
    var tab = e.target.closest('[role="tab"]');
    if (tab) { showTab(tab.getAttribute('data-tab'), false); save(); return; }
    var btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    var act = btn.getAttribute('data-act');
    var g = activeGroup();
    var id = btn.getAttribute('data-member');
    var m = null;
    if (id) g.members.forEach(function (x) { if (x.id === id) m = x; });

    switch (act) {
      case 'theme': toggleTheme(); return;
      case 'new-group':
        var ng = H.newGroup(today);
        state.groups.push(ng);
        state.activeId = ng.id;
        state.tab = 'settings';
        renderAll();
        var nameInput = $('#s-name');
        if (nameInput) { nameInput.focus(); nameInput.select(); }
        toast('New group created. Name it and add members.');
        return;
      case 'tick':
        var key = H.paidKey(+btn.getAttribute('data-round'), id);
        if (g.paid[key]) delete g.paid[key]; else g.paid[key] = true;
        renderAll();
        var again = doc.querySelector('.tick[data-round="' + btn.getAttribute('data-round') + '"][data-member="' + id + '"]');
        if (again) again.focus();
        return;
      case 'round-all':
        var r = +btn.getAttribute('data-round');
        g.members.forEach(function (x) { g.paid[H.paidKey(r, x.id)] = true; });
        renderAll();
        toast('Everyone marked paid for round ' + (r + 1));
        return;
      case 'hand+':
      case 'hand-':
        if (!m) return;
        var total = H.totalHands(g);
        if (act === 'hand+' && m.hands >= H.MAX_HANDS) { toast('Up to ' + H.MAX_HANDS + ' ulo per member'); return; }
        if (act === 'hand-' && m.hands <= 1) { toast('Each member needs at least 1 ulo'); return; }
        if (act === 'hand+' && total >= 120) { toast('Up to 120 rounds per group'); return; }
        m.hands += act === 'hand+' ? 1 : -1;
        trimPaid(g);
        renderAll();
        return;
      case 'remove-member':
        if (!m) return;
        if (g.members.length <= 2) { toast('A paluwagan needs at least 2 members'); return; }
        if (!confirmStep('rm-' + id, btn, 'Tap again to remove')) return;
        g.members = g.members.filter(function (x) { return x.id !== id; });
        Object.keys(g.paid).forEach(function (k) { if (k.split('|')[1] === id) delete g.paid[k]; });
        trimPaid(g);
        renderAll();
        toast(m.name + ' removed');
        return;
      case 'move':
        var i = +btn.getAttribute('data-index'), d = +btn.getAttribute('data-delta');
        g.order = H.moveSlot(g.order, i, d);
        renderAll();
        var li = doc.querySelector('#orderList li[data-slot="' + (i + d) + '"]');
        if (li) {
          li.classList.add('is-moved');
          var b = li.querySelector('[data-delta="' + d + '"]') || li.querySelector('button');
          if (b && !b.disabled) b.focus();
        }
        return;
      case 'draw':
        var seedInput = $('#seed');
        var seed = H.cleanText(seedInput.value, 60) || (today + ' ' + g.name);
        var list = $('#orderList');
        list.classList.add('shuffling');
        btn.disabled = true;
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setTimeout(function () {
          g.order = H.drawOrder(g, seed);
          g.seed = seed;
          renderAll();
          toast('Order drawn with seed “' + seed + '”');
        }, reduce ? 0 : 650);
        return;
      case 'sort-az':
        var sorted = g.members.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
        g.order = [];
        sorted.forEach(function (x) { for (var k = 0; k < x.hands; k++) g.order.push(x.id); });
        g.seed = '';
        renderAll();
        return;
      case 'print': try { window.print(); } catch (err) { /* ignore */ } return;
      case 'copy-share': copyText(H.shareText(g, today), 'Summary'); return;
      case 'copy-csv': copyText(H.scheduleCsv(g, today), 'CSV'); return;
      case 'download-csv': download(slug(g.name) + '-schedule.csv', H.scheduleCsv(g, today), 'text/csv;charset=utf-8'); return;
      case 'copy-json': copyText(H.exportJson(state.groups), 'Backup'); return;
      case 'download-json': download('hulog-backup-' + today + '.json', H.exportJson(state.groups), 'application/json'); return;
      case 'import': doImport($('#importText').value); return;
      case 'delete-group':
        if (!confirmStep('del-' + g.id, btn, 'Tap again to delete ' + g.name.slice(0, 24))) return;
        state.groups = state.groups.filter(function (x) { return x.id !== g.id; });
        if (!state.groups.length) state.groups = [H.sampleGroup(today)];
        state.activeId = state.groups[0].id;
        state.tab = 'schedule';
        renderAll();
        toast('Group deleted');
        return;
      case 'add-sample':
        var s = H.sampleGroup(today);
        s.id = H.uid('g');
        state.groups.push(s);
        state.activeId = s.id;
        state.tab = 'schedule';
        renderAll();
        toast('Sample group added');
        return;
    }
  }

  /** Drop paid marks for rounds that no longer exist (after removing hands). */
  function trimPaid(g) {
    g.order = H.normalizeOrder(g);
    var rounds = g.order.length;
    Object.keys(g.paid).forEach(function (k) { if (+k.split('|')[0] >= rounds) delete g.paid[k]; });
  }

  function doImport(text) {
    var err = $('#importErr');
    err.textContent = '';
    if (!text || !text.trim()) { err.textContent = 'Paste a backup first, or choose a backup file.'; return; }
    try {
      var groups = H.importJson(text);
      groups.forEach(function (ng) {
        var clash = state.groups.some(function (x) { return x.id === ng.id; });
        if (clash) ng.id = H.uid('g');
        state.groups.push(ng);
      });
      state.activeId = groups[0].id;
      state.tab = 'schedule';
      renderAll();
      toast(groups.length + (groups.length === 1 ? ' group' : ' groups') + ' restored');
    } catch (e) {
      err.textContent = e.message;
    }
  }

  function onInput(e) {
    var el = e.target;
    var field = el.getAttribute && el.getAttribute('data-field');
    if (!field) return;
    var g = activeGroup();
    if (field === 'member-name') {
      var id = el.getAttribute('data-member');
      g.members.forEach(function (m) { if (m.id === id) m.name = H.cleanText(el.value, 40) || 'Member'; });
      renderAll('members');
      return;
    }
    if (field === 'name') { g.name = H.cleanText(el.value, 60) || 'Untitled paluwagan'; renderAll('settings'); return; }
    if (field === 'amount') {
      var c = H.toCents(el.value);
      var errA = $('#err-amount');
      if (!(c >= 100) || c > 100000000) { errA.textContent = 'Enter an amount from ₱1 to ₱1,000,000.'; el.setAttribute('aria-invalid', 'true'); return; }
      errA.textContent = ''; el.removeAttribute('aria-invalid');
      g.amount = c;
      if (g.fee.type === 'fixed') g.fee.value = Math.min(g.fee.value, g.amount * H.totalHands(g));
      renderAll('settings');
      return;
    }
    if (field === 'startDate') {
      var errS = $('#err-start');
      if (!H.isYmd(el.value)) { errS.textContent = 'Pick a valid date.'; return; }
      errS.textContent = '';
      g.startDate = el.value;
      renderAll('settings');
      return;
    }
    if (field === 'frequency' && el.checked) { g.frequency = el.value; renderAll('settings'); return; }
    if (field === 'sundayRule' && el.checked) { g.sundayRule = el.value; renderAll('settings'); return; }
    if (field === 'feeType' && el.checked) { g.fee = { type: el.value, value: el.value === 'percent' ? 2 : el.value === 'fixed' ? 20000 : 0 }; renderAll(); return; }
    if (field === 'feeValue') {
      var v = parseFloat(el.value);
      if (!isFinite(v) || v < 0) return;
      g.fee.value = g.fee.type === 'fixed' ? Math.round(v * 100) : Math.min(20, v);
      renderAll('settings');
    }
  }

  function onSubmit(e) {
    var form = e.target.closest('[data-form="add-member"]');
    if (!form) return;
    e.preventDefault();
    var g = activeGroup();
    var input = $('#newMember');
    var name = H.cleanText(input.value, 40);
    var errEl = $('#memberErr');
    if (!name) { errEl.textContent = 'Type a name first.'; input.focus(); return; }
    if (g.members.length >= H.MAX_MEMBERS) { errEl.textContent = 'Up to ' + H.MAX_MEMBERS + ' members per group.'; return; }
    g.members.push({ id: H.uid('m'), name: name, hands: 1 });
    renderAll();
    $('#newMember').focus();
    toast(name + ' added. Their ulo is placed at the end of the order.');
  }

  function onKeydown(e) {
    var tab = e.target.closest && e.target.closest('[role="tab"]');
    if (!tab || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End')) return;
    var tabs = Array.prototype.slice.call(doc.querySelectorAll('[role="tab"]'));
    var i = tabs.indexOf(tab);
    if (e.key === 'ArrowRight') i = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') i = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') i = 0;
    if (e.key === 'End') i = tabs.length - 1;
    e.preventDefault();
    showTab(tabs[i].getAttribute('data-tab'), true);
    save();
  }

  /* ------------------------------------------------------------------- boot */
  function boot() {
    var t = null;
    try { t = window.localStorage.getItem(THEME_KEY); } catch (e) { t = null; }
    applyTheme(t);
    load();
    var v = $('#appVersion');
    if (v) v.textContent = H.VERSION;
    doc.addEventListener('click', onClick);
    doc.addEventListener('input', onInput);
    doc.addEventListener('change', function (e) {
      if (e.target.id === 'importFile' && e.target.files && e.target.files[0]) {
        var file = e.target.files[0];
        if (file.size > 1048576) { $('#importErr').textContent = 'That file is larger than 1 MB. Choose a Hulog backup file.'; return; }
        var reader = new FileReader();
        reader.onload = function () { $('#importText').value = String(reader.result); doImport(String(reader.result)); };
        reader.readAsText(file);
      }
    });
    doc.addEventListener('submit', onSubmit);
    doc.addEventListener('keydown', onKeydown);
    $('#groupSelect').addEventListener('change', function (e) { state.activeId = e.target.value; renderAll(); });
    renderAll();
    // Refresh "today" after midnight in Manila so statuses roll over.
    setInterval(function () {
      var t2 = H.todayManila();
      if (t2 !== today) { today = t2; renderAll(); }
    }, 60000);
    if (!isStandalone && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      try { navigator.serviceWorker.register('sw.js').catch(function () { /* offline mode is optional */ }); } catch (e) { /* ignore */ }
    }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
