import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'BunOnRails',
  description: 'A full-stack JavaScript framework built on Bun with Rails-like conventions',

  // Ignore dead links for now - docs are still being written
  ignoreDeadLinks: true,

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/eng/getting-started/quick-start' },
      { text: 'API', link: '/eng/core-concepts/overview' },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Quick Start', link: '/eng/getting-started/quick-start' },
          { text: 'Project Structure', link: '/eng/getting-started/project-structure' },
        ]
      },
      {
        text: 'Database',
        items: [
          { text: 'Overview', link: '/eng/database/overview' },
        ]
      },
      {
        text: 'Jobs',
        items: [
          { text: 'Overview', link: '/eng/jobs/overview' },
        ]
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/developerz-ai/bun-on-rails' }
    ]
  }
})
