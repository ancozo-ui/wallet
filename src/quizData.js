// 🎲 놀이 퀴즈의 문제 은행과 문제 만들기.
// 문제는 한 판마다 새로 뽑고 보기 순서도 섞는다(같은 판에서 같은 문제는 나오지 않는다).

export const SUBJECTS = {
  times: { e: '✖️', n: '구구단', desc: '2단~9단 랜덤' },
  english: { e: '🔤', n: '영어 단어', desc: '초등 2학년 수준' },
  hangul: { e: '📝', n: '한글 단어', desc: '초등 1학년 수준' },
}
SUBJECTS.practice = { e: '📒', n: '오답 노트', desc: '틀린 문제 다시 풀기' }
export const SUBJECT_ORDER = ['times', 'english', 'hangul']

const rnd = (n) => Math.floor(Math.random() * n)
export function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
const sample = (arr, n) => shuffle(arr).slice(0, n)

// ---------- 영어 단어 (초2) : "영어|뜻" ----------
const EN = `dog|개 cat|고양이 bird|새 fish|물고기 rabbit|토끼 horse|말 cow|소 pig|돼지 duck|오리 lion|사자
tiger|호랑이 bear|곰 monkey|원숭이 elephant|코끼리 mouse|쥐 frog|개구리 sheep|양 chicken|닭 snake|뱀 turtle|거북이
apple|사과 banana|바나나 orange|오렌지 grape|포도 milk|우유 bread|빵 rice|밥 egg|달걀 cake|케이크 cookie|쿠키
water|물 juice|주스 pizza|피자 candy|사탕 strawberry|딸기 melon|멜론 tomato|토마토 potato|감자 carrot|당근
red|빨간색 blue|파란색 yellow|노란색 green|초록색 black|검은색 white|흰색 pink|분홍색 purple|보라색 brown|갈색
head|머리 eye|눈 nose|코 mouth|입 ear|귀 hand|손 foot|발 arm|팔 leg|다리 face|얼굴
mom|엄마 dad|아빠 baby|아기 friend|친구 teacher|선생님 grandma|할머니 grandpa|할아버지
book|책 pencil|연필 desk|책상 chair|의자 bag|가방 school|학교 eraser|지우개 ruler|자 door|문 window|창문
one|하나 two|둘 three|셋 four|넷 five|다섯 six|여섯 seven|일곱 eight|여덟 nine|아홉 ten|열
sun|해 moon|달 star|별 tree|나무 flower|꽃 rain|비 wind|바람 cloud|구름 sky|하늘
car|자동차 bus|버스 train|기차 bike|자전거 ball|공 doll|인형 house|집 room|방 bed|침대 clock|시계
hat|모자 shoes|신발 box|상자 big|큰 small|작은 happy|행복한 sad|슬픈 hot|뜨거운 cold|차가운
run|달리다 jump|뛰다 eat|먹다 drink|마시다 sleep|자다 read|읽다 write|쓰다 sing|노래하다 dance|춤추다 swim|수영하다`
export const EN_BANK = EN.split(/\s+/).filter(Boolean).map((s) => { const [en, ko] = s.split('|'); return { en, ko } })

// ---------- 한글 단어 (초1) : "맞는 낱말|헷갈리는 모양 3개" ----------
// 아이가 흔히 틀리는 모양(받침·모음·된소리)으로 만든 보기. 실제로 있는 낱말은 보기에 넣지 않는다.
const HG = `버스|버슈,바스,바소 나무|나뮤,냐무,나므 토끼|토키,토께,터끼 고래|고레,꼬래,구래 사자|사쟈,싸자,샤자
모자|모쟈,묘자,모짜 가수|가슈,갸수,가쑤 우유|유우,우뉴,우융 아기|아키,아끼,야기 의자|의쟈,으자,의차
시계|시게,씨계,시께 치마|치므,취마,치머 머리|머르,뭐리,머랴 다리|다르,다랴,더리 바지|바쥐,바찌,바제
이마|이므,이먀,이메 오리|오르,오랴,오뤼 토마토|토마도,터마토,토마투 바나나|바냐냐,버나나,바나냐 도깨비|도깨삐,도께비,도깨미
하마|하머,햐마,하므 포도|포도우,푸도,표도 라면|라먼,러면,나면 사과|사꽈,싸과,사궈 지우개|지우게,지유개,찌우개
학교|학꾜,핫교,학고 책상|책쌍,챙상,책샹 먹다|멱다,머다,먹따 국물|궁물,국뭄,꾹물 축구|척구,축규,축꾸
낙타|낙다,낭타,낙토 친구|칭구,친규,친꾸 눈사람|눈싸람,눙사람,누사람 안경|앙경,안겅,안견 선생님|성생님,선생닙,선생임
신발|싱발,신빠,신바 편지|펜지,편찌,펀지 달걀|달갈,달걸,달깔 거울|거욱,거을,걸울 얼굴|얼국,얼글,얼궁
열쇠|열쐬,연쇠,얼쇠 물고기|물꼬기,뭄고기,물고끼 나팔|나팝,나빨,나펄 하늘|하느,하늠,하들 구름|구릅,구른,구뭄
점심|점신,접심,점씸 김밥|김빱,깁밥,김박 입술|입쑬,이술,잎술 지갑|지감,지겁,지깝 강아지|강아찌,강앗이,깡아지
고양이|고얗이,고냥이,고양히 동생|동쌩,똥생,동섕 공책|공챙,꽁책,궁책 풍선|퐁선,풍센,품선 장난감|장난깜,장낭감,쟝난감
병원|병윈,벵원,병언 낮잠|낫잠,낮짬,난잠 있어요|이써요,잇어요,있어여 먹었어요|머거써요,먹엇어요,먹었어여 갔어요|가써요,갓어요,갔어여
꽃|꼬ㅊ,꼿,꽂 닭|닥,달ㄱ,닭ㄱ 책|챡,췍,첵 옷|오,옫,옷ㅅ
수박|수바,수밖,숩박 기차|기챠,끼차,기짜 자동차|자동챠,자똥차,자둥차 비행기|비행끼,비앵기,비행키
공원|공윈,궁원,공언 놀이터|노리터,놀이터ㅓ,놀리터 미끄럼틀|미끄럼들,미끄럽틀,미끄럼뜰 그네|그내,크네,그니 시소|시쏘,씨소,시서
웃음|우슴,웃슴,웃옴 가방|가빵,가벙,카방 연필|연피,엿필,연핀 색종이|색쫑이,샌종이,색종히
선물|선묵,선뭄,썬물`
// 받침이 있는 낱말 / 없는 낱말 (골고루 섞어 내기 위해)
const hasBatchim = (w) => [...w].some((ch) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 && c % 28 !== 0 })
export const HG_BANK = HG.split(/\s+/).filter(Boolean).map((e) => {
  const [right, wrong] = e.split('|')
  return { right, wrong: wrong.split(',') }
}).filter((w) => w.wrong.length === 3 && w.wrong.every((x) => /^[가-힣]+$/.test(x)))   // 이상한 글자가 섞인 보기는 걸러 낸다

// ---------- 문제 만들기 ----------
// 문제: { kind:'choice'|'number', q, sub?, options?, answer }
function times(count) {
  const pairs = []
  for (let a = 2; a <= 9; a++) for (let b = 2; b <= 9; b++) pairs.push([a, b])
  return sample(pairs, count).map(([a, b]) => ({ kind: 'number', q: `${a} × ${b} = ?`, answer: String(a * b) }))
}

function english(count) {
  const picked = sample(EN_BANK, count)
  return picked.map((w, i) => {
    // 번갈아 두 방향 — 영어 보고 뜻 고르기 / 뜻 보고 영어 고르기
    const toKo = i % 2 === 0
    const others = sample(EN_BANK.filter((x) => x.en !== w.en && x.ko !== w.ko), 3)
    return toKo
      ? { kind: 'choice', q: w.en, sub: '무슨 뜻일까요?', options: shuffle([w.ko, ...others.map((o) => o.ko)]), answer: w.ko, big: true }
      : { kind: 'choice', q: w.ko, sub: '영어로 하면?', options: shuffle([w.en, ...others.map((o) => o.en)]), answer: w.en, big: true }
  })
}

function hangul(count) {
  // 받침 있는 낱말 60%, 없는 낱말 40% 로 골고루
  const withB = HG_BANK.filter((w) => hasBatchim(w.right))
  const noB = HG_BANK.filter((w) => !hasBatchim(w.right))
  const nB = Math.min(withB.length, Math.round(count * 0.6))
  const picked = shuffle([...sample(withB, nB), ...sample(noB, Math.min(noB.length, count - nB))])
  return picked.map((w) => ({
    kind: 'choice', q: '알맞게 쓴 낱말을 골라요', sub: '', options: shuffle([w.right, ...w.wrong]), answer: w.right,
  }))
}

export function makeQuestions(subject, count) {
  if (subject === 'times') return times(count)
  if (subject === 'english') return english(Math.min(count, EN_BANK.length))
  return hangul(Math.min(count, HG_BANK.length))
}
