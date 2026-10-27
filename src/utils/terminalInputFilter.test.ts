import { describe, expect, test } from 'bun:test'
import { createTerminalInputFilter } from './terminalInputFilter.js'

describe('createTerminalInputFilter', () => {
  test('discards the XTVERSION DCS reply instead of leaking it into input', () => {
    const filter = createTerminalInputFilter()

    expect(filter('hello\x1bP>|xterm.js(6.1.0)\x1b\\world')).toBe('helloworld')
  })

  test('discards DCS replies split across stdin chunks', () => {
    const filter = createTerminalInputFilter()

    expect(filter('prompt \x1bP>|xterm.js(6.1.')).toBe('prompt ')
    expect(filter('0)\x1b\\')).toBe('')
    expect(filter(' next')).toBe(' next')
  })

  test('discards a complete CSI sequence, including its parameters', () => {
    const filter = createTerminalInputFilter()

    expect(filter('before\x1b[?2004hafter\x1b[A!')).toBe('beforeafter!')
  })

  test('discards OSC responses terminated by BEL or ST', () => {
    const filter = createTerminalInputFilter()

    expect(filter('a\x1b]11;rgb:0000/0000/0000\x07b')).toBe('ab')
    expect(filter('c\x1b]11;rgb:ffff/ffff/ffff\x1b\\d')).toBe('cd')
  })

  test('preserves plain typed input', () => {
    const filter = createTerminalInputFilter()

    expect(filter('write a prompt here')).toBe('write a prompt here')
    expect(filter(' with spaces\n')).toBe(' with spaces\n')
  })
})
