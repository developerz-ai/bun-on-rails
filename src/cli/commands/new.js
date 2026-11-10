/**
 * brails new <app-name> - Create a new application
 *
 * Copies src/cli/templates/app/ into ./<app-name>, fills in the app name and
 * this framework's own package name and version, then runs `bun install`
 * there (skip with --skip-install). The result boots with `brails dev` and no
 * database. Pinned by test/cli/new.test.js.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const templateRoot = join(here, '..', 'templates', 'app')
const frameworkPkg = JSON.parse(readFileSync(join(here, '..', '..', '..', 'package.json'), 'utf8'))

const APP_NAME = /^[a-z][a-z0-9_-]*$/

export const newCommand = {
  name: 'new',
  description: 'Create a new BunOnRails application',

  async run(args) {
    const appName = args.subcommand

    if (!appName) {
      throw new Error('Usage: brails new <app-name>')
    }
    if (!APP_NAME.test(appName)) {
      throw new Error(
        `Invalid app name "${appName}": use lowercase letters, digits, "-" and "_", starting with a letter`
      )
    }

    const target = resolve(process.cwd(), appName)
    if (existsSync(target)) {
      throw new Error(`${target} already exists; choose another name or remove it`)
    }

    const values = {
      APP_NAME: appName,
      FRAMEWORK_NAME: frameworkPkg.name,
      FRAMEWORK_VERSION: frameworkPkg.version
    }

    console.log(`Creating ${appName}/`)
    for (const template of listTemplates(templateRoot)) {
      const relative = outputPath(template)
      const destination = join(target, relative)
      mkdirSync(dirname(destination), { recursive: true })
      writeFileSync(destination, fill(readFileSync(join(templateRoot, template), 'utf8'), values))
      console.log(`  create  ${relative}`)
    }

    if (args.flags['skip-install']) {
      console.log('\nSkipped bun install (--skip-install).')
    } else {
      console.log('\nRunning bun install...')
      const install = Bun.spawnSync([process.execPath, 'install'], {
        cwd: target,
        stdio: ['inherit', 'inherit', 'inherit']
      })
      if (install.exitCode !== 0) {
        throw new Error(`bun install failed in ${appName}/ (exit ${install.exitCode}); run it there yourself`)
      }
    }

    console.log(`
Created ${appName}. Next:

  cd ${appName}
  brails dev

Then open http://localhost:3000
`)
  }
}

/**
 * Every template file under `dir`, as paths relative to it.
 *
 * @param {string} dir
 * @param {string} [prefix]
 * @returns {string[]}
 */
function listTemplates(dir, prefix = '') {
  return readdirSync(dir).sort().flatMap((name) => {
    const relative = prefix ? `${prefix}/${name}` : name
    return statSync(join(dir, name)).isDirectory() ? listTemplates(join(dir, name), relative) : [relative]
  })
}

/**
 * Template path to output path: drop `.tmpl`, and a leading `_` becomes `.`
 * (npm strips `.gitignore` from published packages, so dotfiles ship as `_name`).
 *
 * @param {string} template
 * @returns {string}
 */
function outputPath(template) {
  return template
    .replace(/\.tmpl$/, '')
    .split('/')
    .map((part) => part.replace(/^_/, '.'))
    .join('/')
}

/**
 * Replace `{{KEY}}` placeholders. An unknown key throws, so a template typo
 * cannot ship a literal `{{...}}` into a user's app.
 *
 * @param {string} text
 * @param {Record<string, string>} values
 * @returns {string}
 */
function fill(text, values) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key) => {
    if (!(key in values)) {
      throw new Error(`template placeholder {{${key}}} has no value`)
    }
    return values[key]
  })
}
