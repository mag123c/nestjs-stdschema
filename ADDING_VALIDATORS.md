# Adding New Validator Support

This guide explains how to add integration tests for new [standard-schema](https://github.com/standard-schema/standard-schema) compatible validators.

## Prerequisites

The validator must implement the standard-schema specification (`~standard` interface). Check the [full list of compatible validators](https://github.com/standard-schema/standard-schema#what-schema-libraries-implement-the-spec).

## Steps

### 1. Add the validator as a dev dependency

```bash
pnpm add -D <validator-package>
```

### 2. Create an integration test file

Create `tests/integration/<validator>.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import * as v from '<validator-package>'; // adjust import
import { StandardValidationPipe, createStandardDto } from '../../src';

describe('<Validator> Integration', () => {
  describe('primitive types', () => {
    it('should work with string schema', async () => {
      const schema = v.string(); // adjust API
      const pipe = new StandardValidationPipe(schema);

      const result = await pipe.transform('hello', { type: 'body' });
      expect(result).toBe('hello');
    });

    it('should reject invalid input', async () => {
      const schema = v.string();
      const pipe = new StandardValidationPipe(schema);

      await expect(pipe.transform(123, { type: 'body' })).rejects.toThrow();
    });
  });

  describe('object types', () => {
    it('should work with object schema', async () => {
      const schema = v.object({
        name: v.string(),
        age: v.number(),
      });
      const pipe = new StandardValidationPipe(schema);

      const result = await pipe.transform(
        { name: 'John', age: 30 },
        { type: 'body' },
      );

      expect(result).toEqual({ name: 'John', age: 30 });
    });
  });

  describe('createStandardDto integration', () => {
    it('should work with DTO class', async () => {
      const UserSchema = v.object({
        name: v.string(),
        email: v.string(), // with email validation if available
      });

      class UserDto extends createStandardDto(UserSchema) {}

      const pipe = new StandardValidationPipe();
      const result = await pipe.transform(
        { name: 'John', email: 'john@example.com' },
        { type: 'body', metatype: UserDto },
      );

      expect(result).toEqual({ name: 'John', email: 'john@example.com' });
    });
  });
});
```

### 3. Test categories to cover

Reference existing tests in `tests/integration/zod.spec.ts` and `valibot.spec.ts`:

| Category | Description |
|----------|-------------|
| Primitive types | string, number, boolean |
| Object types | nested objects, optional/nullable fields |
| Array types | arrays of primitives and objects |
| Validation constraints | email, url, min/max, etc. |
| Transformations | coercion, custom transforms |
| Enum types | string enums, native enums |
| Union types | discriminated unions if supported |
| DTO integration | `createStandardDto` compatibility |

### 4. Run tests

```bash
pnpm test
```

### 5. Update README (optional)

If tests pass, update the "Supported Validators" table in README.md:

```markdown
| [ValidatorName](link) | ^x.x.x | Tested |
```

## Example PR

Your PR should include:

1. `pnpm-lock.yaml` update (new dev dependency)
2. `tests/integration/<validator>.spec.ts`
3. README.md update (change "Compatible" to "Tested")

## Questions?

Open an issue if you need help with a specific validator integration.
