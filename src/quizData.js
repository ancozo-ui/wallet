// 🎲 놀이 퀴즈의 문제 은행과 문제 만들기.
// 문제는 한 판마다 새로 뽑고 보기 순서도 섞는다(같은 판에서 같은 문제는 나오지 않는다).

export const SUBJECTS = {
  times: { e: '✖️', n: '구구단', desc: '2단~9단 랜덤' },
  english: { e: '🔤', n: '영어 단어', desc: '초등 2학년 수준' },
  hangul: { e: '📝', n: '한글 단어', desc: '초등 1학년 수준' },
}
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

// ---------- 한글 단어 (초1) : "낱말|분류|뜻" ----------
const HG = `사과|과일|빨갛고 달콤한 과일 바나나|과일|길쭉하고 노란 과일 포도|과일|작은 알이 송이로 달린 과일 딸기|과일|빨갛고 씨가 겉에 있는 과일 수박|과일|겉은 초록, 속은 빨간 큰 과일
고양이|동물|야옹 하고 우는 동물 강아지|동물|멍멍 하고 짖는 동물 토끼|동물|귀가 길고 깡충깡충 뛰는 동물 돼지|동물|꿀꿀 하고 우는 동물 오리|동물|꽥꽥 하고 우는 새
사자|동물|동물의 왕이라고 불리는 동물 코끼리|동물|코가 길고 몸이 아주 큰 동물 원숭이|동물|바나나를 좋아하고 나무를 잘 타는 동물 거북이|동물|등딱지가 있고 느릿느릿 걷는 동물 개구리|동물|연못에서 개굴개굴 우는 동물
눈|몸|보는 일을 하는 얼굴의 곳 코|몸|냄새를 맡는 얼굴의 곳 입|몸|밥을 먹고 말을 하는 곳 귀|몸|소리를 듣는 곳 손|몸|물건을 잡는 몸의 곳
발|몸|걸을 때 땅에 닿는 곳 머리|몸|얼굴 위에 머리카락이 난 곳 다리|몸|걷거나 뛸 때 쓰는 몸의 곳 배|몸|밥을 먹으면 부르는 몸의 곳 이|몸|음식을 씹는 하얀 것
학교|곳|공부하러 가는 곳 집|곳|우리 가족이 사는 곳 병원|곳|아플 때 의사 선생님을 만나는 곳 공원|곳|나무와 놀이터가 있는 곳 도서관|곳|책을 빌려 읽는 곳
시장|곳|물건을 사고파는 곳 놀이터|곳|그네와 미끄럼틀이 있는 곳 은행|곳|돈을 맡기는 곳 가게|곳|물건을 파는 작은 곳 교실|곳|학교에서 공부하는 방
해|자연|낮에 하늘에서 환하게 비추는 것 달|자연|밤하늘에 둥실 뜨는 것 별|자연|밤하늘에 반짝반짝 빛나는 것 구름|자연|하늘에 둥둥 떠 있는 하얀 것 비|자연|하늘에서 물방울로 내리는 것
바람|자연|솔솔 불어 나뭇잎을 흔드는 것 눈사람|자연|겨울에 눈으로 만드는 것 무지개|자연|비 온 뒤 하늘에 뜨는 일곱 빛깔 호수|자연|넓고 큰 물이 고인 곳 산|자연|높이 솟은 땅
연필|물건|글씨를 쓰는 나무 도구 지우개|물건|틀린 글씨를 지우는 것 가방|물건|책을 넣어 메고 다니는 것 책|물건|글과 그림이 있어 읽는 것 공책|물건|글씨를 쓰는 종이 묶음
우산|물건|비가 올 때 쓰는 것 모자|물건|머리에 쓰는 것 신발|물건|발에 신는 것 양말|물건|발에 신고 그 위에 신발을 신는 것 시계|물건|시간을 알려 주는 것
의자|물건|앉을 때 쓰는 것 책상|물건|앉아서 공부할 때 쓰는 것 거울|물건|내 얼굴을 비춰 보는 것 칫솔|물건|이를 닦는 것 가위|물건|종이를 자르는 것
밥|음식|하얀 쌀로 지은 먹을거리 우유|음식|소에서 나오는 하얀 마실 것 빵|음식|밀가루로 구운 먹을거리 김치|음식|매콤하고 빨간 반찬 달걀|음식|닭이 낳은 알
아이스크림|음식|차갑고 달콤한 간식 과자|음식|바삭바삭한 간식 라면|음식|꼬불꼬불한 면이 있는 음식 국|음식|국물이 있는 음식 주스|음식|과일을 짜서 만든 마실 것
엄마|사람|나를 낳아 주신 여자 어른 아빠|사람|나를 낳아 주신 남자 어른 할머니|사람|아빠나 엄마의 어머니 할아버지|사람|아빠나 엄마의 아버지 선생님|사람|학교에서 가르쳐 주시는 분
친구|사람|함께 놀고 마음이 통하는 사람 동생|사람|나보다 나이가 어린 형제 형|사람|나보다 나이가 많은 남자 형제 의사|사람|아픈 사람을 낫게 해 주시는 분 소방관|사람|불을 꺼 주시는 분
자동차|탈것|바퀴가 네 개 달린 탈것 버스|탈것|많은 사람이 함께 타는 탈것 기차|탈것|철길 위를 달리는 탈것 비행기|탈것|하늘을 나는 탈것 자전거|탈것|두 바퀴를 발로 굴려 타는 탈것`
export const HG_BANK = HG.split('\n').flatMap((line) => {
  // 한 줄에 "낱말|분류|뜻" 항목이 여러 개 — 낱말이 한 단어이므로 공백으로 나누되 뜻의 공백은 다음 낱말 앞까지 이어 붙인다.
  const out = []
  let cur = null
  for (const tok of line.trim().split(' ')) {
    if (/^[^\s|]+\|[^\s|]+\|/.test(tok)) {
      if (cur) out.push(cur)
      const [w, cat, ...rest] = tok.split('|')
      cur = { w, cat, def: rest.join('|') }
    } else if (cur) {
      cur.def += ' ' + tok
    }
  }
  if (cur) out.push(cur)
  return out
})

// 맞춤법: [맞는 것, 틀린 것 3개]
export const SPELL_BANK = [
  ['학교', '하꾜', '학꾜', '핫교'], ['사랑', '사랭', '살랑', '사량'], ['감사합니다', '감사함니다', '감사합나다', '감사합미다'],
  ['괜찮아요', '괜찬아요', '괜찮아여', '괜차나요'], ['깨끗해요', '깨끗해여', '깨긋해요', '깨끗애요'], ['어떻게', '어떡게', '어떻케', '어덯게'],
  ['책상', '책쌍', '챙상', '책샹'], ['같이', '가치', '갓이', '같치'], ['먹었어요', '머거써요', '먹었어여', '먹엇어요'],
  ['좋아요', '조아요', '좋아여', '좋하요'], ['읽어요', '일거요', '익어요', '읽어여'], ['없어요', '업써요', '없어여', '업어요'],
  ['있어요', '이써요', '잇어요', '있어여'], ['많이', '만이', '많히', '마니'], ['밥을', '바블', '밥얼', '밥슬'],
  ['꽃이', '꼬치', '꽃히', '꼿이'], ['웃음', '우슴', '웃슴', '웃옴'], ['앉아요', '안자요', '앉아여', '안아요'],
  ['싫어요', '시러요', '싫어여', '실어요'], ['넓어요', '널버요', '넓어여', '넙어요'], ['값이', '갑시', '갑이', '값히'],
  ['닭이', '다기', '닥이', '닭히'], ['맑아요', '말가요', '맑아여', '막아요'], ['낮에', '나제', '낮애', '낫에'],
  ['밖에', '바께', '밖애', '박에'], ['부엌', '부억', '부얼', '부어'], ['무릎', '무릅', '무룹', '물릎'],
  ['잎사귀', '입사귀', '잎싸귀', '이사귀'], ['돌멩이', '돌맹이', '돌멘이', '돌멩니'], ['아기', '아키', '악이', '아끼'],
  ['엄마', '옴마', '엄맘', '업마'], ['선생님', '선생닙', '성생님', '선생임'], ['친구', '칭구', '친규', '칟구'],
  ['고양이', '고얗이', '고냥이', '고양히'], ['강아지', '강아찌', '강앗이', '깡아지'], ['토끼', '토키', '톡끼', '토께'],
  ['안녕하세요', '안녕하새요', '안냥하세요', '안녕하세여'], ['미안해요', '미안해여', '미한해요', '미안애요'], ['고마워요', '고마워여', '고마와요', '고맙워요'],
]

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
  const nSpell = Math.round(count * 0.3)
  const nDef = count - nSpell
  const defs = sample(HG_BANK, nDef).map((w) => {
    const same = HG_BANK.filter((x) => x.w !== w.w && x.cat === w.cat)
    const pool = same.length >= 3 ? same : HG_BANK.filter((x) => x.w !== w.w)
    const others = sample(pool, 3)
    return { kind: 'choice', q: w.def, sub: '이 설명에 맞는 낱말은?', options: shuffle([w.w, ...others.map((o) => o.w)]), answer: w.w, small: true }
  })
  const spells = sample(SPELL_BANK, nSpell).map(([right, ...wrong]) => (
    { kind: 'choice', q: '바르게 쓴 낱말은?', sub: '', options: shuffle([right, ...wrong]), answer: right }
  ))
  return shuffle([...defs, ...spells])
}

export function makeQuestions(subject, count) {
  if (subject === 'times') return times(count)
  if (subject === 'english') return english(Math.min(count, EN_BANK.length))
  return hangul(Math.min(count, HG_BANK.length))
}
