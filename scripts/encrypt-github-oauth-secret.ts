import { createCipheriv, randomBytes } from 'node:crypto'

// This key must match X9CDJSA_KEY_PARTS in src/services/oauth/github-client.ts.
// Since it ships with the source, this provides obfuscation, not strong secrecy.
const KEY_PARTS = [
  '6b7f2a91d4e8305c',
  'a1c6e9f2037b4d85',
  '9f0c2e7a5b1d8c43',
  'e6a402d7195f83bc',
] as const

const secret = process.env.GITHUB_OAUTH_CLIENT_SECRET
if (!secret) {
  throw new Error('Set GITHUB_OAUTH_CLIENT_SECRET in your local shell before running this script.')
}

const key = Buffer.from(KEY_PARTS.join(''), 'hex')
const iv = randomBytes(12)
const cipher = createCipheriv('aes-256-gcm', key, iv)
const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
const tag = cipher.getAuthTag()

// Output only the encrypted payload; never print the plaintext secret.
process.stdout.write(`${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}\n`)
