// Minimal RFC4180 CSV parser (no dependency).
export function parseCsv(input: string): Record<string, string>[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  let i = 0
  const endRecord = () => {
    record.push(field)
    field = ''
    // skip fully blank lines
    if (!(record.length === 1 && record[0] === '')) records.push(record)
    record = []
  }
  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += c; i++; continue
    }
    if (c === '"') { inQuotes = true; i++ }
    else if (c === ',') { record.push(field); field = ''; i++ }
    else if (c === '\r') { endRecord(); i += text[i + 1] === '\n' ? 2 : 1 }
    else if (c === '\n') { endRecord(); i++ }
    else { field += c; i++ }
  }
  if (field !== '' || record.length > 0) endRecord()
  if (records.length === 0) return []
  const header = records[0].map((h) => h.trim())
  return records.slice(1).map((r) => {
    const o: Record<string, string> = {}
    header.forEach((h, idx) => { o[h] = r[idx] ?? '' })
    return o
  })
}
