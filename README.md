# ThingsBoard Platform Extension

This repository contains the **ThingsBoard Extension** codebase. Follow the instructions below to integrate, develop, and deploy your custom widgets and components.

## Migration & Updates

To ensure your extension remains compatible with the latest platform features and security standards, periodic updates are required.

Please refer to the **[Updating Guide](UPDATING.md)** for detailed migration scripts, framework updates, and version-specific instructions.

---

## ThingsBoard Dependencies
To import ThingsBoard core dependencies into your extension components, use the following import structure:

```typescript
import { <dependency> } from '<TB-module>/public-api';
```

### Supported TB Modules
You can import from any of the following modules:

- `@app/*`
- `@core/*`
- `@shared/*`
- `@modules/*`
- `@home/*`

**Note:** Refer to the [modules-map](https://github.com/thingsboard/thingsboard-pe-ui-types/blob/master/src/app/modules/common/modules-map.ts)
to see available types and dependencies.

**Example:**

```typescript
import { WidgetConfig } from '@shared/public-api';
```

---

## External Dependencies
To use third-party packages from the npm registry, add them using the Yarn package manager:

```bash
yarn add <package-name>
```

**Example:**
```bash
yarn add lodash
```
For non-standard registries or alternative installation methods, please refer to the [Yarn Documentation](https://classic.yarnpkg.com/en/docs/cli/add).

---

## Development Mode

1. **Install dependencies and start the server:**
```bash
yarn install
yarn start
```

2. **Configure the Widget:**
    - Create a new widget in the ThingsBoard **Widgets Library**.
    - In the **Resources** tab of the widget editor, add the following file path: `http://localhost:5000/static/widgets/thingsboard-extension-widgets.js`
    - Ensure the **"Is module"** checkbox is checked.

---

## Build Instructions

To install dependencies and compile the project for production, run:
```bash
yarn install
yarn build
```

The compiled file will be generated at: `target/generated-resources/thingsboard-extension-widgets.js`

---

## Deployment

There are two options for deploying extensions to a customer server:
1) **UI Deployment:** Use the built-in ThingsBoard interface. Detailed instructions can be found in the [Official Documentation](https://thingsboard.io/docs/user-guide/contribution/widgets-development/#thingsboard-extensions)
2) **Manual Deployment:** Use the specific [server-release branch](https://github.com/thingsboard/thingsboard-extensions/tree/release-3.6-server) for manual implementation.
