'use strict';
// Adress, enhetens id (host), token och senaste inställningar i lokal lagring. Lagringen kan saknas eller kasta
// (privat läge, rensad data): då ligger värdena bara i minnet och enheten skrivs in på nytt vid nästa start.
(function (PP) {
  var PREFIX = 'publiplayer.';
  var memory = {};

  function get(key) {
    try {
      var v = window.localStorage.getItem(PREFIX + key);
      if (v !== null) return v;
    } catch (e) {
      // faller tillbaka på minnet
    }
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
  }

  function set(key, value) {
    memory[key] = String(value);
    try {
      window.localStorage.setItem(PREFIX + key, String(value));
    } catch (e) {
      // bara i minnet
    }
  }

  function remove(key) {
    delete memory[key];
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch (e) {
      // inget att ta bort
    }
  }

  PP.store = {
    get: get,
    set: set,
    remove: remove,
    /** Senast hämtade inställningar { values, version }, eller null */
    getConfig: function () {
      var raw = get('config');
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    },
    setConfig: function (config) {
      set('config', JSON.stringify(config));
    },
  };
})(window.PP = window.PP || {});
