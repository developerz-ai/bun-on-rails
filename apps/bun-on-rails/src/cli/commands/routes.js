/**
 * brails routes - List all routes
 */

export const routesCommand = {
  name: 'routes',
  description: 'List all application routes',

  async run(args) {
    const filter = args.subcommand

    console.log('Loading routes...\n')

    // TODO: Load application routes
    // TODO: Format and display

    // Example output:
    console.log(`
Prefix       Verb     URI Pattern                      Controller#Action
─────────────────────────────────────────────────────────────────────────
root         GET      /                                home#index
posts        GET      /posts                           posts#index
             POST     /posts                           posts#create
new_post     GET      /posts/new                       posts#new
edit_post    GET      /posts/:id/edit                  posts#edit
post         GET      /posts/:id                       posts#show
             PATCH    /posts/:id                       posts#update
             PUT      /posts/:id                       posts#update
             DELETE   /posts/:id                       posts#destroy
`)

    if (filter) {
      console.log(`Filtered by: ${filter}`)
    }
  }
}
