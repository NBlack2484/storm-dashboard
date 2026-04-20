// Copy this file to config.js and add your API key
// config.js is in .gitignore — never commit it to a public repo

const CONFIG = {
  CLAUDE_API_KEY: 'YOUR_ANTHROPIC_API_KEY_HERE',

  // Watch zones — NWS zone codes
  // Jefferson County MO = MOC099
  // St. Louis County MO = MOC189
  // St. Louis City MO   = MOC510
  // St. Charles County  = MOC183
  WATCH_ZONES: ['MOC099', 'MOC189', 'MOC510', 'MOC183'],

  // Map center (Jefferson County / Hillsboro area)
  MAP_CENTER: [38.25, -90.55],
  MAP_ZOOM: 10,

  // Alert refresh interval (ms)
  REFRESH_INTERVAL: 300000, // 5 minutes
};
