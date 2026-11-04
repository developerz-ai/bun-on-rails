/**
 * Application Routes
 */

export default (router) => {
  // Root route
  router.root('home#index')

  // Authentication
  router.get('/login', 'sessions#new')
  router.post('/login', 'sessions#create')
  router.delete('/logout', 'sessions#destroy')
  router.get('/signup', 'registrations#new')
  router.post('/signup', 'registrations#create')

  // Posts with nested comments
  router.resources('posts', () => {
    router.resources('comments', { only: ['create', 'destroy'] })
  })

  // Users
  router.resources('users', { only: ['index', 'show'] })

  // API namespace
  router.namespace('api', () => {
    router.namespace('v1', () => {
      router.resources('posts')
      router.resources('users')
    })
  })

  // Admin namespace
  router.namespace('admin', () => {
    router.root('dashboard#index')
    router.resources('posts')
    router.resources('users')
  })

  // Health check
  router.get('/health', 'health#index')
  router.get('/health/detailed', 'health#detailed')
}
