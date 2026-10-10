/* global Buffer, clearTimeout, setTimeout */

import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

const stripBrackets = (value) => value.replace(/^\[|\]$/g, '')

export const isNonPublicIp = (value) => {
  const normalized = stripBrackets(value).toLowerCase()
  if (net.isIP(normalized) === 4) {
    const [first, second, third] = normalized.split('.').map(Number)
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0 && third === 0) ||
      (first === 192 && second === 0 && third === 2) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51) ||
      (first === 203 && second === 0 && third === 113) ||
      first >= 224
    )
  }
  if (net.isIP(normalized) !== 6) return false
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return (
    (mappedIpv4 && isNonPublicIp(mappedIpv4[1])) ||
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff') ||
    normalized.startsWith('2001:db8:')
  )
}

const isBlockedHostname = (value) => {
  const hostname = stripBrackets(value).toLowerCase().replace(/\.$/, '')
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.home.arpa') ||
    hostname === 'metadata.google.internal' ||
    hostname === 'metadata.google' ||
    hostname === '169.254.169.254'
  )
}

export const resolvePublicHost = async (
  url,
  { dnsLookup = dns.lookup, timeoutMs = 5_000 } = {}
) => {
  const hostname = stripBrackets(url.hostname)
  if (isBlockedHostname(hostname) || isNonPublicIp(hostname)) {
    throw Object.assign(new Error('Private or internal destination blocked'), {
      code: 'PRIVATE_DESTINATION'
    })
  }
  if (net.isIP(hostname))
    return [{ address: hostname, family: net.isIP(hostname) }]

  let timer
  try {
    const addresses = await Promise.race([
      dnsLookup(hostname, { all: true, verbatim: true }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            Object.assign(new Error('DNS lookup timed out'), {
              code: 'DNS_TIMEOUT'
            })
          )
        }, timeoutMs)
      })
    ])
    if (
      !addresses.length ||
      addresses.some(({ address }) => isNonPublicIp(address))
    ) {
      throw Object.assign(
        new Error('DNS resolved to a private or internal address'),
        { code: 'PRIVATE_DESTINATION' }
      )
    }
    return addresses
  } catch (error) {
    if (error.code === 'PRIVATE_DESTINATION') throw error
    throw Object.assign(new Error(error.message || 'DNS lookup failed'), {
      code: error.code === 'DNS_TIMEOUT' ? 'DNS_TIMEOUT' : 'DNS_ERROR',
      cause: error
    })
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const readResponse = (response, bodySampleLimit) =>
  new Promise((resolvePromise) => {
    const chunks = []
    let size = 0
    response.on('data', (chunk) => {
      if (size < bodySampleLimit) {
        const remaining = bodySampleLimit - size
        const sample = chunk.subarray(0, remaining)
        chunks.push(sample)
        size += sample.length
      }
    })
    const finish = () =>
      resolvePromise({
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      })
    response.on('end', finish)
    response.on('error', finish)
  })

export const requestOnce = (
  url,
  method,
  addresses,
  {
    timeoutMs = 12_000,
    bodySampleLimit = 64 * 1024,
    userAgent = 'BlogR-Link-Health-Audit/1.0 (+https://blogr.directory)'
  } = {}
) =>
  new Promise((resolvePromise, reject) => {
    const client = url.protocol === 'https:' ? https : http
    const hostname = stripBrackets(url.hostname)
    const request = client.request(
      {
        protocol: url.protocol,
        hostname,
        port: url.port || undefined,
        path: `${url.pathname || '/'}${url.search}`,
        method,
        headers: {
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'user-agent': userAgent
        },
        lookup: (_host, _options, callback) => {
          if (_options.all) {
            callback(null, addresses)
            return
          }
          const address = addresses[0]
          callback(null, address.address, address.family)
        }
      },
      async (response) =>
        resolvePromise(await readResponse(response, bodySampleLimit))
    )
    request.setTimeout(timeoutMs, () => {
      request.destroy(
        Object.assign(new Error('Request timed out'), { code: 'TIMEOUT' })
      )
    })
    request.on('error', reject)
    request.end()
  })
