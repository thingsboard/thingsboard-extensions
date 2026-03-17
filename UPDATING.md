# Updating Guide

This guide explains how to update your **ThingsBoard Extension** when migrating to a newer platform version.

## ThingsBoard 4.2.2+ / 4.3.1+ / 4.4.0+ (Angular 20)

This migration updates the codebase from Angular 18 to Angular 20.

### Steps

1. **Pull the latest changes** from the corresponding `release/*` branch and install dependencies:
   ```bash
   yarn install
   ```

2. **Migrate all components to standalone** (converts modules to standalone components):
   ```bash
   yarn ng update @angular/core --migrate-only --from=18.0.0 --to=20.3.20
   ```

3. **Update Angular Material component styles**:
   ```bash
   yarn ng update @angular/material --migrate-only --from=18.0.0 --to=20.2.14
   ```

4. **Optional — Update control flow syntax** (converts to the new `@if`, `@for`, and `@switch` block syntax):
   ```bash
   yarn ng generate @angular/core:control-flow
   ```

### Verify

After completing the migration, make sure the project builds and runs correctly:

```bash
yarn build
yarn start
```
