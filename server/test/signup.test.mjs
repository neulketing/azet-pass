// node --test test/signup.test.mjs — the sign-up token: right address and in time only.
import test from 'node:test'
import assert from 'node:assert/strict'
import { makeSignupToken, checkSignupToken } from '../src/signup.js'

test('signup token', async () => {
  const t = await makeSignupToken('s3cret', 'A@Example.com', 1000)
  assert.equal(await checkSignupToken('s3cret', 'a@example.com', t, 2000), 'ok')
  assert.equal(await checkSignupToken('s3cret', 'b@example.com', t, 2000), 'invalid')
  assert.equal(await checkSignupToken('other', 'a@example.com', t, 2000), 'invalid')
  assert.equal(await checkSignupToken('s3cret', 'a@example.com', t, 1000 + 24 * 3600e3 + 1), 'expired')
  assert.equal(await checkSignupToken('s3cret', 'a@example.com', 'fixed-token-to-mock', 2000), 'invalid')
  assert.equal(await checkSignupToken('s3cret', 'a@example.com', t.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), 2000), 'invalid')
  assert.equal(await checkSignupToken('s3cret', 'a@example.com', undefined, 2000), 'invalid')
})
