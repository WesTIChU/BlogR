import assert from 'node:assert/strict'
import test from 'node:test'
import { isPrivateIp, parseIp } from './ip.js'

test('parses IPv4, IPv6 and IPv4-mapped IPv6 addresses', () => {
  assert.equal(parseIp('93.184.216.34').family, 4)
  assert.equal(parseIp('2001:4860:4860::8888').family, 6)
  assert.equal(parseIp('::ffff:192.0.2.1').family, 4)
  assert.equal(parseIp('not-an-ip'), null)
})

test('rejects private, reserved and multicast destinations', () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '198.51.100.10',
    '2001:db8::1',
    'fc00::1',
    'fe80::1',
    'ff02::1'
  ]) {
    assert.equal(isPrivateIp(address), true, address)
  }
  assert.equal(isPrivateIp('93.184.216.34'), false)
  assert.equal(isPrivateIp('2606:4700:4700::1111'), false)
})
