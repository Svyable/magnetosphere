<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Science/parsing logic lives in `src/lib/space/model.ts` (pure TS, tested in `model.test.ts`); the 3D scene only draws its outputs — keeps physics testable.
- All data is fetched client-side from NOAA/GFZ (no backend); missing values are dropped, never filled — honesty requirement.
- The 3D scene (`src/components/mag/Scene.tsx`) is lazy-loaded on an `ssr: false` route — three.js must not render on the server.
- Core-field (IGRF) math lives in `src/lib/space/igrf.ts` with tests in `igrf.test.ts`; coefficients are bundled JSON — no network needed for the model.
- Scene HUD labels use a single DOM overlay projected per frame (`Label`/`LabelProjector` in Scene.tsx), not drei `Html` — many Html roots dropped labels.