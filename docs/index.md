---
layout: home

hero:
  name: BunOnRails
  text: Rails-like conventions for Bun
  tagline: An early-stage JavaScript framework. Routing, controllers and a PostgreSQL ORM work today; the rest is being built.
  actions:
    - theme: brand
      text: Get Started
      link: /eng/getting-started/quick-start
    - theme: alt
      text: View on GitHub
      link: https://github.com/developerz-ai/bun-on-rails

features:
  - title: Routing and controllers
    details: A Rails-style routing DSL with resources and namespaces, and controllers whose actions return JSON.
  - title: Active Record-style ORM
    details: Models with validations, callbacks, scopes and a query builder, plus migrations, on PostgreSQL, connected at boot from DATABASE_URL.
  - title: Built on Bun
    details: Plain JavaScript ES modules served by Bun.serve. No build step, and bun test for tests.
  - title: Not there yet
    details: Background jobs, mail, file storage, WebSocket channels, React helpers and authentication are scaffolds or missing. Each guide lists what is not implemented yet.
---
