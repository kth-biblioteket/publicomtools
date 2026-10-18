'use strict';
// Rotationen, portad från SignageScreen.java och signage-run.js: sidorna i spellistan som gäller nu visas i tur och ordning
// i helskärm. Två iframes ligger över varandra, båda synliga (annars stryps skripten), den aktiva överst. Nästa sida laddas i
// den andra bakom en stund före bytet och byts in först när den hunnit rita klart. En sida som inte går att ladda visar
// felsidan (utan knappar) och laddas om av sig själv; rotationen går vidare i vanlig tid.
// Innan en sida läggs i en ram kontrolleras den med fetch (HEAD): sidovagnens bildsidor (sign/s/<id>) svarar med CORS och
// statuskod (503 = ingen bild finns, 404 = okänt id). Andra sidor utan CORS prövas med no-cors (nätverksfel eller ej) och
// godkänns sedan på onload.
(function (PP) {
  var schedule = PP.schedule;

  var RETRY_MS = 30000;          // sidfel provas igen efter så här länge
  var RETRY_NET_MS = 10000;      // nätverksfel provas igen snabbare
  var SKIP_MS = 10000;           // en misslyckad sida lämnas efter så här länge (om listan har fler sidor)
  var PRELOAD_S = 10;            // nästa sida börjar laddas så här många sekunder före bytet
  var SETTLE_MS = 1500;          // tid efter laddning för att skripten ska hinna rita klart
  var MAX_WAIT_MS = 10000;       // väntar högst så här länge på en sida som inte är färdig vid bytet
  var SINGLE_RELOAD_MS = 600000; // en enda sida laddas om med jämna mellanrum
  var TICK_MS = 20000;           // schemat kontrolleras så ofta
  var PROBE_TIMEOUT_MS = 20000;  // sidovagnens första bild kan ta ~15 s
  var LOAD_TIMEOUT_MS = 30000;   // en sida som inte laddats klart efter så här länge räknas som misslyckad
  var BLANK = 'about:blank';

  function withTimeout(promise, ms, onTimeout) {
    var timer;
    var timeout = new Promise(function (resolve) {
      timer = setTimeout(function () { resolve(onTimeout); }, ms);
    });
    return Promise.race([promise, timeout]).then(function (r) {
      clearTimeout(timer);
      return r;
    });
  }

  /** 'ok' (sidan svarade), 'http' (felkod), 'net' (nätverk eller tidsgräns) eller 'unknown' (nåbar men ingen CORS) */
  function probe(url) {
    var check = fetch(url, { method: 'HEAD', cache: 'no-store', credentials: 'omit' }).then(function (res) {
      if (res.ok) return 'ok';
      return res.status === 405 || res.status === 501 ? 'unknown' : 'http';
    }, function () {
      // CORS saknas eller nätverksfel: no-cors skiljer dem åt (avvisas bara om servern inte nås)
      return fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', credentials: 'omit' }).then(function () {
        return 'unknown';
      }, function () {
        return 'net';
      });
    });
    return withTimeout(check, PROBE_TIMEOUT_MS, 'net');
  }

  /** En iframe med sin laddningsstatus */
  function Frame(el) {
    this.el = el;
    this.token = 0;
    this.timer = null;
    this.onChange = function () {};
    var self = this;
    el.addEventListener('load', function () { self.loaded(); });
    this.reset();
  }

  Frame.prototype.reset = function () {
    this.url = '';
    this.loading = false;
    this.ok = false;
    this.failed = false;
    this.netError = false;
    this.okAt = 0;
  };

  Frame.prototype.load = function (url, scripts) {
    var self = this;
    var token = ++this.token;
    clearTimeout(this.timer);
    this.reset();
    this.url = url;
    this.loading = true;
    probe(url).then(function (result) {
      if (token !== self.token) return;
      if (result === 'http' || result === 'net') return self.fail(result === 'net');
      self.el.setAttribute('sandbox', scripts ? 'allow-scripts allow-same-origin' : 'allow-same-origin');
      self.el.src = url;
      self.timer = setTimeout(function () {
        if (token === self.token) self.fail(false);
      }, LOAD_TIMEOUT_MS);
    });
  };

  Frame.prototype.loaded = function () {
    if (!this.loading || this.el.getAttribute('src') === BLANK) return;
    clearTimeout(this.timer);
    this.loading = false;
    this.ok = true;
    this.okAt = Date.now();
    this.onChange();
  };

  Frame.prototype.fail = function (net) {
    clearTimeout(this.timer);
    this.loading = false;
    this.ok = false;
    this.failed = true;
    this.netError = net;
    this.onChange();
  };

  /** Släpper sidan (stoppar skript och film) */
  Frame.prototype.clear = function () {
    this.token++;
    clearTimeout(this.timer);
    this.reset();
    this.el.src = BLANK;
  };

  Frame.prototype.hasFailed = function () {
    return this.failed && !this.ok;
  };

  function Rotator(elA, elB, ui) {
    var self = this;
    this.ui = ui;
    this.frames = [new Frame(elA), new Frame(elB)];
    this.frames.forEach(function (f, n) {
      f.onChange = function () { if (n === self.active) self.settle(); };
    });
    this.timers = {};
    this.cfg = { defaultList: [], schedule: null, scripts: true, onLoaded: function () {} };
    this.list = [];
    this.index = 0;
    this.active = 0;
    this.running = false;
    this.black = false;
    this.currentKey = '';
    this.generation = 0;
    window.addEventListener('online', function () { self.retryNow(); });
  }

  Rotator.prototype.later = function (name, fn, ms) {
    var timers = this.timers;
    clearTimeout(timers[name]);
    timers[name] = setTimeout(function () {
      delete timers[name];
      fn();
    }, ms);
  };

  Rotator.prototype.cancel = function (name) {
    clearTimeout(this.timers[name]);
    delete this.timers[name];
  };

  Rotator.prototype.cancelAll = function () {
    for (var name in this.timers) clearTimeout(this.timers[name]);
    this.timers = {};
  };

  /** cfg: { defaultList, schedule, scripts, onLoaded(ok) } */
  Rotator.prototype.configure = function (cfg) {
    this.cfg = cfg;
  };

  /** Är sidan som visas laddad? null: ingen sida visas (stoppad eller svart skärm) */
  Rotator.prototype.pageLoaded = function () {
    if (!this.running || this.black) return null;
    return this.frames[this.active].ok;
  };

  /** Startar (eller startar om) rotationen */
  Rotator.prototype.start = function () {
    this.stop();
    this.running = true;
    this.active = 0;
    this.raise();
    this.currentKey = '';
    this.applySchedule(true);
    var self = this;
    var tick = function () {
      if (!self.running) return;
      self.applySchedule(false);
      self.later('tick', tick, TICK_MS);
    };
    this.later('tick', tick, TICK_MS);
  };

  Rotator.prototype.stop = function () {
    this.running = false;
    this.cancelAll();
    this.frames.forEach(function (f) { f.clear(); });
    this.ui.error(false, false);
    this.ui.black(true);
  };

  /** Väljer listan som gäller nu (schema, annars standardlistan, eller svart skärm) och startar den om den ändrats */
  Rotator.prototype.applySchedule = function (first) {
    var now = new Date();
    var c = schedule.choose(this.cfg.schedule, now);
    var shown = c.pages;
    var key = c.key;
    if (!c.black && shown === null) {
      shown = schedule.on(this.cfg.defaultList, schedule.today(now));
      key = 'default#' + schedule.signature(shown);
    }
    if (!first && key === this.currentKey) return;
    // Från svart skärm eller en sida som inte gick att ladda: den nya listan börjar direkt (inget att visa bakom)
    var direct = first || this.black || this.frames[this.active].hasFailed();
    this.currentKey = key;
    this.generation++;
    this.cancel('preload');
    this.cancel('swap');
    this.cancel('retry');
    this.cancel('skip');
    this.cancel('single');
    this.cancel('drop'); // annars kunde en gammal släppning tömma ramen som just förladdats
    var self = this;
    // Svart skärm (schemat säger off, eller listan är tom): sidorna släpps och inget visas
    if (c.black || !shown.length) {
      this.black = true;
      this.frames.forEach(function (f) { f.clear(); });
      this.ui.error(false, false);
      this.ui.black(true);
      this.cfg.onLoaded(null);
      return;
    }
    this.black = false;
    this.ui.black(false);
    this.list = shown;
    if (direct) {
      this.ui.error(false, false);
      this.show(0);
    } else {
      // Byte av lista: börja direkt på första sidan i den nya, förladdad bakom den som visas
      this.frames[1 - this.active].load(this.list[0].url, this.cfg.scripts);
      var g = ++this.generation;
      this.later('swap', function () { self.swapTo(0, 0, g); }, 800);
    }
    // En enda sida laddas om med jämna mellanrum
    if (this.list.length === 1) {
      var reload = function () {
        if (!self.running || self.list.length !== 1) return;
        self.frames[self.active].load(self.list[0].url, self.cfg.scripts);
        self.later('single', reload, SINGLE_RELOAD_MS);
      };
      this.later('single', reload, SINGLE_RELOAD_MS);
    }
  };

  /** Nätet kom tillbaka: försök igen direkt */
  Rotator.prototype.retryNow = function () {
    if (!this.running || this.black || !this.list.length) return;
    if (this.frames[this.active].hasFailed()) this.frames[this.active].load(this.list[this.index].url, this.cfg.scripts);
  };

  Rotator.prototype.show = function (i) {
    this.index = i;
    this.frames[this.active].load(this.list[i].url, this.cfg.scripts);
    this.scheduleNext();
  };

  /** Den aktiva ramen överst */
  Rotator.prototype.raise = function () {
    var active = this.active;
    this.frames.forEach(function (f, n) { f.el.style.zIndex = n === active ? 2 : 1; });
  };

  /** Visar felsidan så länge den aktuella sidan inte har kunnat laddas, och försöker igen */
  Rotator.prototype.settle = function () {
    var self = this;
    var cur = this.frames[this.active];
    var failed = cur.hasFailed();
    // Ett fel som beror på nätverket (DNS, anslutning, tidsgräns) räknas som nätverk även om länken är uppe
    var net = failed && (cur.netError || navigator.onLine === false);
    this.ui.error(failed, net);
    this.cfg.onLoaded(cur.ok);
    this.cancel('retry');
    this.cancel('skip');
    if (!failed) return;
    this.later('retry', function () {
      if (self.running && self.list.length) cur.load(self.list[self.index].url, self.cfg.scripts);
    }, net ? RETRY_NET_MS : RETRY_MS);
    if (this.list.length > 1) this.later('skip', function () { self.skip(); }, SKIP_MS);
  };

  /** Den aktiva sidan gick inte att ladda: rotationen går vidare till nästa, som laddas direkt */
  Rotator.prototype.skip = function () {
    var self = this;
    if (!this.running || this.list.length < 2 || !this.frames[this.active].hasFailed()) return;
    var next = (this.index + 1) % this.list.length;
    var g = ++this.generation;
    this.frames[1 - this.active].load(this.list[next].url, this.cfg.scripts);
    this.later('swap', function () { self.swapTo(next, 0, g); }, 500);
  };

  /** Planerar förladdning och byte för sidan som visas nu */
  Rotator.prototype.scheduleNext = function () {
    var self = this;
    this.cancel('preload');
    if (this.list.length < 2) return;
    var p = this.list[this.index];
    var next = (this.index + 1) % this.list.length;
    var lead = Math.min(PRELOAD_S, Math.max(1, p.seconds - 2));
    var g = ++this.generation;
    this.later('preload', function () {
      if (!self.running || g !== self.generation) return;
      self.frames[1 - self.active].load(self.list[next].url, self.cfg.scripts);
      self.later('swap', function () { self.swapTo(next, 0, g); }, lead * 1000);
    }, (p.seconds - lead) * 1000);
  };

  /** Byter till den förladdade ramen när nästa sida är klar (eller efter MAX_WAIT_MS) */
  Rotator.prototype.swapTo = function (next, waited, g) {
    var self = this;
    if (!this.running || g !== this.generation) return;
    var standby = this.frames[1 - this.active];
    var ready = standby.ok && Date.now() - standby.okAt >= SETTLE_MS;
    if (!ready && !standby.failed && waited < MAX_WAIT_MS) {
      this.later('swap', function () { self.swapTo(next, waited + 500, g); }, 500);
      return;
    }
    var old = this.active;
    this.active = 1 - this.active;
    this.index = next;
    this.raise();
    this.settle();
    // Den gamla ramen släpps (stoppar skript och film) så att den är tom när den blir nästa förladdningsram
    this.later('drop', function () {
      if (self.active !== old) self.frames[old].clear();
    }, 1000);
    this.scheduleNext();
  };

  PP.Rotator = Rotator;
})(window.PP);
