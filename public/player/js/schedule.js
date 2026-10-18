'use strict';
// SIGN_PAGES och SIGN_SCHEDULE: vilka sidor som gäller nu. Portad från SignSchedule.java och SignageScreen.java (PubLiKiosk),
// som Linux-kiosken och admin räknar. Ren logik utan webbläsarberoenden, så den går att prova i Node (tests/schedule.test.js).
// Schema (JSON): {"lists":{"Dag":[{"url":"https://…","s":30}]},"periods":{"Bokrea":["2026-10-20","2026-10-31"]},
// "slots":[{"list":"Dag","days":[1,2,3,4,5],"from":"08:00","to":"19:00"},{"list":"Bokrea","dates":["2026-10-20","2026-10-31"]}],"off":false}
// days 1-7 = måndag-söndag; from/to "HH:MM" där to inte ingår ("24:00" = midnatt); dates [första, sista] inklusive;
// ett fält som saknas = alltid; from efter to är ogiltigt (raden hoppas över). Bland raderna som gäller nu vinner den
// första med dates, annars den första utan. Ingen rad gäller: standardlistan (SIGN_PAGES), eller svart skärm om off.
(function (root) {
  var MIN_S = 5, MAX_S = 3600, MAX_PAGES = 36;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function clamp(s, def) {
    return s <= 0 ? def : Math.max(MIN_S, Math.min(MAX_S, s));
  }

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  /** Dagen som YYYY-MM-DD i enhetens lokala tid */
  function today(d) {
    return pad(d.getFullYear(), 4) + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2);
  }

  function isHttps(u) {
    return /^https:\/\/[^\/?#\s]+/.test(u);
  }

  function dateField(o, key) {
    return typeof o[key] === 'string' && DATE_RE.test(o[key]) ? o[key] : null;
  }

  function add(out, url, seconds, def, start, end) {
    var u = typeof url === 'string' ? url.trim() : '';
    if (!isHttps(u) || out.length >= MAX_PAGES) return;
    var s = def;
    if (seconds !== null && seconds !== undefined) {
      var text = String(seconds).trim();
      s = /^[+-]?\d+$/.test(text) ? clamp(parseInt(text, 10), def) : def;
    }
    out.push({ url: u, seconds: s, start: start, end: end });
  }

  function fromArray(array, def) {
    var out = [];
    for (var i = 0; i < array.length; i++) {
      var o = array[i];
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        add(out, o.url, o.s === undefined ? null : o.s, def, dateField(o, 'start'), dateField(o, 'end'));
      }
    }
    return out;
  }

  /**
   * SIGN_PAGES: en JSON-lista [{"url":"https://…","s":30}] eller en rad per sida "https://adress|sekunder" (rader skiljs av
   * radbrytning eller bokstavliga \n). Bara https, högst 36. Utan sidor: reservadressen, annars en tom lista.
   */
  function parsePages(raw, defaultSeconds, fallbackUrl) {
    var def = clamp(defaultSeconds, 30);
    var text = typeof raw === 'string' ? raw.trim() : '';
    var out = [];
    if (text.charAt(0) === '[') {
      try {
        var array = JSON.parse(text);
        if (Array.isArray(array)) out = fromArray(array, def);
      } catch (e) {
        // ogiltig JSON: ingen lista (tolkas inte som rader)
      }
    } else if (text) {
      var lines = text.indexOf('\n') >= 0 ? text.split(/\r?\n/) : text.split('\\n');
      lines.forEach(function (line) {
        if (!line.trim()) return;
        var bar = line.lastIndexOf('|');
        if (bar > 0 && /^\d+$/.test(line.substring(bar + 1).trim())) add(out, line.substring(0, bar), line.substring(bar + 1), def, null, null);
        else add(out, line, null, def, null, null);
      });
    }
    if (!out.length && fallbackUrl) add(out, fallbackUrl, null, def, null, null);
    return out;
  }

  /** "HH:MM" till minuter (24:00 = 1440), annars -1 */
  function minutes(t) {
    if (typeof t !== 'string' || !/^\d{1,2}:\d{2}$/.test(t)) return -1;
    var h = parseInt(t.substring(0, t.indexOf(':')), 10);
    var m = parseInt(t.substring(t.indexOf(':') + 1), 10);
    if (m > 59 || h > 24 || (h === 24 && m !== 0)) return -1;
    return h * 60 + m;
  }

  function validDate(d) {
    return typeof d === 'string' && DATE_RE.test(d);
  }

  /** En rad i schemat, eller null om den är ogiltig */
  function parseSlot(o) {
    if (!o || typeof o !== 'object') return null;
    var s = { list: typeof o.list === 'string' ? o.list : '', days: null, from: 0, to: 1440, dateFrom: null, dateTo: null };
    if (Array.isArray(o.days)) {
      s.days = [];
      for (var i = 0; i < o.days.length; i++) {
        var d = Number(o.days[i]);
        if (!(d >= 1 && d <= 7) || d !== Math.floor(d)) return null;
        s.days.push(d);
      }
    }
    if (o.from !== undefined) {
      s.from = minutes(String(o.from));
      if (s.from < 0) return null;
    }
    if (o.to !== undefined) {
      s.to = minutes(String(o.to));
      if (s.to < 0) return null;
    }
    if (s.from > s.to) return null;
    if (Array.isArray(o.dates) && o.dates.length > 0) {
      s.dateFrom = String(o.dates[0]);
      s.dateTo = o.dates.length > 1 ? String(o.dates[1]) : s.dateFrom;
      if (!validDate(s.dateFrom) || !validDate(s.dateTo) || s.dateFrom > s.dateTo) return null;
    }
    return s;
  }

  /** SIGN_SCHEDULE. Ogiltig eller tom text ger null (då gäller bara SIGN_PAGES) */
  function parseSchedule(raw, defaultSeconds) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    var o;
    try {
      o = JSON.parse(raw.trim());
    } catch (e) {
      return null;
    }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    var def = clamp(defaultSeconds, 30);
    var s = { lists: {}, periods: {}, slots: [], off: o.off === true };
    if (o.lists && typeof o.lists === 'object') {
      Object.keys(o.lists).forEach(function (name) {
        if (Array.isArray(o.lists[name])) s.lists[name] = fromArray(o.lists[name], def);
      });
    }
    if (o.periods && typeof o.periods === 'object') {
      Object.keys(o.periods).forEach(function (name) {
        var a = o.periods[name];
        if (!Array.isArray(a) || a.length !== 2) return;
        var first = String(a[0]), last = String(a[1]);
        if (validDate(first) && validDate(last) && first <= last) s.periods[name] = [first, last];
      });
    }
    if (Array.isArray(o.slots)) {
      o.slots.forEach(function (raw) {
        var slot = parseSlot(raw);
        // En okänd lista, ogiltiga dagar, tider eller datum, eller from efter to: raden hoppas över
        if (slot && Object.prototype.hasOwnProperty.call(s.lists, slot.list)) s.slots.push(slot);
      });
    }
    return s;
  }

  /** Sidorna som gäller på dagen (YYYY-MM-DD) */
  function on(pages, date) {
    return pages.filter(function (p) {
      return (p.start === null || date >= p.start) && (p.end === null || date <= p.end);
    });
  }

  /** Nyckel för vilka sidor som visas, så att en ändring (en sida går ut eller börjar gälla) märks */
  function signature(pages) {
    return pages.map(function (p) { return p.url; }).join('|');
  }

  function matches(slot, now, date) {
    var dow = (now.getDay() + 6) % 7 + 1; // måndag = 1 … söndag = 7
    if (slot.days && slot.days.indexOf(dow) < 0) return false;
    var minute = now.getHours() * 60 + now.getMinutes();
    if (minute < slot.from || minute >= slot.to) return false;
    if (slot.dateFrom !== null && (date < slot.dateFrom || date > slot.dateTo)) return false;
    return true;
  }

  /**
   * Listan som gäller vid now: {key, pages, black}. pages null och inte black: standardlistan.
   * schedule är null när SIGN_SCHEDULE saknas eller är ogiltig.
   */
  function choose(schedule, now) {
    if (!schedule) return { key: 'default', pages: null, black: false };
    var date = today(now);
    var dated = null, plain = null;
    schedule.slots.forEach(function (s) {
      // En lista vars period inte gäller idag hoppas över, som en okänd lista
      var per = schedule.periods[s.list];
      if (per && (date < per[0] || date > per[1])) return;
      if (!matches(s, now, date)) return;
      if (s.dateFrom !== null) {
        if (!dated) dated = s;
      } else if (!plain) plain = s;
    });
    var pick = dated || plain;
    var none = { key: schedule.off ? 'off' : 'default', pages: null, black: schedule.off };
    if (!pick) return none;
    // Sidor som inte gäller idag visas inte; ingen kvar: som en tom lista
    var list = on(schedule.lists[pick.list], date);
    if (!list.length) return none;
    return { key: 'list:' + pick.list + '#' + signature(list), pages: list, black: false };
  }

  var api = {
    MIN_S: MIN_S, MAX_S: MAX_S, MAX_PAGES: MAX_PAGES,
    clamp: clamp, today: today, parsePages: parsePages, parseSchedule: parseSchedule, on: on, signature: signature, choose: choose,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.PP = root.PP || {}).schedule = api;
})(this);
