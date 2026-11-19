/**
 * AI 학업 플래너 v3.3 — Apps Script 서버 (초안: 모의 환경 테스트만 마침, 실제 배포·호출 테스트 전)
 * 하는 일: ① 공지 추출·코멘트용 AI 중계(Gemini)  ② 닉네임 계정 + 일정 데이터를 구글 시트에 저장
 *
 * 배포 방법은 같은 폴더의 SETUP.md를 따른다. 요약:
 *  - 시트에서 확장 프로그램 > Apps Script로 열어 이 코드를 붙여 넣는다(시트에 묶인 스크립트).
 *  - 배포 > 새 배포 > 웹 앱, 실행 사용자 "나", 액세스 "모든 사용자". 웹 앱 URL을 JS/app.js의 AI_ENDPOINT에 넣는다.
 *  - 프로젝트 설정 > 스크립트 속성에 GEMINI_API_KEY를 저장한다. 코드·프론트엔드에는 키를 넣지 않는다.
 * 요청: 브라우저가 text/plain 본문으로 보낸다(CORS 사전 요청 회피). 본문은 JSON 문자열이다.
 * 주의: MODEL 이름은 교안 기준 값이다. 실제 사용 전에 현재 제공되는 모델명인지 확인하고 바꿀 것.
 * 보안 한계: 비밀번호는 HTTPS로 이 서버에 전달되어 솔트+반복 SHA-256 해시로 저장된다. 시트 소유자(팀원)는 해시와 일정 데이터를 볼 수 있다.
 */
var MODEL = 'gemini-3.5-flash-lite';
// 기본 모델이 과부하일 때 차례로 시도할 대체 모델. 이름이 틀리거나 없는 모델(404)은 건너뛰므로 안전하다.
// 실제로 쓸 수 있는 이름은 구글 AI Studio의 모델 목록에서 확인해 바꿔 둔다.
var MODELS = [MODEL, 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];
var MAX_TEXT = 2000;      // 입력 길이 제한(프론트와 동일)
var MAX_ITEMS = 5;       // 공지 하나에서 받는 일정 수 상한(화면에서 하나씩 확인하므로 작게 둔다)
var DAILY_LIMIT = 200;    // 하루 전체 요청 한도(남용·비용 방지용 임의 값)

var ACCOUNT_TASKS_ = { signup: 1, login: 1, load: 1, save: 1, logout: 1, remove: 1 };

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    if (ACCOUNT_TASKS_[req.task]) return json_(account_(req)); // 계정·저장: AI 일일 한도와 별도로 센다
    if (!allow_()) return json_({ error: 'rate_limited' });
    if (req.task === 'extract') return json_(extract_(String(req.text || ''), String(req.today || '')));
    if (req.task === 'comment') return json_(comment_(req));
    return json_({ error: 'unknown_task' });
  } catch (err) {
    return json_({ error: 'bad_request' }); // 내부 오류 내용은 밖으로 보내지 않는다
  }
}

function extract_(text, today) {
  if (!text || text.length > MAX_TEXT) return { error: 'invalid_text' };
  var prompt =
    '다음은 대학 수업 공지다. 공지에 적힌 내용만 근거로 JSON을 만들어라. 추측하지 말고, 없으면 null 또는 빈 배열로 둔다.\n' +
    '기준일(오늘): ' + today + '\n' +
    '형식: {"items":[일정,...]}. 일정 하나의 형식은 {"title":문자열,"type":"과제|시험|발표|팀 프로젝트","importance":"높음|보통|낮음","effort":30|60|120|180|300(분),' +
    '"deadline":null 또는 {"kind":"absolute","date":"YYYY-MM-DD","evidence":원문 그대로의 날짜 표현} ' +
    '또는 {"kind":"relative_week","weekOffset":0|1|2,"weekday":0(월)~6(일),"evidence":원문 표현} ' +
    '또는 {"kind":"relative_days","days":0~60,"evidence":원문 표현},' +
    '"requirements":[{"text":80자 이내 요약,"evidence":원문에서 그대로 복사한 문장}]}\n' +
    '상대 날짜(다음 주 금요일 등)는 날짜로 바꾸지 말고 relative_week/relative_days로 표현만 구조화한다. 요구사항은 일정마다 최대 8개.\n' +
    '공지에 일정(과제·시험·발표 등)이 여러 개 있으면 일정마다 items에 하나씩 넣는다(최대 ' + MAX_ITEMS + '개, 마감이 가까운 순). 일정이 하나뿐이거나 뚜렷한 일정이 없으면 공지 전체를 일정 하나로 보고 items에 하나만 넣는다(마감을 모르면 deadline은 null).\n' +
    '공지:\n"""\n' + text + '\n"""';
  
var result = callGemini_(prompt);

// 응답을 {items:[...]} 형태로 맞춘다. 모델이 배열이나 일정 객체 하나로 답해도 받아 준다.
var list;
if (Array.isArray(result)) list = result;
else if (result && Array.isArray(result.items)) list = result.items;
else if (result && typeof result === 'object' && !result.error) list = [result];
else return result; // 오류 응답 등은 그대로 돌려준다
list = list.filter(function (x) { return x && typeof x === 'object' && !Array.isArray(x); });
if (!list.length) return { error: 'invalid_ai_shape' };
var omitted = Math.max(0, list.length - MAX_ITEMS);
list = list.slice(0, MAX_ITEMS);
var out = {};
for (var k in list[0]) if (k !== 'items') out[k] = list[0][k]; // 이전 버전 앱은 최상위만 읽으므로 첫 일정을 최상위에도 둔다
out.items = list;
out.omitted = omitted;
return out;
}

function comment_(req) {
  var prompt =
    '다음 데이터만 근거로 학생에게 2문장 이내의 한국어 코멘트를 써라. 숫자를 바꾸거나 새로 만들지 마라.\n' +
    JSON.stringify({ today: req.today || [], shortages: req.shortages || [] }) +
    '\n형식: {"comment":문자열}';
  return callGemini_(prompt);
}

function callGemini_(prompt) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  var res, code, done = false;
  // 모델마다 수용량이 따로라서, 기본 모델이 계속 503(과부하)·429(한도)·500이면 다음 모델로 넘어간다.
  // 모델 이름이 없으면(404) 바로 다음 모델로 넘어간다. 400·401·403은 모델 문제가 아니므로 바로 오류로 돌려준다.
  for (var m = 0; m < MODELS.length && !done; m++) {
    for (var attempt = 0; attempt < 2; attempt++) {
      res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODELS[m] + ':generateContent', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { 'x-goog-api-key': key },
        payload: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
        })
      });
      code = res.getResponseCode();
      if (code === 200) { done = true; break; }
      if (code === 404) break;                                       // 다음 모델
      if (code !== 429 && code !== 500 && code !== 503) { done = true; break; } // 재시도해도 소용없는 오류
      if (attempt === 0) Utilities.sleep(1200);
    }
  }
  if (code !== 200) return { error: 'upstream_' + code, detail: String(res.getContentText()).slice(0, 120) };
  var body = JSON.parse(res.getContentText());
  var t = body.candidates && body.candidates[0] && body.candidates[0].content.parts[0].text;
  return JSON.parse(t); // 형식 검증은 프론트(validExtract3)가 한다
}

function allow_() {
  var c = CacheService.getScriptCache(), k = 'n_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
  var n = Number(c.get(k) || 0);
  if (n >= DAILY_LIMIT) return false;
  c.put(k, String(n + 1), 86400);
  return true;
}

/* ===== 계정 + 일정 데이터 저장 (구글 시트 "users" 탭) =====
 * 열: nick | salt | hash | token | tokenExp | data | updatedAt | createdAt
 * token 칸 = 기기별 로그인 토큰의 해시 목록(JSON). 토큰 원문은 시트에 남기지 않는다. tokenExp = 그중 가장 늦은 만료 시각.
 * data = 앱이 보낸 JSON 문자열 한 덩어리(일정·가용 시간·약속). 시트 한 칸 한도(5만 자)보다 작게 MAX_DATA로 막는다.
 */
var HEADERS = ['nick', 'salt', 'hash', 'token', 'tokenExp', 'data', 'updatedAt', 'createdAt'];
var HASH_ROUNDS = 300;          // 반복 횟수. 배포 후 로그인 응답 시간을 보고 조정한다(너무 느리면 낮춘다)
var TOKEN_DAYS = 7;             // 로그인 유지 기간
var MAX_DEVICES = 5;            // 계정 하나에 동시에 로그인해 둘 수 있는 기기 수(넘으면 가장 오래된 기기부터 로그아웃)
var MAX_DATA = 45000;           // 저장 데이터 최대 길이(문자)
var FAIL_LIMIT = 5, LOCK_MIN = 10; // 닉네임별 로그인 실패 5회 → 10분 잠금
var ACCOUNT_DAILY_LIMIT = 3000; // 하루 계정·저장 요청 한도(남용 방지용 임의 값)

function account_(req) {
  if (!accAllow_()) return { error: 'rate_limited' };
  var nick = String(req.nick || '').trim().toLowerCase();
  if (!/^[가-힣a-z0-9_]{2,16}$/.test(nick)) return { error: 'invalid_nick' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { error: 'busy' }; }
  try {
    var sh = usersSheet_();
    switch (req.task) {
      case 'signup': return signup_(sh, nick, String(req.pw || ''));
      case 'login': return login_(sh, nick, String(req.pw || ''));
      default: return withAuth_(sh, nick, String(req.token || ''), req);
    }
  } finally { lock.releaseLock(); }
}

function signup_(sh, nick, pw) {
  if (!/^[가-힣a-z0-9_]{2,12}$/.test(nick)) return { error: 'invalid_nick' };
  if (pw.length < 6 || pw.length > 64) return { error: 'invalid_pw' };
  if (findRow_(sh, nick)) return { error: 'nick_taken' };
  var salt = uuid_().slice(0, 16), token = newToken_(), now = Date.now();
  sh.appendRow([nick, salt, hash_(salt, pw), addToken_([], token), now + TOKEN_DAYS * 86400000, '', 0, now]);
  return { ok: true, token: token, data: null, updatedAt: 0 };
}

function login_(sh, nick, pw) {
  var cache = CacheService.getScriptCache(), fk = 'f_' + nick;
  if (Number(cache.get(fk) || 0) >= FAIL_LIMIT) return { error: 'locked' };
  var row = findRow_(sh, nick), r = row ? readRow_(sh, row) : null;
  // 없는 닉네임과 틀린 비밀번호를 같은 응답으로 돌려 계정 존재 여부를 알려 주지 않는다
  if (!r || hash_(String(r.salt), pw) !== String(r.hash)) {
    cache.put(fk, String(Number(cache.get(fk) || 0) + 1), LOCK_MIN * 60);
    return { error: 'bad_credentials' };
  }
  cache.remove(fk);
  var token = newToken_(); // 다른 기기의 로그인은 그대로 두고 이 기기용 토큰만 추가한다
  sh.getRange(row, 4, 1, 2).setValues([[addToken_(parseTokens_(r.token), token), Date.now() + TOKEN_DAYS * 86400000]]);
  return { ok: true, token: token, data: r.data ? String(r.data) : null, updatedAt: r.updatedAt };
}

function withAuth_(sh, nick, token, req) {
  var row = findRow_(sh, nick), r = row ? readRow_(sh, row) : null;
  var toks = parseTokens_(r && r.token), th = token ? tokHash_(token) : '', mine = null;
  for (var i = 0; i < toks.length; i++) if (toks[i].h === th && toks[i].e > Date.now()) mine = toks[i];
  if (!r || !mine) return { error: 'unauthorized' };
  if (req.task === 'load') return { ok: true, data: r.data ? String(r.data) : null, updatedAt: r.updatedAt };
  if (req.task === 'logout') { // 이 기기의 토큰만 지운다
    var left = toks.filter(function (x) { return x.h !== th; });
    sh.getRange(row, 4, 1, 2).setValues([[JSON.stringify(left), left.length ? r.tokenExp : 0]]);
    return { ok: true };
  }
  if (req.task === 'remove') { sh.deleteRow(row); return { ok: true }; }
  if (req.task === 'save') {
    var s = String(req.data == null ? '' : req.data);
    if (s.length > MAX_DATA) return { error: 'too_large' };
    try { JSON.parse(s); } catch (e) { return { error: 'invalid_data' }; }
    // 다른 기기가 먼저 저장했다면 덮어쓰지 않고 알린다(force가 아니면)
    if (!req.force && Number(req.baseUpdatedAt || 0) !== r.updatedAt) return { error: 'conflict', data: r.data ? String(r.data) : null, updatedAt: r.updatedAt };
    var t = Math.max(Date.now(), r.updatedAt + 1);
    sh.getRange(row, 6, 1, 2).setValues([[s, t]]);
    return { ok: true, updatedAt: t };
  }
  return { error: 'unknown_task' };
}

function tokHash_(t) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'tok:' + t)); }
function parseTokens_(raw) {
  try { var a = JSON.parse(String(raw || '[]')); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function addToken_(list, token) {
  var now = Date.now();
  var keep = list.filter(function (x) { return x && x.e > now; });
  keep.push({ h: tokHash_(token), e: now + TOKEN_DAYS * 86400000 });
  while (keep.length > MAX_DEVICES) keep.shift();
  return JSON.stringify(keep);
}

function usersSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('users');
  if (!sh) {
    sh = ss.insertSheet('users');
    sh.getRange('A:D').setNumberFormat('@'); // 숫자처럼 보이는 닉네임·해시가 숫자로 바뀌지 않게 텍스트로 고정
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}
function findRow_(sh, nick) {
  var n = sh.getLastRow();
  if (n < 2) return 0;
  var vals = sh.getRange(2, 1, n - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === nick) return i + 2;
  return 0;
}
function readRow_(sh, row) {
  var v = sh.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  return { nick: v[0], salt: v[1], hash: v[2], token: v[3], tokenExp: Number(v[4]) || 0, data: v[5], updatedAt: Number(v[6]) || 0 };
}
function hex_(bytes) { return bytes.map(function (x) { return ('0' + (x < 0 ? x + 256 : x).toString(16)).slice(-2); }).join(''); }
function hash_(salt, pw) {
  var h = salt + ':' + pw;
  for (var i = 0; i < HASH_ROUNDS; i++) h = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + h, Utilities.Charset.UTF_8));
  return h;
}
function uuid_() { return Utilities.getUuid().replace(/-/g, ''); }
function newToken_() { return uuid_() + uuid_(); }
function accAllow_() {
  var c = CacheService.getScriptCache(), k = 'a_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
  var n = Number(c.get(k) || 0);
  if (n >= ACCOUNT_DAILY_LIMIT) return false;
  c.put(k, String(n + 1), 86400);
  return true;
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
