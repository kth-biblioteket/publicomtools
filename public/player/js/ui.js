'use strict';
// Vyerna utöver sidorna: inskrivning, felsida (utan knappar) och svart skärm.
(function (PP) {
  function $(id) {
    return document.getElementById(id);
  }

  var submitting = false;

  /** Felsidan visas eller tas bort; offline: enheten saknar nät */
  function error(show, offline) {
    $('error').className = show ? 'overlay' : 'overlay hidden';
    $('error-sv').textContent = offline ? 'Ingen nätverksanslutning' : 'Sidan kan inte visas just nu';
    $('error-en').textContent = offline ? 'No network connection' : 'This page cannot be displayed right now';
  }

  /** Svart skärm: ramarna döljs. Annars visas de (de ska vara synliga, inte dolda, så att skripten inte stryps). */
  function black(on) {
    $('frames').className = on ? 'hidden' : '';
  }

  function setMessage(text) {
    $('enroll-msg').textContent = text || '';
  }

  /** Inskrivningsvyn. onSubmit(url, code) returnerar ett löfte; vid fel visas meddelandet, vid lyckat anrop tas vyn bort. */
  function showEnroll(onSubmit, message) {
    $('enroll-url').value = PP.client.baseUrl();
    $('enroll-code').value = '';
    setMessage(message);
    $('enroll').className = 'overlay';
    error(false, false);
    black(true);
    $('enroll-code').focus();
    PP.ui.onSubmit = onSubmit;
  }

  function hideEnroll() {
    $('enroll').className = 'overlay hidden';
  }

  function init() {
    $('enroll-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var code = $('enroll-code').value.trim();
      if (submitting || !code) return;
      submitting = true;
      setMessage('Ansluter …');
      PP.ui.onSubmit($('enroll-url').value, code).then(function () {
        submitting = false;
        setMessage('');
      }, function (err) {
        submitting = false;
        setMessage(err && err.message ? err.message : 'Något gick fel');
        $('enroll-code').focus();
      });
    });
  }

  PP.ui = { init: init, error: error, black: black, showEnroll: showEnroll, hideEnroll: hideEnroll, onSubmit: null };
})(window.PP);
