export const CATS = {
  food:{e:'🍫',n:'먹거리'}, toy:{e:'🧸',n:'장난감'}, study_buy:{e:'✏️',n:'학용품'},
  book:{e:'📚',n:'책'}, gift:{e:'🎁',n:'선물'}, donate:{e:'💝',n:'기부'},
  game:{e:'🎮',n:'게임'}, tv:{e:'📺',n:'TV'},
  fine:{e:'⚠️',n:'벌금'}, transfer:{e:'💌',n:'형제 송금'},
}
export const BUY_CATS = ['food','toy','study_buy','book','gift','donate']
export const QCAT = {
  study:{e:'📚',n:'학습',c:'q-study'}, help:{e:'🧹',n:'도움',c:'q-help'},
  manner:{e:'🌱',n:'예절',c:'q-manner'}, health:{e:'🏃',n:'건강',c:'q-health'},
}

// 가족이 미리 협의해 둔 '칭찬 코인 지급 목록'. 모두 건당 500원.
// unit 이 있으면 수량형(예: 권당 500원), 없으면 1회 완료당 500원.
export const PRESET_QUESTS = [
  { title:'장난감 정리하기', category:'help' },
  { title:'아침 기상 후 이부자리 정리하기', category:'help' },
  { title:'스스로 양보하기', category:'manner' },
  { title:'말을 동글동글하게 하기', category:'manner' },
  { title:'하고 싶은 것 제안하기', category:'manner' },
  { title:'영어책 읽기 (아빠가 읽어주는 책 듣기)', category:'study', unit:'권' },
  { title:'영어책 읽기 (따라 읽기)', category:'study', unit:'권' },
  { title:'책읽기 (그냥책)', category:'study', unit:'권' },
  { title:'만화책·패드 읽기 (2권당)', category:'study' },
  { title:'상 / 100점 받아오기 (발표회·수행평가 등)', category:'study' },
  { title:'받아쓰기 80점 이상', category:'study', who:'유찬' },
  { title:'수학 학습지 완료', category:'study', who:'유찬' },
  { title:'학습(국어+수학) 완료', category:'study', who:'유건' },
]
export const EMOJIS = ['🦊','🐰','🐱','🐶','🐻','🐼','🐯','🦁','🐨','🐸','🐵','🦄','🐹','🐥']
export const WEEKDAYS = ['일','월','화','수','목','금','토']

// 지급 요일(0=일..6=토) 기준, 가장 최근 지급일의 00:00 (Date)
export function allowanceWeekStart(day) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = (d.getDay() - day + 7) % 7
  d.setDate(d.getDate() - diff)
  return d
}

export const won = n => (n ?? 0).toLocaleString('ko-KR')
export const catInfo = c => CATS[c] || { e:'💸', n:c || '지출' }
export const stars = n => '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n)

export function txIcon(t){
  if (t.grp === 'income') return t.category === 'quest' ? ['🏆','ic-quest'] : ['🎁','ic-give']
  if (t.grp === 'fine') return ['⚠️','ic-fine']
  if (t.grp === 'transfer') return ['💌','ic-tr']
  if (t.grp === 'invest') return t.category === 'invest_deposit' ? ['🌱','ic-invest'] : ['💵','ic-invest']
  return [catInfo(t.category).e, 'ic-spend']
}

// 투자 이자율을 아이가 알아듣는 말로. supabase/functions/notify 의 investBand 와 짝을 맞춘다.
// 기준은 invest_config 기본값(0.15~0.5%)에 맞춘 것 — 그 설정을 바꾸면 이 경계도 같이 조정해야 한다.
export function investBand(ratePct) {
  const r = Number(ratePct)
  if (r >= 0.4) return { e: '📈', t: '세계 경제가 좋았어요' }
  if (r <= 0.2) return { e: '📉', t: '세계 경제가 주춤했어요' }
  return { e: '📊', t: '세계 경제가 보통이었어요' }
}
