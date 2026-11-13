Optimized tool selectionI’ll look at how the frontend app is currently bootstrapped and then I’ll give you a small export entry point you can load from another site without changing the app’s normal behavior.

Read [](file:///d%3A/DoOrDie/dolomite/frontend/src/routes/index.ts)

Read [](file:///d%3A/DoOrDie/dolomite/frontend/src/appState.ts)

Read [](file:///d%3A/DoOrDie/dolomite/frontend/src/routes/routes.ts)

Read [](file:///d%3A/DoOrDie/dolomite/frontend/src/routes/router.ts)

I’ve confirmed the app boots by creating a router and binding auth logout logic in main.ts. I’m shaping a small bridge module so a different site can invoke the app without rewriting the current SPA bootstrap.

Read [](file:///d%3A/DoOrDie/dolomite/frontend/package.json)

Read [](file:///d%3A/DoOrDie/dolomite/frontend/vite.config.mjs)

Created [](file:///d%3A/DoOrDie/dolomite/frontend/src/export.ts)

Replacing 17 lines with 8 lines in [](file:///d%3A/DoOrDie/dolomite/frontend/src/main.ts)

Read [](file:///d%3A/DoOrDie/dolomite/frontend/src/main.ts)

Replacing 16 lines with 7 lines in [](file:///d%3A/DoOrDie/dolomite/frontend/src/main.ts)


```

```
The bridge file is in place and the app entrypoint now routes through it; I’m compiling the frontend to verify the export works cleanly with the current TypeScript setup.

Ran terminal command: cd /d/d:\DoOrDie\dolomite\frontend ; npm run build
Completed with input: cd /d/d:\DoOrDie\dolomite\frontend ; npm run build

Ran terminal command: Set-Location "d:\DoOrDie\dolomite\frontend"; npm run build

## ✅ Export bridge for external site calls

I added a reusable bootstrap helper in export.ts and switched the normal app startup in main.ts to use it.

This lets another website:
- mount the app into a container,
- start on a specific route,
- reuse the same router/auth logic,
- and avoid double-binding listeners by using a singleton bootstrap.

### Example usage

```ts
import { bootstrapDolomite } from 'https://your-app-host.example.com/app.js';

const app = bootstrapDolomite({
  mountId: 'dolomite-app',
  startPath: '/images',
  onReady: (instance) => {
    console.log('Dolomite ready', instance);
  },
});

app.login('demo-token', 'demo-user', ['user']);
app.navigate('/scan');
```

### HTML embed pattern

```html
<div id="dolomite-app"></div>

<script type="module">
  const { bootstrapDolomite } = await import('https://your-app-host.example.com/app.js');
  const app = bootstrapDolomite({
    mountId: 'dolomite-app',
    startPath: '/login'
  });

  app.navigate('/pdf');
</script>
```

### What the helper exposes

The export module exposes:
- `bootstrapDolomite(...)`
- `window.Dolomite.bootstrap(...)`
- `window.Dolomite.app`

It also safely ensures there is an `#app` root element and reuses the same app instance instead of registering duplicate window listeners.

---

### Verification

I verified the frontend still builds successfully with:

```bash
Set-Location "d:\DoOrDie\dolomite\frontend"; npm run build
```

Result: Vite + TypeScript build succeeded and generated the production bundle in the dist folder.

If you want, I can also give you a version that is specifically designed for a script tag like:

```html
<script src="https://your-app-host.example.com/dolomite.js"></script>
```

so a remote site can call it without ES module imports.

Made changes.