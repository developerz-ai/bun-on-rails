import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'BunOnRails',
  description: 'A full-stack JavaScript framework built on Bun with Rails-like conventions',

  // Served as a GitHub Pages project site: https://developerz-ai.github.io/bun-on-rails/
  base: '/bun-on-rails/',

  // Plans and the folder index are for contributors, not the public site.
  srcExclude: ['plans/**', 'README.md'],

  // A dead internal link fails the build (bin/check runs docs:build).
  ignoreDeadLinks: false,

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/eng/getting-started/introduction' },
      { text: 'Routing & Controllers', link: '/eng/routing/overview' },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/eng/getting-started/introduction' },
          { text: 'Installation', link: '/eng/getting-started/installation' },
          { text: 'Quick Start', link: '/eng/getting-started/quick-start' },
          { text: 'Project Structure', link: '/eng/getting-started/project-structure' },
        ]
      },
      {
        text: 'Guides',
        items: [
          { text: 'Routing & Controllers', link: '/eng/routing/overview' },
          { text: 'Vibe Coding', link: '/eng/guides/vibe-coding' },
        ]
      },
      {
        text: 'Database',
        items: [
          { text: 'Overview', link: '/eng/database/overview' },
          { text: 'Models', link: '/eng/database/models' },
          { text: 'Queries', link: '/eng/database/queries' },
          { text: 'Migrations', link: '/eng/database/migrations' },
        ]
      },
      {
        text: 'Jobs',
        items: [
          { text: 'Overview', link: '/eng/jobs/overview' },
        ]
      },
      {
        text: 'Core Concepts',
        items: [
          { text: 'Philosophy', link: '/eng/core-concepts/philosophy' },
          { text: 'Convention over Configuration', link: '/eng/core-concepts/convention-over-configuration' },
          { text: 'Bun Runtime', link: '/eng/core-concepts/bun-runtime' },
        ]
      },
      {
        text: 'Deployment',
        items: [
          { text: 'Overview', link: '/eng/deployment/overview' },
        ]
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/developerz-ai/bun-on-rails' }
    ]
  }
})
