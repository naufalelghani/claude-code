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

  test('discards an orphaned DA1 reply tail when its ESC was flushed separately', () => {
    const [, partialState] = parseMultipleKeypresses(INITIAL_STATE, '\x1b')
    const [, flushedState] = parseMultipleKeypresses(partialState, null)
    const [replyKeys] = parseMultipleKeypresses(flushedState, '[?61;4c')

    expect(replyKeys).toEqual([])
  })

  test('discards orphaned CSI terminal replies without swallowing following user text', () => {
    for (const responseTail of [
      '[?61;4c',
      '[>0;276;0c',
      '[?2026;1$y',
      '[?1u',
      '[?12;34R',
    ]) {
      const [keys] = parseMultipleKeypresses(INITIAL_STATE, responseTail)
      expect(keys).toEqual([])
    }

    const [keysWithFollowingText] = parseMultipleKeypresses(
      INITIAL_STATE,
      '[?61;4chello',
    )
    expect(keysWithFollowingText).toEqual([
      expect.objectContaining({ kind: 'key', sequence: 'hello' }),
    ])
  })
})
