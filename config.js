// Leaderboard backend. Hosted copies (http/https, not localhost) use the online board on the same origin;
// a file:// or localhost copy keeps scores on this device only. A page can pre-set DECICAT_CONFIG to override.
window.DECICAT_CONFIG = window.DECICAT_CONFIG || {
  scores: (/^https?:$/.test(location.protocol) && !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname)) ? 'remote' : 'local',
  apiBase: ''
};
