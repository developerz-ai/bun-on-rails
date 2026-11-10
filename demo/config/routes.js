/**
 * Application Routes
 *
 * A JSON API for posts and their comments. Writes need the API token
 * (ApplicationController#requireToken).
 */

export default (router) => {
  router.get('/health', 'health#index')

  router.resources('posts', { only: ['index', 'show', 'create', 'update', 'destroy'] }, () => {
    router.resources('comments', { only: ['index', 'create'] })
  })
}
