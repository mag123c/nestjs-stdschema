# Contributing to nestjs-stdschema

Thank you for your interest in contributing!

## Quick Start

```bash
# Fork and clone the repository
git clone https://github.com/<your-username>/nestjs-stdschema.git
cd nestjs-stdschema

# Install dependencies
pnpm install

# Run tests
pnpm test

# Build
pnpm build
```

## Development

```bash
pnpm dev          # Watch mode
pnpm test:watch   # Test watch mode
pnpm lint:fix     # Fix linting issues
```

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Commits are validated by commitlint.

```
feat: add new feature
fix: bug fix
docs: documentation only
test: add or update tests
refactor: code refactoring
chore: maintenance tasks
# also: style, perf, build, ci, revert
```

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes with appropriate tests
3. Ensure all tests pass (`pnpm test`)
4. Ensure linting passes (`pnpm lint`)
5. Submit a PR with a clear description

## Adding New Validator Support

See [Adding New Validators](./ADDING_VALIDATORS.md) for a guide on integrating and testing new standard-schema compatible validators.

## Questions?

Feel free to open an issue for questions or discussions.
