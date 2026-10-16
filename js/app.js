/* app.js — screen navigation and module wiring */
(function (global) {
  "use strict";

  function showScreen(id) {
    Array.prototype.forEach.call(document.querySelectorAll(".screen"), function (s) {
      s.classList.toggle("active", s.id === id);
    });

    if (id === "chords") global.DiapasonChords.onEnter();
    if (id === "staff") global.DiapasonStaffGame.onEnter();
    if (id === "explorer") global.DiapasonExplorer.onEnter();
    if (id === "challenge") global.DiapasonChallenge.onEnter();
  }

  function init() {
    global.DiapasonChords.init();
    global.DiapasonStaffGame.init();
    global.DiapasonExplorer.init();
    global.DiapasonChallenge.init();

    // Module cards on the home screen.
    Array.prototype.forEach.call(document.querySelectorAll(".module-card[data-module]"), function (card) {
      card.addEventListener("click", function () {
        showScreen(card.dataset.module);
      });
    });
    document.getElementById('home-play-now').addEventListener('click', function () {
      showScreen('challenge');
      global.DiapasonChallenge.quickSolo();
    });
    document.getElementById('home-continue').addEventListener('click', function () {
      showScreen('challenge');
      global.DiapasonChallenge.continuePractice();
    });
    document.getElementById('home-play-friends').addEventListener('click', function () {
      showScreen('challenge');
      global.DiapasonChallenge.setTab('room');
    });
    document.getElementById('home-game-settings').addEventListener('click', function () {
      showScreen('challenge');
      global.DiapasonChallenge.setTab('solo');
    });

    // Back buttons.
    Array.prototype.forEach.call(document.querySelectorAll("[data-back]"), function (btn) {
      btn.addEventListener("click", function () {
        showScreen("home");
      });
    });

    // Global instrument (timbre) selector — applies to every module.
    const instrument = document.getElementById("instrument");
    if (instrument) {
      const saved = localStorage.getItem('diapason-timbre');
      if (['piano', 'organ', 'strings'].includes(saved)) instrument.value = saved;
      global.DiapasonAudio.setTimbre(instrument.value);
      instrument.addEventListener("change", function () {
        global.DiapasonAudio.setTimbre(instrument.value);
        localStorage.setItem('diapason-timbre', instrument.value);
      });
    }
    const theme = document.getElementById('theme-toggle');
    function syncTheme() {
      const dark = document.documentElement.dataset.theme !== 'light';
      theme.textContent = dark ? 'Light mode' : 'Dark mode';
      theme.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
      document.querySelector('meta[name="theme-color"]').content = dark ? '#171c1b' : '#f4f2eb';
    }
    theme.addEventListener('click', function () {
      document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('diapason-theme', document.documentElement.dataset.theme);
      syncTheme();
    });
    syncTheme();
    if (new URLSearchParams(location.search).has('room')) showScreen('challenge');
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
