# Veda Agent

Veda Agent is the new workspace shell for a future Agent, Notes, and Board desktop application.

The product name is now **Veda Agent**. The pi/Agent runtime is intentionally not connected yet. The current UI uses an explicit runtime placeholder and a local Haze-compatible material adapter.

## Component direction

- **Haze adapter**: visual material boundary for acrylic surfaces, blur, translucency, and platform fallback. The actual Haze package/API must be confirmed before importing a vendor package.
- **Radix UI**: headless interaction primitives when dialogs, menus, tabs, tooltips, or focus management are introduced.
- **Local Veda primitives**: `PaneFrame`, `TopBar`, layout tree, and feature composition stay owned by this app instead of hiding product behavior inside a generic component library.
- **Lucide**: consistent icon system for the first shell prototype.

## Current prototype

- Three-pane default layout: Agent placeholder, Notes, and Board.
- One/two/three layout controls in the top bar.
- Independent top-level tool entries.
- Local notes draft persistence in `localStorage`.
- Basic draggable board cards and zoom controls.
- Agent prompt staging without executing a model.

## Run

```bash
npm install
npm run dev
```

## Architecture handoff

The DS handoff documents are copied into `docs/architecture/`. Start with `docs/architecture/README.md`.

## Running the dev server

Open `http://localhost:5173/` after starting the server.

Foreground (double-click friendly on Windows):

```bash
start-veda.cmd
```

Detached background run that survives the launching shell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/launch-dev.ps1
```

The detached launcher writes its output to `.veda-dev.log`. Stop the server by ending the `node` process that listens on port 5173.
