'use strict';
// Start och styrning: inskrivning, inställningar, rotation och statusrapporter mot publicomtools.
(function (PP) {
  var VERSION = '0.1.18'; // höjs vid varje ändring av spelaren (syns som Spelare i admin); config.xml har samma
  var CLIENT_VERSION = 1;
  var CONFIG_POLL_MS = PP.configPollMs || 60000; // ändrad spellista slår igenom inom så här lång tid (PP.configPollMs bara för tests/poll.html)
  var CONFIG_RETRY_MS = 30000;
  var MIN_HEARTBEAT_GAP_MS = 10000;

  var client = PP.client, store = PP.store, schedule = PP.schedule;
  var rotator = null;
  var appliedSignature = null;
  var configVersion = '';
  var computerName = '';
  var heartbeatMinutes = 5;
  var heartbeatTimer = null;
  var configTimer = null;
  var firstFetch = true;
  var lastHeartbeat = 0;
  var awaitingLoaded = false;   // en rapport (start, ny version) gick innan sidan laddats: rapportera när den blivit laddad
  var startedAt = Date.now();

  function intValue(values, key, def, min, max) {
    var n = parseInt(values[key], 10);
    return isNaN(n) ? def : Math.max(min, Math.min(max, n));
  }

  function boolValue(values, key, def) {
    var v = values[key];
    if (v === undefined || v === null || v === '') return def;
    return v === true || /^(true|1|yes|on)$/i.test(String(v).trim());
  }

  /** ORIENTATION: vrider hela scenen (90, 180 eller 270 grader medurs), annars som skärmen visar */
  function applyOrientation(value) {
    var v = String(value || '').trim();
    var turn = /^(90|180|270)$/.test(v) ? v : '';
    document.documentElement.className = turn ? 'rot' + turn : '';
  }

  /** Inställningarna { values, version } tillämpas; rotationen startas om bara om något som syns ändrats */
  function apply(config) {
    var values = config.values || {};
    applyOrientation(values.ORIENTATION);
    var seconds = intValue(values, 'SIGN_SECONDS', 30, schedule.MIN_S, schedule.MAX_S);
    var scripts = boolValue(values, 'SIGN_JS', true);
    var pagesRaw = String(values.SIGN_PAGES || '').trim();
    var scheduleRaw = String(values.SIGN_SCHEDULE || '').trim();
    configVersion = config.version ? String(config.version) : '';
    computerName = String(values.COMPUTER_NAME || '');
    heartbeatMinutes = intValue(values, 'HEARTBEAT_INTERVAL', 5, 1, 60);

    if (window.PP_debug) {
      var parsedSchedule = schedule.parseSchedule(scheduleRaw, seconds);
      window.PP_debug('config ' + (config.version || '?') + ': SIGN_PAGES ' + pagesRaw.length + ' tecken, SIGN_SCHEDULE ' + scheduleRaw.length + ' tecken'
        + (scheduleRaw ? (parsedSchedule ? ' (tolkat: ' + Object.keys(parsedSchedule.lists).length + ' listor, ' + parsedSchedule.slots.length + ' rader' + (parsedSchedule.off ? ', off' : '') + ')' : ' (KUNDE INTE TOLKAS)') : '')
        + ', nycklar: ' + Object.keys(values).join(','));
    }

    if (window.PP_debug && /[?&]testvideo|debugtv/.test(window.location.search) && !window.PP_testVideoStarted) {
      window.PP_testVideoStarted = true;
      startTestVideo(config);
    }

    var sig = JSON.stringify([pagesRaw, scheduleRaw, seconds, scripts]);
    if (sig === appliedSignature) return;
    appliedSignature = sig;
    rotator.configure({
      defaultList: schedule.parsePages(pagesRaw, seconds, null),
      schedule: schedule.parseSchedule(scheduleRaw, seconds),
      scripts: scripts,
      onLoaded: pageStateChanged,
    });
    // En ändrad spellista byts in mjukt (den gamla sidan visas tills den nya är laddad); start() tömmer ramarna och visar svart
    if (rotator.running) rotator.applySchedule(false);
    else rotator.start();
  }

  /**
   * Felsökning (?debugtv): <video muted autoplay> direkt i toppsidan, ovanför varandra till höger: A1/A2 vår egen film (den första
   * uppladdade i configen, /api/sign/m/<id> -> /api/sign/f/<id>.mp4 respektive utan ändelse), B en film från w3schools och C en från Mozilla. Visar om skärmens
   * webbläsare startar video utanför en ram och om det är just vår server eller fil som den inte får data från. Ett tryck på
   * en knapp på fjärrkontrollen anropar play() på alla.
   */
  function startTestVideo(config) {
    var dbg = window.PP_debug;
    var text = JSON.stringify(config.values || {});
    var m = /\/api\/sign\/m\/([0-9a-f]+)/.exec(text);
    var sources = [];
    if (m) {
      sources.push(['A1 vår .mp4', client.baseUrl() + '/api/sign/f/' + m[1] + '.mp4']); // som filmsidan
      sources.push(['A2 vår utan', client.baseUrl() + '/api/sign/f/' + m[1]]);
    } else dbg('testvideo: ingen /api/sign/m/ i configen (A utelämnas)');
    sources.push(['B w3schools', 'https://www.w3schools.com/html/mov_bbb.mp4']);
    sources.push(['C mozilla', 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4']);
    var videos = [];
    sources.forEach(function (item, i) {
      var label = item[0], src = item[1];
      var v = document.createElement('video');
      v.muted = true; v.loop = true; v.autoplay = true;
      v.setAttribute('muted', ''); v.setAttribute('autoplay', ''); v.setAttribute('loop', ''); v.setAttribute('playsinline', '');
      var h = Math.floor(100 / sources.length);
      v.style.cssText = 'position:fixed;right:0;top:' + (i * h) + '%;width:40%;height:' + h + '%;z-index:500;background:#' + ['222', '225', '252', '522'][i % 4] + ';object-fit:contain';
      ['loadstart', 'loadedmetadata', 'canplay', 'playing', 'waiting', 'stalled', 'error', 'abort'].forEach(function (ev) {
        v.addEventListener(ev, function () { dbg('tv ' + label + ' ' + ev + (v.error ? ' FEL=' + v.error.code : '') + ' ready=' + v.readyState + ' ' + v.videoWidth + 'x' + v.videoHeight); });
      });
      document.documentElement.appendChild(v);
      v.src = src;
      videos.push(v);
      var p = v.play();
      if (p && p.then) p.then(function () { dbg('tv ' + label + ' play(): ok'); }, function (e) { dbg('tv ' + label + ' play(): ' + e.name + ' ' + e.message); });
      var n = 0, iv = setInterval(function () {
        dbg('tv ' + label + ': ' + (v.paused ? 'pausad' : 'spelar') + ' ready=' + v.readyState + ' net=' + v.networkState + ' t=' + Math.round(v.currentTime * 10) / 10);
        if (++n >= 4) clearInterval(iv);
      }, 3000);
    });
    document.addEventListener('keydown', function () {
      videos.forEach(function (v, i) {
        var q = v.play();
        if (q && q.then) q.then(function () { dbg('tv ' + sources[i][0] + ' efter tryck: ok'); }, function (e) { dbg('tv ' + sources[i][0] + ' efter tryck: ' + e.name); });
      });
    });
  }

  function osName() {
    var m = /Tizen ([\d.]+)/.exec(navigator.userAgent);
    return m ? 'Tizen ' + m[1] : 'Tizen';
  }

  function status() {
    var s = {
      clientVersion: CLIENT_VERSION,
      platform: 'tizen',
      host: client.host(),
      hostname: client.host(),
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      os: osName(),
      model: 'Samsung Tizen',
      appVersion: VERSION,
      intervalMinutes: heartbeatMinutes,
    };
    if (computerName) s.computerName = computerName;
    if (configVersion) s.configVersion = configVersion;
    var loaded = rotator.pageLoaded();
    if (loaded !== null) s.pageLoaded = loaded;
    return s;
  }

  /**
   * Sidan som visas har blivit laddad eller inte (ok; null = svart skärm). En rapport vid start eller ny version går
   * innan sidan hunnit laddas, så den första laddningen därefter rapporteras direkt. Senare växlingar (en sida i
   * rotationen som inte går att ladda) rapporteras bara av den vanliga statusrapporten, annars kommer extra rapporter
   * vid varje sidbyte.
   */
  function pageStateChanged(ok) {
    if (!awaitingLoaded || ok !== true) return;
    awaitingLoaded = false;
    sendHeartbeat(true);
  }

  /** Token som inte godtas längre: tillbaka till inskrivning */
  function reenroll(message) {
    rotator.stop();
    appliedSignature = null;
    clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
    clearTimeout(configTimer);
    firstFetch = true;
    PP.ui.showEnroll(enroll, message);
  }

  /** force: en ny version ska rapporteras direkt; annars hindrar MIN_HEARTBEAT_GAP_MS att reload-svar ger en snabb slinga */
  function sendHeartbeat(force) {
    if (!client.isEnrolled() || (!force && Date.now() - lastHeartbeat < MIN_HEARTBEAT_GAP_MS)) return;
    lastHeartbeat = Date.now();
    client.heartbeat(status()).then(function (res) {
      if (res && res.reload) loadConfig();
    }, function (err) {
      if (err.status === 401) reenroll(err.message);
    });
  }

  /** Statusrapport var HEARTBEAT_INTERVAL minut; startas en gång (inställningshämtningen får inte nollställa den) */
  function scheduleHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setTimeout(function () {
      heartbeatTimer = null;
      sendHeartbeat();
      scheduleHeartbeat();
    }, heartbeatMinutes * 60000);
  }

  /**
   * Hämtar inställningarna och gör det igen var CONFIG_POLL_MS. En skylt har ingen användare, så en ändrad spellista
   * ska slå igenom av sig själv i stället för att vänta på en reload eller omstart. En oförändrad version gör ingenting.
   */
  function loadConfig() {
    clearTimeout(configTimer);
    client.fetchConfig().then(function (config) {
      configTimer = setTimeout(loadConfig, CONFIG_POLL_MS); // först, så att ett fel längre ner inte stoppar hämtningen
      var changed = String(config.version || '') !== configVersion;
      if (changed || firstFetch) store.setConfig(config);
      apply(config);
      // Admin ska se den nya versionen direkt (och första rapporten kommer när inställningarna hämtats)
      if (changed || firstFetch) {
        awaitingLoaded = rotator.pageLoaded() !== true; // sidan hinner oftast inte laddas före rapporten
        sendHeartbeat(true);
      }
      firstFetch = false;
      scheduleHeartbeat();
    }, function (err) {
      if (err.status === 401) return reenroll(err.message);
      // Nätet eller publicomtools nere: senaste inställningarna fortsätter gälla, nytt försök strax
      configTimer = setTimeout(loadConfig, CONFIG_RETRY_MS);
    });
  }

  /** Engångskoden från admin byts mot enhetens token, sedan hämtas inställningarna */
  function enroll(url, code) {
    return client.enroll(url, code).then(function () {
      PP.ui.hideEnroll();
      store.remove('config');
      loadConfig();
    });
  }

  function boot() {
    if (window.PP_debug) window.PP_debug('start: version ' + VERSION + ', inskriven=' + client.isEnrolled());
    PP.ui.init();
    rotator = new PP.Rotator(document.getElementById('frame-a'), document.getElementById('frame-b'), PP.ui, document.getElementById('film'));
    if (!client.isEnrolled()) {
      PP.ui.showEnroll(enroll);
      return;
    }
    // De senaste inställningarna visas direkt, så skylten kommer igång även utan nät vid start
    var cached = store.getConfig();
    if (cached) apply(cached);
    loadConfig();
  }

  document.addEventListener('DOMContentLoaded', boot);
})(window.PP);
