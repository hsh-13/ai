/**
 * AI 학업 플래너 v3.0 — Apps Script 중계 서버 (초안, 실제 배포·호출 테스트 전)
 *
 * 배포: 웹 앱 / 실행 사용자 "나" / 액세스 "모든 사용자" → 웹 앱 URL을 JS/app.js의 AI_ENDPOINT에 넣는다.
 * 키: 프로젝트 설정 > 스크립트 속성에 GEMINI_API_KEY를 저장한다. 코드·프론트엔드에는 키를 넣지 않는다.
 * 요청: 브라우저가 text/plain 본문으로 보낸다(CORS 사전 요청 회피). 본문은 JSON 문자열이다.
 * 주의: MODEL 이름은 교안 기준 값이다. 실제 사용 전에 현재 제공되는 모델명인지 확인하고 바꿀 것.
 */
var MODEL = 'gemini-3.5-flash-lite';
var MAX_TEXT = 2000;      // 입력 길이 제한(프론트와 동일)
var DAILY_LIMIT = 200;    // 하루 전체 요청 한도(남용·비용 방지용 임의 값)

function doPost(e) {
  try {
    if (!allow_()) return json_({ error: 'rate_limited' });
    var req = JSON.parse(e.postData.contents);
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
    '형식: {"title":문자열,"type":"과제|시험|발표|팀 프로젝트","importance":"높음|보통|낮음","effort":30|60|120|180|300(분),' +
    '"deadline":null 또는 {"kind":"absolute","date":"YYYY-MM-DD","evidence":원문 그대로의 날짜 표현} ' +
    '또는 {"kind":"relative_week","weekOffset":0|1|2,"weekday":0(월)~6(일),"evidence":원문 표현} ' +
    '또는 {"kind":"relative_days","days":0~60,"evidence":원문 표현},' +
    '"requirements":[{"text":80자 이내 요약,"evidence":원문에서 그대로 복사한 문장}]}\n' +
    '상대 날짜(다음 주 금요일 등)는 날짜로 바꾸지 말고 relative_week/relative_days로 표현만 구조화한다. 요구사항은 최대 8개.\n' +
    '공지:\n"""\n' + text + '\n"""';
  return callGemini_(prompt);
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
  var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
    })
  });
  if (res.getResponseCode() !== 200) return { error: 'upstream_' + res.getResponseCode() };
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

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
