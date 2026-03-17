# ThingsBoard Extension

This repository contains the **ThingsBoard Extension** codebase. Follow the instructions below to integrate, develop, and deploy your custom widgets and components.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20.20.0
- [Yarn](https://classic.yarnpkg.com/) >= 1.22.22 (Yarn Classic)

## Getting Started

Install dependencies and start the development server:

```bash
yarn install
yarn start
```

### Configure the Widget

1. Create a new widget in the ThingsBoard **Widgets Library**.
2. In the **Resources** tab of the widget editor, add the following URL:
   ```
   http://localhost:5000/static/widgets/thingsboard-extension-widgets.js
   ```
3. Ensure the **"Is extension"** checkbox is checked.

## Build

To compile the project for production, run:

```bash
yarn build
```

The compiled file will be generated at: `target/generated-resources/thingsboard-extension-widgets.js`

## Deployment

After a successful build, deploy your extension to production in two steps:

### Step 1 — Upload the Extension

1. In the ThingsBoard UI, go to **Resources** > **JavaScript library**
2. Click the **"+"** button in the upper-right corner
3. Select **Extension** from the "JavaScript type" dropdown
4. Enter a title for your extension
5. Drag and drop the compiled file from the build output:
   ```
   target/generated-resources/thingsboard-extension-widgets.js
   ```
6. Click **Add**

### Step 2 — Connect to a Widget

1. Open or create a widget in the **Widgets Library**
2. Go to the **Resources** tab
3. Click **Add**, then check the **"Is extension"** checkbox
4. Select your uploaded extension from the dropdown
5. Use your custom component tag in the **HTML** tab

Your widget is now production-ready.

> For more details, see the [Advanced Development Guide](https://thingsboard.io/docs/user-guide/contribution/ui/advanced-development/).

## ThingsBoard Dependencies

To import ThingsBoard core dependencies into your extension components, use the following import structure:

```typescript
import { <dependency> } from '<TB-module>/public-api';
```

### Supported Modules

You can import from any of the following ThingsBoard modules:

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

## Examples

The `examples/` directory contains ready-to-use widget examples configured for development mode. Each example includes a detailed README and a JSON config for import:

- **[example-table](examples/example-table)** — basic widget creation (table with key-value pairs)
- **[example-chart](examples/example-chart)** — ECharts library integration
- **[example-table-with-custom-settings](examples/example-table-with-custom-settings)** — custom settings (basic, advanced, and data key)
- **[example-table-with-custom-subscription](examples/example-table-with-custom-subscription)** — custom data subscriptions
- **[example-of-using-third-party-library](examples/example-of-using-third-party-library)** — third-party npm packages (PrimeNG)
- **[example-action](examples/example-action)** — custom actions with HTML templates

## Migration & Updates

To ensure your extension remains compatible with the latest platform features, periodic updates are required.

Please refer to the **[Updating Guide](UPDATING.md)** for detailed migration scripts, framework updates, and version-specific instructions.
