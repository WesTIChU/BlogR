const parseIpv4 = (value) => {
  const parts = value.split('.').map(Number)
  return parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : null
}

export function parseIp(value) {
  const normalized = String(value || '')
    .replace(/^\[|\]$/g, '')
    .toLowerCase()
  const ipv4 = parseIpv4(normalized)
  if (ipv4) return { family: 4, bytes: ipv4 }

  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mappedIpv4) {
    const mapped = parseIpv4(mappedIpv4[1])
    if (mapped) return { family: 4, bytes: mapped }
  }

  if (!normalized.includes(':')) return null
  const groups = normalized.split('::')
  if (groups.length > 2) return null
  const left = groups[0] ? groups[0].split(':') : []
  const right = groups[1] ? groups[1].split(':') : []
  const expandedIpv4 = [...left, ...right].at(-1)
  if (expandedIpv4?.includes('.')) {
    const parsed = parseIpv4(expandedIpv4)
    if (!parsed) return null
    const replacement = [
      ((parsed[0] << 8) | parsed[1]).toString(16),
      ((parsed[2] << 8) | parsed[3]).toString(16)
    ]
    if (right.length) {
      right.splice(right.length - 1, 1, ...replacement)
    } else {
      left.splice(left.length - 1, 1, ...replacement)
    }
  }
  const missing = 8 - left.length - right.length
  if (missing < 0 || (groups.length === 1 && missing !== 0)) return null
  const values = [...left, ...Array(missing).fill('0'), ...right].map((group) =>
    Number.parseInt(group || '0', 16)
  )
  if (
    values.length !== 8 ||
    values.some(
      (value) => !Number.isInteger(value) || value < 0 || value > 0xffff
    )
  ) {
    return null
  }
  return {
    family: 6,
    bytes: values.flatMap((value) => [value >> 8, value & 0xff])
  }
}

export function isPrivateIp(value) {
  const parsed = parseIp(value)
  if (!parsed) return false
  if (parsed.family === 4) {
    const [a, b, c] = parsed.bytes
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    )
  }
  const first = parsed.bytes[0]
  const second = parsed.bytes[1]
  return (
    (first & 0xfe) === 0xfc ||
    (first === 0xfe && (second & 0xc0) === 0x80) ||
    first === 0xff ||
    (first === 0x20 &&
      second === 0x01 &&
      parsed.bytes[2] === 0x0d &&
      parsed.bytes[3] === 0xb8) ||
    parsed.bytes.every((byte) => byte === 0)
  )
}
