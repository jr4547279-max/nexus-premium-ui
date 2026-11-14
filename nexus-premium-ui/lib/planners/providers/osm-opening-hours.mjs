const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function minutes(value) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function isInTimeRanges(ranges, current) {
  const parsed = ranges.split(',').map((range) => {
    const match = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(range.trim())
    if (!match) return null
    const open = minutes(match[1])
    const close = minutes(match[2])
    if (open == null || close == null) return null
    return { open, close }
  })
  if (parsed.some((range) => range === null)) return null
  return parsed.some((range) => range !== null && (range.close < range.open
    ? current >= range.open || current <= range.close
    : current >= range.open && current <= range.close))
}

/** Evaluate only simple, explicit OSM hours; unsupported expressions are unknown. */
export function evaluateOsmOpeningHours(value, dayOfWeek, time) {
  if (typeof value !== 'string' || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return null
  const current = minutes(time)
  if (current == null) return null
  const expression = value.trim()
  if (expression === '24/7') return true
  if (expression.includes(';') || /\b(PH|SH|sunrise|sunset|open|unknown)\b/i.test(expression)) return null
  if (/^(off|closed)$/i.test(expression)) return false

  const daily = /^(\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})(?:,\d{1,2}:\d{2}-\d{1,2}:\d{2})*)$/.exec(expression)
  if (daily) return isInTimeRanges(daily[1], current)

  const match = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?\s+(off|closed|\d{1,2}:\d{2}-\d{1,2}:\d{2}(?:,\d{1,2}:\d{2}-\d{1,2}:\d{2})*)$/i.exec(expression)
  if (!match) return null
  const start = DAYS.findIndex((day) => day.toLowerCase() === match[1].toLowerCase())
  const end = match[2] ? DAYS.findIndex((day) => day.toLowerCase() === match[2].toLowerCase()) : start
  if (start < 0 || end < 0) return null
  const dayMatches = start <= end
    ? dayOfWeek >= start && dayOfWeek <= end
    : dayOfWeek >= start || dayOfWeek <= end
  if (!dayMatches || /^(off|closed)$/i.test(match[3])) return false
  return isInTimeRanges(match[3], current)
}
