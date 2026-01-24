# Contributing to BunOnRails

Thank you for your interest in contributing to BunOnRails! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How to Contribute

### Reporting Bugs

1. Check existing issues to avoid duplicates
2. Use the bug report template
3. Include:
   - Bun version (`bun --version`)
   - BunOnRails version
   - Operating system
   - Steps to reproduce
   - Expected vs actual behavior

### Suggesting Features

1. Check existing feature requests
2. Open a discussion first for major features
3. Describe the use case and proposed solution

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Add tests for new functionality
5. Run the test suite: `bun test`
6. Run linting: `bun lint`
7. Commit with descriptive messages
8. Push to your fork
9. Open a pull request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/bun-on-rails.git
cd bun-on-rails

# Install dependencies
bun install

# Run tests
bun test

# Run linting
bun lint
```

## Project Structure

```
bun-on-rails/
├── src/                    # Framework source code
│   ├── cli/               # CLI commands
│   ├── database/          # ORM and migrations
│   ├── routing/           # Router implementation
│   ├── controller/        # Controller base class
│   ├── jobs/              # Background job system
│   ├── websocket/         # WebSocket/channels
│   ├── storage/           # File uploads
│   ├── cache/             # Caching layer
│   ├── mail/              # Email system
│   └── testing/           # Test utilities
├── templates/             # Generator templates
├── docs/                  # Documentation
└── test/                  # Framework tests
```

## Coding Standards

- Use ES modules (`import`/`export`)
- Write JSDoc comments for public APIs
- Follow existing code style
- Keep functions small and focused
- Prefer composition over inheritance
- Write tests for all new features

## Commit Messages

Follow conventional commits:

```
type(scope): description

feat(orm): add support for polymorphic associations
fix(router): handle trailing slashes correctly
docs(readme): update installation instructions
test(jobs): add tests for scheduled jobs
```

## Testing

- Write unit tests for isolated functionality
- Write integration tests for cross-component features
- Use descriptive test names
- Test edge cases and error conditions

```javascript
import { test, expect } from 'bun:test'

test('Post.create validates presence of title', async () => {
  const post = await Post.create({ body: 'content' })
  expect(post.errors.title).toContain('is required')
})
```

## Documentation

- Update docs for user-facing changes
- Include code examples
- Keep language clear and concise
- Add entries to CHANGELOG.md

## Release Process

1. Update CHANGELOG.md
2. Bump version in package.json
3. Create release PR
4. After merge, tag release
5. CI publishes to npm

## Questions?

- Open a discussion on GitHub
- Join our Discord community
- Check the documentation

Thank you for contributing!
