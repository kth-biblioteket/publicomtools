'use strict';
// Anslutningen till publicomtools, samma protokoll som PubLiKiosk (PublicomClient.java): inskrivning med engångskod,
// inställningar och statusrapporter med bärartoken. Alla anrop returnerar ett löfte; fel är Error med status (0 = nätverk).
(function (PP) {
  var store = PP.store;
  var DEFAULT_URL = 'https://apps.lib.kth.se/publicomtools';
  var TIMEOUT_MS = 20000;

  function fail(message, status) {
    var e = new Error(message);
    e.status = status || 0;
    return e;
  }

  function isEnrolled() {
    return !!(store.get('token') && store.get('host'));
  }

  function baseUrl() {
    return store.get('url') || DEFAULT_URL;
  }

  /** Glöm anslutningen (t ex när token inte längre godtas) */
  function forget() {
    store.remove('token');
    store.remove('host');
  }

  /** "apps.lib.kth.se/publicomtools/" → "https://apps.lib.kth.se/publicomtools". Bara https (http enbart mot localhost för utveckling). */
  function normalizeBaseUrl(url) {
    var u = (url || '').trim() || DEFAULT_URL;
    if (u.indexOf('://') < 0) u = 'https://' + u;
    u = u.replace(/\/+$/, '');
    if (!/^https:\/\/[^\/]+/.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u)) {
      throw fail('Adressen måste börja med https://');
    }
    return u;
  }

  function request(method, url, token, body) {
    var headers = { Accept: 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    var init = { method: method, headers: headers, redirect: 'error', credentials: 'omit', cache: 'no-store' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    var timer;
    var timeout = new Promise(function (resolve, reject) {
      timer = setTimeout(function () { reject(fail('publicomtools svarade inte i tid')); }, TIMEOUT_MS);
    });
    var call = fetch(url, init).then(function (res) {
      return res.text().then(function (text) { return { status: res.status, body: text }; });
    }, function () {
      throw fail('Kunde inte nå publicomtools');
    });
    return Promise.race([call, timeout]).then(function (r) {
      clearTimeout(timer);
      return r;
    }, function (e) {
      clearTimeout(timer);
      throw e;
    });
  }

  function json(res, message) {
    try {
      return JSON.parse(res.body);
    } catch (e) {
      throw fail(message);
    }
  }

  /** Token som inte längre godtas (enheten har skrivits in på nytt i admin): koppla från */
  function checkAuth(res) {
    if (res.status === 401) {
      forget();
      throw fail('Enhetens nyckel godtas inte längre. Skriv in enheten på nytt.', 401);
    }
  }

  /** Engångskoden från admin byts mot enhetens egen token */
  function enroll(url, code) {
    var base;
    try {
      base = normalizeBaseUrl(url);
    } catch (e) {
      return Promise.reject(e);
    }
    return request('POST', base + '/api/device/enroll', null, { code: String(code).trim() }).then(function (res) {
      if (res.status === 403) throw fail('Koden är okänd, redan använd eller för gammal. Skapa en ny i publicomtools.', 403);
      if (res.status === 429) throw fail('För många försök. Vänta en stund.', 429);
      if (res.status !== 200) throw fail('publicomtools svarade ' + res.status, res.status);
      var data = json(res, 'Oväntat svar från publicomtools');
      if (!data || !data.host || !data.token) throw fail('Oväntat svar från publicomtools');
      store.set('url', base);
      store.set('host', data.host);
      store.set('token', data.token);
      return data;
    });
  }

  /** Inställningarna som { values, version } */
  function fetchConfig() {
    var url = baseUrl() + '/api/device/config?format=json&host=' + encodeURIComponent(store.get('host'));
    return request('GET', url, store.get('token')).then(function (res) {
      checkAuth(res);
      if (res.status !== 200) throw fail('Inställningar: publicomtools svarade ' + res.status, res.status);
      return json(res, 'Inställningar: oväntat svar');
    });
  }

  /** Skickar statusrapporten. Svaret: { ok, reload, … } */
  function heartbeat(status) {
    return request('POST', baseUrl() + '/api/heartbeat', store.get('token'), status).then(function (res) {
      checkAuth(res);
      if (res.status !== 200) throw fail('Statusrapport: publicomtools svarade ' + res.status, res.status);
      try {
        return JSON.parse(res.body);
      } catch (e) {
        return {};
      }
    });
  }

  PP.client = {
    DEFAULT_URL: DEFAULT_URL,
    isEnrolled: isEnrolled,
    host: function () { return store.get('host'); },
    baseUrl: baseUrl,
    forget: forget,
    enroll: enroll,
    fetchConfig: fetchConfig,
    heartbeat: heartbeat,
  };
})(window.PP);
