# Labs

Labs are static demo pages that show each area of the editor with neutral sample documents. They are debugging and review pages, not package API. Each lab is a static file `labs/<name>.html` that loads the bundle `npm run build:labs` builds into `labs/build/<name>.js`, and `npm run serve:labs` serves them at `127.0.0.1`, port 4183 or the `LABS_PORT` environment variable.

## DOCE-LABS-1 - Pages

### DOCE-LABS-1.1 - Local start

`npm run labs` shall bring a checkout's labs up to date before serving them with the supplied server, passing its server options through: it runs `npm ci` when the dependencies are missing or `package-lock.json` changed since the last install, and `npm run build:labs` after an install, when the labs are not built, or when a lab source (the library and lab sources, the installed dependencies, the package and TypeScript configuration and the labs build scripts) changed, was added or was removed since the last build. It leaves a `node_modules` linked from another checkout alone. `--dry-run` prints the steps it would run, or that the labs are up to date, without running them or serving.

Implementation: `scripts/start-labs.mjs`, `package.json`
Verification: `test/start-labs.test.ts`
