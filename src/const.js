export const CATS = {
  food:{e:'🍫',n:'먹거리'}, toy:{e:'🧸',n:'장난감'}, study_buy:{e:'✏️',n:'학용품'},
  book:{e:'📚',n:'책'}, gift:{e:'🎁',n:'선물'}, donate:{e:'💝',n:'기부'},
  game:{e:'🎮',n:'게임'}, tv:{e:'📺',n:'TV'},
}
export const BUY_CATS = ['food','toy','study_buy','book','gift','donate']
export const QCAT = {
  study:{e:'📚',n:'학습',c:'q-study'}, help:{e:'🧹',n:'도움',c:'q-help'}, health:{e:'🏃',n:'건강',c:'q-health'},
}
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
  return [catInfo(t.category).e, 'ic-spend']
}
