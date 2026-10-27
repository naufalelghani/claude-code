import { describe, expect, test } from 'bun:test'
import { INITIAL_STATE, parseMultipleKeypresses } from './parse-keypress.js'

describe('parseMultipleKeypresses terminal replies', () => {
  test('discards an incomplete XTVERSION reply instead of emitting it as key input on flush', () => {
    const partialResponse = '\x1bP>|xterm.js(6.1'
    const [, bufferedState] = parseMultipleKeypresses(INITIAL_STATE, partialResponse)

    expect(bufferedState.incomplete).toBe(partialResponse)

    const [flushedKeys, flushedState] = parseMultipleKeypresses(bufferedState, null)

    expect(flushedKeys).toEqual([])
    expect(flushedState.incomplete).toBe('')

    const [typedKeys] = parseMultipleKeypresses(flushedState, 'a')
    expect(typedKeys).toEqual([expect.objectContaining({ kind: 'key', name: 'a' })])
  })

  test('recognizes a complete XTVERSION reply as a terminal response', () => {
    const completeResponse = '\x1bP>|xterm.js(6.1.0)\x1b\\'
    const [keys] = parseMultipleKeypresses(INITIAL_STATE, completeResponse)

    expect(keys).toEqual([
      {
        kind: 'response',
        sequence: completeResponse,
        response: { type: 'xtversion', name: 'xterm.js(6.1.0)' },
      },
    ])
  })

  test('discards incomplete OSC and APC control strings on flush', () => {
    for (const partialResponse of ['\x1b]11;rgb:ffff', '\x1b_name']) {
      const [, bufferedState] = parseMultipleKeypresses(INITIAL_STATE, partialResponse)
      const [flushedKeys] = parseMultipleKeypresses(bufferedState, null)

      expect(flushedKeys).toEqual([])
    }
  })
})
