// Leaderboard backend. Default: scores stay on this device (localStorage).
// To use the Cloudflare Worker in server/, set scores:'remote' and apiBase to its URL ('' = same origin).
window.DECICAT_CONFIG = window.DECICAT_CONFIG || { scores: 'local', apiBase: '' };
