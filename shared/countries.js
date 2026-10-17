// ISO 3166-1 alpha-2 country codes. The four UK nation codes below are
// documented BlogR extensions because they do not have ISO 3166-1 codes.
const ISO_COUNTRY_CODES = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT
MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU
RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ
UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
`
  .trim()
  .split(/\s+/)

const customCountries = [
  {
    code: 'GB-ENG',
    name: 'England',
    flag: '\u{1f3f4}\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}'
  },
  {
    code: 'GB-NIR',
    name: 'Northern Ireland',
    // Unicode has no dedicated Northern Ireland flag sequence.
    flag: '🇬🇧'
  },
  {
    code: 'GB-SCT',
    name: 'Scotland',
    flag: '\u{1f3f4}\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}'
  },
  {
    code: 'GB-WLS',
    name: 'Wales',
    flag: '\u{1f3f4}\u{e0067}\u{e0062}\u{e0077}\u{e006c}\u{e0073}\u{e007f}'
  }
]

const displayNames = new Intl.DisplayNames(['en'], { type: 'region' })

const isoCountries = ISO_COUNTRY_CODES.map((code) => ({
  code,
  name: displayNames.of(code),
  flag: String.fromCodePoint(
    ...code.split('').map((character) => 0x1f1e6 + character.charCodeAt(0) - 65)
  )
}))

export const COUNTRY_NOT_SPECIFIED = 'Not specified'
export const COUNTRIES = [...isoCountries, ...customCountries].sort((a, b) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
)
export const COUNTRY_CODES = new Set(COUNTRIES.map(({ code }) => code))
const COUNTRY_CODE_ALIASES = new Map([['GB-SCO', 'GB-SCT']])

// Form-only convenience groups. The first code is the display anchor; the
// remaining codes are shown immediately after it without changing their
// individual identity or status.
export const COUNTRY_GROUPS = [
  ['GB', 'GB-ENG', 'GB-SCT', 'GB-WLS', 'GB-NIR', 'IE'],
  ['US', 'PR', 'GU', 'VI'],
  ['DK', 'GL', 'FO'],
  ['NL', 'AW', 'CW', 'SX'],
  ['FR', 'GF', 'PF', 'NC'],
  ['CN', 'HK', 'MO'],
  ['NZ', 'CK', 'NU', 'TK']
]

export function getCountryInfo(code) {
  const normalized = COUNTRY_CODE_ALIASES.get(code) ?? code
  return COUNTRIES.find((country) => country.code === normalized) ?? null
}

export function countrySlug(countryOrCode) {
  const country =
    typeof countryOrCode === 'string'
      ? getCountryInfo(countryOrCode)
      : countryOrCode
  if (!country) return null

  return country.name
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replaceAll('&', ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function countryPath(countryOrCode) {
  const slug = countrySlug(countryOrCode)
  return slug ? `/country/${slug}` : null
}

export function normalizeCountryCode(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') {
    throw new Error('Invalid country code')
  }
  const normalized = COUNTRY_CODE_ALIASES.get(value) ?? value
  if (!COUNTRY_CODES.has(normalized)) throw new Error('Invalid country code')
  return normalized
}

export function countryOption(country) {
  return `${country.name} [${country.code}]`
}
