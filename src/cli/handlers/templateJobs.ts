/**
 * CLI fast-path for template-job commands (`claude new|list|reply`),
 * wired in `src/entrypoints/cli.tsx` behind `feature('TEMPLATES')`.
 *
 * Templates are markdown files under `<config>/templates/` (the same
 * directory `markdownConfigLoader.ts` scans when the flag is on). This
 * module provides the three subcommand handlers; the jobs-runner
 * subsystem (execution, state.json, classification) is not yet
 * reconstructed in this snapshot, so `reply` shows the raw template
 * body instead of executing it.
 *
 * Convention: fatal usage errors print to stderr and exit(1), matching
 * the sibling CLI handlers in `src/cli/`.
 */
import { mkdir, readFile, readdir, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

export const TEMPLATE_SUBCOMMANDS = ['new', 'list', 'reply'] as const

function templatesRoot(): string {
  return join(getClaudeConfigHomeDir(), 'templates')
}

/** All .md files under the templates dir (recursive, newest listed last). */
async function listTemplateFiles(
  root: string,
): Promise<string[]> {
  try {
    const entries = await readdir(root, { recursive: true })
    return entries.filter(e => typeof e === 'string' && e.endsWith('.md'))
  } catch {
    return [] // Missing dir == no templates yet; not an error for `list`.
  }
}

/** Resolve `<name>` (with or without .md) to an existing template path. */
async function resolveTemplatePath(name: string): Promise<string> {
  const root = templatesRoot()
  const candidates = [join(root, name), join(root, `${name}.md`)]
  for (const candidate of candidates) {
    try {
      const s = await stat(candidate)
      if (s.isFile()) return candidate
    } catch {
      /* try next candidate */
    }
  }
  throw new Error(`Template not found: ${name}`)
}

async function newHandler(args: string[]): Promise<void> {
  const name = args.find(a => !a.startsWith('-'))?.replace(/[\\/]/g, '')
  if (!name) {
    console.error('Usage: claude new <name> [-- description]')
    process.exit(1)
  }
  const root = templatesRoot()
  await mkdir(root, { recursive: true })
  const filePath = join(root, `${name}.md`)
  try {
    await stat(filePath)
    console.error(`Template already exists: ${filePath}`)
    process.exit(1)
  } catch {
    /* ENOENT — proceed to create */
  }
  const body = `---\ndescription: TODO describe when this template applies\n---\n\n# ${name}\n\nTODO: template body. Placeholders like {{var}} are substituted at run time.\n`
  await writeFile(filePath, body, 'utf8')
  console.log(`Created template: ${filePath}`)
}

async function listHandler(): Promise<void> {
  const root = templatesRoot()
  const files = await listTemplateFiles(root)
  if (files.length === 0) {
    console.log(`No templates found (${root}). Create one with \`claude new <name>\`.`)
    return
  }
  for (const f of files) {
    // recursive readdir joins with the platform separator (\ on Windows).
    console.log(f.replace(/\\/g, '/'))
  }
}

async function replyHandler(args: string[]): Promise<void> {
  const name = args.find(a => !a.startsWith('-'))
  if (!name) {
    console.error('Usage: claude reply <template-name> [key=value]...')
    process.exit(1)
  }
  const filePath = await resolveTemplatePath(name)
  const body = await readFile(filePath, 'utf8')
  console.log(body)
  console.error(
    '\n[jobs] Template execution engine is not available in this build yet — ' +
      'the template content above is shown as-is.',
  )
}

/**
 * Entry point for the CLI fast-path. Receives argv *after* the subcommand
 * word (the dispatcher already matched `new|list|reply` against args[0]).
 */
export async function templatesMain(args: string[]): Promise<void> {
  const sub = args[0]
  switch (sub) {
    case 'new':
      await newHandler(args.slice(1))
      break
    case 'list':
      await listHandler()
      break
    case 'reply':
      await replyHandler(args.slice(1))
      break
    default:
      console.error(
        `Usage: claude ${TEMPLATE_SUBCOMMANDS.join('|')} ...`,
      )
      process.exit(1)
  }
}
