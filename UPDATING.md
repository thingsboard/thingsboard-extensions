# Updating Guide

## Updating the Codebase to Angular 20

This guide explains how to update your **ThingsBoard Extension** to ensure compatibility with ThingsBoard versions **4.2.1.3+**, **4.3.0.2+**, and **4.4.0+**.

### Steps

1. **Pull the latest changes** from the corresponding `release/*` branch and run:
   ```bash
   yarn install
   ```

2. **Migrate all components to standalone** (converts the application or specific modules to standalone components):
   ```bash
   yarn ng update @angular/core --migrate-only --from=18.0.0 --to=20.3.16
   ```

3. **Update Angular Material component styles**:
   ```bash
   yarn ng update @angular/material --migrate-only --from=18.0.0 --to=20.2.14
   ```

4. **Optional: Update control flow syntax** (converts the application to the new block control flow syntax using `@if`, `@for` and `@switch`):
   ```bash
   yarn ng generate @angular/core:control-flow
   ```
