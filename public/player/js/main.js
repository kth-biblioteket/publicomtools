'use strict';
// Start och styrning: inskrivning, inställningar, rotation och statusrapporter mot publicomtools.
(function (PP) {
  var VERSION = '0.1.0';
  var CLIENT_VERSION = 1;
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
  var lastHeartbeat = 0;
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

    var sig = JSON.stringify([pagesRaw, scheduleRaw, seconds, scripts]);
    if (sig === appliedSignature) return;
    appliedSignature = sig;
    rotator.configure({
      defaultList: schedule.parsePages(pagesRaw, seconds, null),
      schedule: schedule.parseSchedule(scheduleRaw, seconds),
      scripts: scripts,
      onLoaded: function () {},
    });
    rotator.start();
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

  /** Token som inte godtas längre: tillbaka till inskrivning */
  function reenroll(message) {
    rotator.stop();
    appliedSignature = null;
    clearTimeout(heartbeatTimer);
    clearTimeout(configTimer);
    PP.ui.showEnroll(enroll, message);
  }

  function sendHeartbeat() {
    if (!client.isEnrolled() || Date.now() - lastHeartbeat < MIN_HEARTBEAT_GAP_MS) return;
    lastHeartbeat = Date.now();
    client.heartbeat(status()).then(function (res) {
      if (res && res.reload) loadConfig();
    }, function (err) {
      if (err.status === 401) reenroll(err.message);
    });
  }

  function scheduleHeartbeat() {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(function () {
      sendHeartbeat();
      scheduleHeartbeat();
    }, heartbeatMinutes * 60000);
  }

  function loadConfig() {
    clearTimeout(configTimer);
    client.fetchConfig().then(function (config) {
      store.setConfig(config);
      apply(config);
      sendHeartbeat();
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
    PP.ui.init();
    rotator = new PP.Rotator(document.getElementById('frame-a'), document.getElementById('frame-b'), PP.ui);
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
