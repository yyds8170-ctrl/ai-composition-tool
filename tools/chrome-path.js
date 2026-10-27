/* 统一的浏览器定位：puppeteer 固定版本可能没下载（离线机器装不动），
 * 回退到系统 Chrome / Edge，保证 QA 脚本在本地始终能跑。 */
'use strict';
const fs = require('fs');
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].filter(Boolean);
function executable() {
  return CANDIDATES.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } }) || undefined;
}
function launch(extra) {
  const o = Object.assign({ headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader'] }, extra || {});
  const ex = executable();
  if (ex && !o.executablePath) o.executablePath = ex;
  return o;
}
module.exports = { executable, launch };
