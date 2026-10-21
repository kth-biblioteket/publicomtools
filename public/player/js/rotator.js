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
  var FADE_SETTLE_MS = 150;      // tid i svart efter att den nya filmen gått, innan bilden tonas in
  var FILM_LEAD_MS = 4000;       // en film som ska följa på en vanlig sida startas så här lång tid före bytet (högst sidans tid), under den sidan
  var FILM_WAIT_MS = 1500;       // går filmen inte vid bytet väntas så här länge på den innan en tonad start väljs
  var XFADE_MS = 300;            // övertoning när en sida byts mot en annan (bild till bild, film till bild, bild till film)
  var FADE_MS = 400;             // film till film: tona ut och in så här länge (samma tid som i css/player.css)
  var BLANK = 'about:blank';

  /** Skriver till felsökningsrutan (index.html?debug=1), annars ingenting */
  function dbg(text) {
    if (window.PP_debug) window.PP_debug(text);
  }

  function tail(url) {
    return String(url || '').replace(/^https?:\/\/[^\/]+/, '').slice(0, 60);
  }

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
    this.playTried = false;
    probe(url).then(function (result) {
      if (token !== self.token) return;
      dbg('kontroll ' + result + ' ' + tail(url));
      if (result === 'http' || result === 'net') return self.fail(result === 'net');
      // ?nosandbox (felsökning): ingen sandbox alls, för att se om den hindrar videon
      if (window.PP_debug && /[?&]nosandbox|debugns/.test(window.location.search)) self.el.removeAttribute('sandbox');
      else self.el.setAttribute('sandbox', scripts ? 'allow-scripts allow-same-origin' : 'allow-same-origin');
      self.el.src = url;
      self.timer = setTimeout(function () {
        if (token === self.token) self.fail(false);
      }, LOAD_TIMEOUT_MS);
    });
  };

  /** Felsökning: logga tillståndet för en <video> i ramen (går bara när ramens sida har samma origin som spelaren) */
  Frame.prototype.watchVideo = function () {
    if (!window.PP_debug) return;
    var self = this, token = this.token, tries = 0, last = '';
    var name = this.el.id === 'frame-a' ? 'A' : 'B';
    var iv = setInterval(function () {
      tries++;
      if (token !== self.token || tries > 8) return clearInterval(iv);
      try {
        var doc = self.el.contentDocument;
        if (!doc) { if (tries === 1) dbg('ram ' + name + ': contentDocument är null (annan origin eller inte klar)'); return; }
        var v = doc.querySelector('video');
        if (!v) {
          if (tries === 1 || tries === 4) {
            dbg('ram ' + name + ': ingen <video>; url=' + tail(doc.URL) + ' ready=' + doc.readyState + ' body=' + String(doc.body ? doc.body.innerHTML : '(ingen body)').slice(0, 100).replace(/\s+/g, ' '));
          }
          return;
        }
        if (!self.playTried) {
          // Eget play() bara i felsökningsläget: NotAllowedError = autoplay-policy, NotSupportedError = format
          self.playTried = true;
          var p = v.play();
          if (p && p.then) p.then(function () { dbg('play(): ok'); }, function (e) { dbg('play(): ' + e.name + ' ' + e.message); });
          else dbg('play(): anropat (inget löfte)');
        }
        var state = 'ram ' + name + ' video: ' + (v.paused ? 'pausad' : 'spelar') + ' ready=' + v.readyState + ' network=' + v.networkState
          + ' ' + v.videoWidth + 'x' + v.videoHeight + ' t=' + Math.round(v.currentTime * 10) / 10 + (v.muted ? ' muted' : '')
          + (v.error ? ' FEL=' + v.error.code : '') + (v.src ? ' src=' + tail(v.currentSrc || v.src) : '');
        if (state !== last) dbg(state);
        last = state;
      } catch (e) {
        if (tries === 1) dbg('ram ' + name + ': kan inte läsas (' + e.message + ')');
      }
    }, 2000);
  };

  Frame.prototype.loaded = function () {
    if (!this.loading || this.el.getAttribute('src') === BLANK) return;
    clearTimeout(this.timer);
    dbg('laddad ' + tail(this.url));
    this.watchVideo();
    this.loading = false;
    this.ok = true;
    this.okAt = Date.now();
    this.onChange();
  };

  Frame.prototype.fail = function (net) {
    clearTimeout(this.timer);
    dbg('MISSLYCKADES' + (net ? ' (nät)' : '') + ' ' + tail(this.url));
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

  function Rotator(elA, elB, ui, filmEl) {
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
    this.pageSince = 0;
    this.filmEl = filmEl || null; // spelarens egen <video id="film">
    this.filmOn = false;          // spelas en film i den just nu?
    this.filmOk = false;
    this.filmPre = null;          // film som startats under en vanlig sida inför ett byte
    this.filmCache = {};          // url -> filmens adress (text) eller false
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
    if (this.filmOn) return this.filmOk;
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
    this.fade(false);
    this.leaveFilm();
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
    if (!first && key === this.currentKey) {
      // Samma sidor: inget byte, men nya visningstider och inställningar gäller (de nya sidobjekten tar över listan)
      // Tiden schemaläggs bara om för den sida som visas om dess visningstid ändrats; annars startar varje kontroll (var 20:e s)
      // om förladdning och byte från noll, och sidan visas längre än inställt.
      if (shown && shown.length && this.running && !this.black) {
        var cur = this.list[this.index];
        this.list = shown;
        var changed = shown[this.index];
        if (cur && changed && cur.seconds !== changed.seconds) this.scheduleNext();
      }
      return;
    }
    dbg('lista: ' + key.slice(0, 60) + ' | sidor: ' + (shown ? shown.length : 0) + (c.black ? ' | svart (off)' : '') + ' | tid ' + now.toTimeString().slice(0, 8));
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
    this.cancel('fadein');
    this.cancel('filmstart');
    this.filmPre = null;
    this.fade(false);
    var self = this;
    // Svart skärm (schemat säger off, eller listan är tom): sidorna släpps och inget visas
    if (c.black || !shown.length) {
      this.black = true;
      this.leaveFilm();
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
      this.leaveFilm();
      this.raise();
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
    if (!this.running || this.black || !this.list.length || this.filmOn) return;
    if (this.frames[this.active].hasFailed()) this.frames[this.active].load(this.list[this.index].url, this.cfg.scripts);
  };

  Rotator.prototype.show = function (i) {
    var self = this;
    var url = this.list[i].url;
    var g = ++this.generation;
    this.index = i;
    this.pageSince = Date.now();
    // Är sidan en film spelas den i <video id="film">; svaret hinns med en kort stund (annars visas den som vanlig sida)
    withTimeout(this.learnFilm(url), 400, false).then(function () {
      if (!self.running || g !== self.generation) return;
      if (self.isFilm(url)) return self.enterFilm(i, g, true);
      self.frames[self.active].load(url, self.cfg.scripts);
      self.scheduleNext();
    });
  };

  /**
   * Den aktiva ramen överst. Den andra (förladdningen) ritas inte alls: Tizen spelar film på ett eget videoplan bakom webblagret och
   * gör ett hål i det där filmen ligger, så en synlig ram under skulle lysa igenom hålet (nästa sida syntes de sista 10 s av filmen).
   * visibility:hidden laddar sidan som vanligt men ritar ingenting. cross: den nya sidan tonas in över den gamla (XFADE_MS) och
   * den gamla döljs först när övertoningen är klar.
   */
  Rotator.prototype.raise = function (cross) {
    var self = this;
    var active = this.active;
    this.cancel('xhide');
    this.frames.forEach(function (f, n) {
      var st = f.el.style;
      st.zIndex = n === active ? 2 : 1;
      if (n === active) {
        st.transition = 'none';
        st.visibility = 'visible';
        if (cross) {
          st.opacity = '0';
          void f.el.offsetWidth; // utgångsläget ritas innan övertoningen börjar
          st.transition = 'opacity ' + XFADE_MS + 'ms linear';
        }
        st.opacity = '1';
      } else if (!cross) {
        st.visibility = 'hidden';
      }
    });
    if (cross) {
      this.later('xhide', function () {
        self.frames.forEach(function (f, n) { if (n !== self.active) f.el.style.visibility = 'hidden'; });
      }, XFADE_MS + 50);
    }
  };

  /**
   * Ramen har just blivit synlig. Den har förladdats (och en film i den har redan spelat i ca 10 s bakom den förra ramen), så
   * sidan får ett meddelande och kan börja om från början. Sidor som inte lyssnar påverkas inte.
   */
  Rotator.prototype.activate = function (frame) {
    try {
      if (frame.el.contentWindow) frame.el.contentWindow.postMessage('pp-activate', '*');
      dbg('aktiverar ' + tail(frame.url));
    } catch (e) {
      // ramen kan sakna fönster just då
    }
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

  /** Tonen över sidorna (finns inte i alla vyer, t.ex. i provet) */
  Rotator.prototype.fade = function (on) {
    if (this.ui.fade) this.ui.fade(on);
  };

  /**
   * Tar reda på om en sida är en filmsida från sidovagnen (/api/sign/m/<id> med <video src=...>); svaret hamnar i filmCache:
   * filmens adress (text), annars false. Bara sidovagnens mediasidor kontrolleras, andra sidor hämtas inte i förväg.
   */
  Rotator.prototype.learnFilm = function (url) {
    var cache = this.filmCache || (this.filmCache = {});
    if (url in cache) return cache[url] && typeof cache[url].then === 'function' ? cache[url] : Promise.resolve(cache[url]);
    if (!this.filmEl || url.indexOf('/api/sign/m/') < 0) { cache[url] = false; return Promise.resolve(false); }
    var known = fetch(url, { cache: 'no-store', credentials: 'omit' }).then(function (res) {
      if (!res.ok) throw new Error('http ' + res.status);
      return res.text();
    }).then(function (text) {
      var m = /<video[^>]*\ssrc=["']([^"']+)["']/i.exec(text);
      var src = false;
      if (m) { try { src = new URL(m[1], url).href; } catch (e) { src = false; } }
      cache[url] = src;
      return src;
    }, function () {
      delete cache[url]; // inget svar: sparas inte (provas igen nästa gång); den här gången visas sidan som vanlig sida
      return false;
    });
    cache[url] = known;
    return known;
  };

  /** Spelar den visade sidan en video i en ram? (går bara när ramens sida har samma origin som spelaren; annars false) */
  Rotator.prototype.framePlaying = function () {
    try {
      var doc = this.frames[this.active].el.contentDocument;
      var v = doc && doc.querySelector('video');
      return !!v && !v.paused && !v.ended;
    } catch (e) {
      return false;
    }
  };

  /** Är sidan en film som spelaren själv spelar (adressen är känd)? */
  Rotator.prototype.isFilm = function (url) {
    var c = this.filmCache && this.filmCache[url];
    return typeof c === 'string';
  };

  /**
   * Spelar en film i spelarens egen <video id="film">, en enda för alla filmer. Skärmen har en enda filmavkodare: filmer i ramar eller
   * flera videor samtidigt ger frysning, två kopior och skräp i bilden. Alla ramar töms därför först. Byte av film sker genom att
   * samma <video> får en ny adress. Bilden är svart en stund när avkodaren byter (ca 0,5 s), så anroparen har tonat ut skärmen;
   * den tonas in igen här när filmen går. direct: första sidan, ingen ton.
   */
  Rotator.prototype.enterFilm = function (index, g, direct) {
    var self = this;
    var v = this.filmEl;
    var url = this.list[index].url;
    var src = this.filmCache[url];
    var id = String(src).split('/').pop().split('?')[0];
    var t0 = Date.now();
    this.cancel('retry');
    this.cancel('skip');
    this.cancel('drop');
    this.cancel('leavefilm');
    this.ui.error(false, false);
    this.frames.forEach(function (f) { f.clear(); f.el.style.visibility = 'hidden'; });
    v.style.visibility = 'visible';
    v.muted = true;
    v.loop = true;
    try {
      v.src = src;
      var pr = v.play();
      if (pr && pr.catch) pr.catch(function () {});
    } catch (e) {
      // går inte att starta: tidsgränsen nedan visar felsidan
    }
    var poll = function () {
      if (!self.running || g !== self.generation) return;
      var started = !v.paused && v.currentTime > 0.05 && String(v.currentSrc || '').indexOf(id) >= 0;
      if (!started && !v.error && Date.now() - t0 < MAX_WAIT_MS) return self.later('swap', poll, 100);
      dbg('film ' + (started ? 'går' : 'startade inte') + ' ' + tail(url));
      self.filmOn = true;
      self.filmOk = started;
      self.index = index;
      self.pageSince = Date.now();
      self.cfg.onLoaded(started);
      if (!started) self.ui.error(true, false);
      if (!direct) self.later('fadein', function () { self.fade(false); }, FADE_SETTLE_MS);
      self.scheduleNext();
    };
    this.later('swap', poll, 100);
  };

  /** Släpper filmen (stoppar den och tömmer <video>) */
  Rotator.prototype.leaveFilm = function () {
    var v = this.filmEl;
    this.filmOn = false;
    this.filmOk = false;
    if (!v) return;
    try { v.pause(); } catch (e) { /* ingen film */ }
    v.removeAttribute('src');
    try { v.load(); } catch (e) { /* ingen film */ }
    v.style.visibility = 'hidden';
  };

  /**
   * En film som följer på en vanlig sida (bild eller webbsida) startas i <video id="film"> under den sidan en kort stund före bytet.
   * Sidan är ogenomskinlig och täcker filmen; ingen annan video finns som kan störa avkodaren. Vid bytet döljs ramen och filmen
   * hoppar till början, utan ton och utan svart bild.
   */
  Rotator.prototype.startFilmUnder = function (index) {
    var v = this.filmEl;
    var src = this.filmCache[this.list[index].url];
    this.filmPre = { index: index, src: src, id: String(src).split('/').pop().split('?')[0] };
    v.muted = true;
    v.loop = true;
    v.style.visibility = 'visible';
    try {
      v.src = src;
      var pr = v.play();
      if (pr && pr.catch) pr.catch(function () {});
    } catch (e) {
      // faller tillbaka på tonad start vid bytet
    }
  };

  /** Går filmen som startats under sidan (startUnder)? */
  Rotator.prototype.filmUnderReady = function (index) {
    var v = this.filmEl, pre = this.filmPre;
    return !!pre && pre.index === index && !v.paused && v.currentTime > 0.05 && String(v.currentSrc || '').indexOf(pre.id) >= 0;
  };

  /** Byter till filmen som går under sidan: ramen döljs och filmen börjar om från början */
  Rotator.prototype.cutToFilm = function (index) {
    var self = this;
    var v = this.filmEl;
    this.cancel('retry');
    this.cancel('skip');
    this.cancel('drop');
    this.cancel('leavefilm');
    this.ui.error(false, false);
    try { v.currentTime = 0; } catch (e) { /* börjar där den är */ }
    // Sidan som täcker filmen tonas ut (XFADE_MS) och ramarna töms först sedan
    var cover = this.frames[this.active].el;
    cover.style.transition = 'opacity ' + XFADE_MS + 'ms linear';
    cover.style.opacity = '0';
    this.later('xhide', function () {
      self.frames.forEach(function (f) { f.clear(); f.el.style.visibility = 'hidden'; });
    }, XFADE_MS + 50);
    this.filmPre = null;
    this.filmOn = true;
    this.filmOk = true;
    this.index = index;
    this.pageSince = Date.now();
    dbg('film tas fram under sidan ' + tail(this.list[index].url));
    this.cfg.onLoaded(true);
    this.scheduleNext();
  };

  /** Planerar förladdning och byte för sidan som visas nu */
  Rotator.prototype.scheduleNext = function () {
    var self = this;
    this.cancel('preload');
    this.cancel('filmstart');
    // En film som startats under en sida men inte tagits fram (planen ändrades) släpps
    if (!this.filmOn && this.filmPre) { this.filmPre = null; this.leaveFilm(); }
    if (this.list.length < 2) return;
    var p = this.list[this.index];
    var next = (this.index + 1) % this.list.length;
    // Tiden räknas från när sidan började visas (pageSince), så en ny planering mitt i visningen ger inte en längre visning
    var remaining = Math.max(0, p.seconds * 1000 - (Date.now() - this.pageSince));
    var leadMs = Math.min(Math.min(PRELOAD_S, Math.max(1, p.seconds - 2)) * 1000, remaining);
    var g = ++this.generation;
    this.learnFilm(this.list[next].url);
    this.later('preload', function () {
      if (!self.running || g !== self.generation) return;
      var nextUrl = self.list[next].url;
      // Beslutet om nästa sida är en film väntar på svaret (högst en kort stund), i stället för att gissa
      withTimeout(self.learnFilm(nextUrl), 1500, false).then(function () {
        if (!self.running || g !== self.generation) return;
        if (self.isFilm(nextUrl)) {
          // En film som visas i en ram (gick inte att känna igen) räknas som en film som spelar
          if (!self.filmOn && !self.framePlaying()) {
            // Efter en vanlig sida: filmen startas under den en kort stund före bytet och tas fram utan ton, om den går
            self.later('filmstart', function () {
              if (!self.running || g !== self.generation) return;
              self.startFilmUnder(next);
            }, Math.max(0, leadMs - FILM_LEAD_MS));
            self.later('swap', function () {
              var waited = 0;
              var check = function () {
                if (!self.running || g !== self.generation) return;
                if (self.filmUnderReady(next)) return self.cutToFilm(next);
                // Startar filmen långsamt väntas en kort stund på den (sidan visas lite längre) innan en tonad start väljs
                if (waited < FILM_WAIT_MS) { waited += 100; return self.later('swap', check, 100); }
                self.fade(true);
                self.later('swap', function () {
                  if (!self.running || g !== self.generation) return;
                  self.enterFilm(next, g, false);
                }, FADE_MS);
              };
              check();
            }, leadMs);
            return;
          }
          // Efter en film: skärmen har en enda filmavkodare, så filmen byts på plats under en ton (utton, byte, inton)
          self.later('swap', function () {
            if (!self.running || g !== self.generation) return;
            self.fade(true);
            self.later('swap', function () {
              if (!self.running || g !== self.generation) return;
              self.enterFilm(next, g, false);
            }, FADE_MS);
          }, Math.max(0, leadMs - FADE_MS));
          return;
        }
        self.frames[1 - self.active].load(nextUrl, self.cfg.scripts);
        self.later('swap', function () { self.swapTo(next, 0, g); }, leadMs);
      });
    }, remaining - leadMs);
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
    this.pageSince = Date.now();
    this.raise(true);
    this.settle();
    this.activate(this.frames[this.active]);
    // Den gamla ramen släpps (stoppar skript och film) så att den är tom när den blir nästa förladdningsram
    this.later('drop', function () {
      if (self.active !== old) self.frames[old].clear();
    }, 1000);
    // En film som spelats under ramarna släpps när den nya sidan täcker den
    if (this.filmOn) this.later('leavefilm', function () { self.leaveFilm(); }, 1000);
    this.scheduleNext();
  };

  PP.Rotator = Rotator;
})(window.PP);
