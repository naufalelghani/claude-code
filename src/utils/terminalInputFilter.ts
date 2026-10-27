/**
 * Filters terminal control replies and escape sequences from early keyboard input.
 *
 * Terminal queries such as XTVERSION reply with string-control sequences:
 * ESC P ... ESC \\. Unlike CSI key sequences, DCS/OSC payloads may contain
 * printable characters and must be discarded through their actual terminator.
 * State is retained across chunks because stdin can split a response anywhere.
 */
type ParserState =
  | 'ground'
  | 'escape'
  | 'escape-intermediate'
  | 'csi'
  | 'control-string'
  | 'control-string-escape'

type StringTerminator = 'st' | 'bel-or-st'

export function createTerminalInputFilter(): (chunk: string) => string {
  let state: ParserState = 'ground'
  let stringTerminator: StringTerminator = 'st'

  return (chunk: string): string => {
    let output = ''

    for (const char of chunk) {
      const code = char.charCodeAt(0)

      switch (state) {
        case 'ground': {
          if (code === 0x1b) {
            state = 'escape'
            continue
          }
          // Also recognize the 8-bit forms for terminals that emit C1 controls.
          if (code === 0x9b) {
            state = 'csi'
            continue
          }
          if (code === 0x90 || code === 0x9e || code === 0x9f) {
            state = 'control-string'
            stringTerminator = 'st'
            continue
          }
          if (code === 0x9d) {
            state = 'control-string'
            stringTerminator = 'bel-or-st'
            continue
          }
          output += char
          continue
        }

        case 'escape': {
          if (char === '[') {
            state = 'csi'
          } else if (char === ']') {
            state = 'control-string'
            stringTerminator = 'bel-or-st'
          } else if (char === 'P' || char === 'X' || char === '^' || char === '_') {
            state = 'control-string'
            stringTerminator = 'st'
          } else if (code >= 0x20 && code <= 0x2f) {
            state = 'escape-intermediate'
          } else {
            // A normal two-byte ESC sequence ends with this character.
            state = 'ground'
          }
          continue
        }

        case 'escape-intermediate': {
          if (code >= 0x30 && code <= 0x7e) {
            state = 'ground'
          } else if (code < 0x20 || code > 0x2f) {
            state = 'ground'
          }
          continue
        }

        case 'csi': {
          // CSI ends only at a final byte, not at its '[' introducer.
          if (code >= 0x40 && code <= 0x7e) {
            state = 'ground'
          } else if (code === 0x1b) {
            state = 'escape'
          }
          continue
        }

        case 'control-string': {
          if (stringTerminator === 'bel-or-st' && code === 0x07) {
            state = 'ground'
          } else if (code === 0x9c) {
            state = 'ground'
          } else if (code === 0x1b) {
            state = 'control-string-escape'
          }
          continue
        }

        case 'control-string-escape': {
          if (char === '\\') {
            state = 'ground'
          } else if (code !== 0x1b) {
            // ESC not followed by backslash is payload within the string.
            state = 'control-string'
          }
          continue
        }
      }
    }

    return output
  }
}
