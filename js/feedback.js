/* Player feedback: the 反馈 buttons open a GitHub "new issue" page in a new tab, with the
   game version, mode, device/browser and screen size already filled in.
   Deliberately reads nothing personal: no nickname, no e-mail, no Firebase uid, no localStorage. */
const FB_REPO = 'https://github.com/iZHENGjy/xmum-campus';
const FB_VER = (() => {
  const m = document.currentScript && /[?&]v=(\d+)/.exec(document.currentScript.src);
  return m ? 'v' + m[1] : '未知';
})();
/* option labels must match .github/ISSUE_TEMPLATE/bug.yml exactly, or GitHub leaves the dropdown empty */
const FB_MODES = {naiwa:'开车 · 奶娃', hole:'黑洞 · 吞校园', orbit:'俯瞰', walk:'漫游'};
const FB_TITLE = '标题画面 / 菜单';

/* openTitle() switches the scene back to orbit, so remember the last mode actually played */
let fbLast = '';
function fbTrack(){ if (!document.body.classList.contains('titled')) fbLast = document.body.dataset.mode || ''; }
new MutationObserver(fbTrack).observe(document.body, {attributes:true, attributeFilter:['data-mode', 'class']});
fbTrack();

function fbMode(){
  const titled = document.body.classList.contains('titled');
  const m = titled ? fbLast : document.body.dataset.mode;
  return {pick: FB_MODES[m] || FB_TITLE, text: (FB_MODES[m] || '标题画面') + (titled && FB_MODES[m] ? '（从菜单里点的反馈）' : '')};
}

function fbDevice(){
  const ua = navigator.userAgent, touch = navigator.maxTouchPoints > 0;
  const iPadOS = /Macintosh/.test(ua) && touch;   // iPadOS 13+ reports itself as a Mac
  let os = '其他系统', m;
  if (/iPhone|iPod/.test(ua)){ m = /OS (\d+)_(\d+)/.exec(ua); os = 'iOS' + (m ? ' ' + m[1] + '.' + m[2] : ''); }
  else if (/iPad/.test(ua) || iPadOS){ m = /OS (\d+)_(\d+)/.exec(ua); os = 'iPadOS' + (m && !iPadOS ? ' ' + m[1] + '.' + m[2] : ''); }
  else if ((m = /Android (\d+(?:\.\d+)?)/.exec(ua))) os = 'Android ' + m[1];
  else if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  const B = [
    [/MicroMessenger\/([\d.]+)/, '微信内置浏览器'], [/QQ\/([\d.]+)/, 'QQ 内置浏览器'], [/MQQBrowser\/([\d.]+)|QQBrowser\/([\d.]+)/, 'QQ 浏览器'],
    [/UCBrowser\/([\d.]+)/, 'UC 浏览器'], [/HuaweiBrowser\/([\d.]+)/, '华为浏览器'], [/MiuiBrowser\/([\d.]+)/, '小米浏览器'],
    [/HeyTapBrowser\/([\d.]+)/, 'OPPO 浏览器'], [/SamsungBrowser\/([\d.]+)/, '三星浏览器'], [/EdgA?\/([\d.]+)|EdgiOS\/([\d.]+)/, 'Edge'],
    [/OPR\/([\d.]+)/, 'Opera'], [/FxiOS\/([\d.]+)|Firefox\/([\d.]+)/, 'Firefox'], [/CriOS\/([\d.]+)|Chrome\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari/, 'Safari']];
  let br = '其他浏览器';
  for (const [re, name] of B){ const r = re.exec(ua); if (r){ const v = (r[1] || r[2] || '').split('.')[0]; br = name + (v ? ' ' + v : ''); break; } }
  const short = Math.min(screen.width, screen.height);
  const kind = /iPhone|iPod/.test(ua) || /Android.*Mobile/.test(ua) ? '手机'
    : /iPad|Android/.test(ua) || iPadOS ? '平板'
    : touch && short < 600 ? '手机' : '电脑';
  return kind + ' · ' + os + ' · ' + br;
}

function fbScreen(){
  const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
  return `屏幕 ${screen.width}×${screen.height} · 窗口 ${window.innerWidth}×${window.innerHeight} · 像素比 ${dpr}`;
}

function fbInfo(){ const m = fbMode(); return {version: FB_VER, mode: m, device: fbDevice(), screen: fbScreen()}; }
function fbUrl(template, fields){
  /* %20 rather than URLSearchParams' "+", so spaces survive however GitHub reads the query */
  const q = Object.entries(Object.assign({template}, fields)).map(([k, v]) => k + '=' + encodeURIComponent(v));
  return FB_REPO + '/issues/new?' + q.join('&');
}

const fbDlg = $('#fb');
function fbOpen(){
  const i = fbInfo();
  $('#fbBug').href = fbUrl('bug.yml', {mode: i.mode.pick, device: i.device, screen: i.screen, version: i.version});
  $('#fbIdea').href = fbUrl('idea.yml', {env: `版本：${i.version}\n模式：${i.mode.text}\n设备和浏览器：${i.device}\n${i.screen}`});
  const env = $('#fbEnv'); env.textContent = '';
  for (const [k, v] of [['版本', i.version], ['模式', i.mode.text], ['设备', i.device], ['尺寸', i.screen]]){
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = k; dd.textContent = v; env.append(dt, dd);
  }
  uiOpenDialog(fbDlg);
}
if (fbDlg){
  document.querySelectorAll('[data-fb]').forEach(b => b.addEventListener('click', fbOpen));
  fbDlg.querySelectorAll('.fb-pick').forEach(a => a.addEventListener('click', () => setTimeout(() => uiCloseDialog(fbDlg), 0)));
  /* back in a game, give the keys to the game rather than to the 反馈 button (Space would reopen it) */
  fbDlg.addEventListener('close', () => { if (!document.body.classList.contains('titled')) setTimeout(() => canvas.focus({preventScroll:true}), 0); });
}
