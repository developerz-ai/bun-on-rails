/**
 * brails credentials - Manage encrypted credentials
 */

export const credentialsCommand = {
  name: 'credentials',
  description: 'Manage encrypted credentials',

  async run(args) {
    const subcommand = args.subcommand || 'edit'

    if (subcommand === 'edit') {
      await editCredentials(args)
    } else if (subcommand === 'show') {
      await showCredentials(args)
    } else {
      throw new Error(`Unknown credentials command: ${subcommand}`)
    }
  }
}

async function editCredentials(args) {
  const env = args.options.environment || 'production'

  console.log(`Editing ${env} credentials...`)

  // TODO: Load master key
  // TODO: Decrypt credentials file
  // TODO: Open in $EDITOR
  // TODO: Re-encrypt on save

  console.log(`
Opening credentials in your editor...

Note: Credentials are encrypted with config/credentials/${env}.key
Never commit the .key file to version control.
`)
}

async function showCredentials(args) {
  const env = args.options.environment || 'production'

  console.log(`Showing ${env} credentials...\n`)

  // TODO: Load and decrypt credentials
  // TODO: Display (with sensitive values masked)

  console.log(`
secret_key_base: ******************
aws:
  access_key_id: AKI***************
  secret_access_key: ******************
sendgrid:
  api_key: ******************
`)
}
