# Token Teleporter v0.1 — Owlbear Rodeo

GM-only extension: right-click an IMAGE token and choose “设置 / 取消传送点”; select Smoke & Spectre! vision-enabled Character tokens in the panel and teleport them to a chosen anchor. Hidden anchors can be used by the GM. Multiple tokens are spaced by one grid cell. Same scene only.

## Install using GitHub Pages

1. Create a **new public repository named `obr-token-teleporter`** under GitHub user `DawnWatcherL` (do not overwrite `obr-vision-switch`).
2. Upload the **contents** of this folder into the repository root, including `.github/workflows/deploy.yml` and the `public/` directory.
3. In **Settings → Pages**, set **Source = GitHub Actions**.
4. Wait for the **Deploy Token Teleporter** workflow to succeed (green check).
5. Verify `https://dawnwatcherl.github.io/obr-token-teleporter/manifest.json` displays JSON.
6. In Owlbear Rodeo, go to Extensions → Add Extension and enter the same URL.

## Test

1. In a test scene, place an image token (for example a GM-hidden map marker) and use its context menu to mark it as a teleport point.
2. Open Token Teleporter; select one character with Smoke vision and select the destination.
3. Click teleport and check that the character moves, retaining its Smoke vision and ownership.
4. Try multiple characters; check the grid-based spacing.

## Notes

- The extension uses `com.battle-system.smoke/hasVision` and `com.battle-system.smoke/visionRange` to filter character tokens, and stores anchor state only at `wow.token-teleporter/anchor`.
- This is a first test release; it has not been tested in your live Owlbear room.
- The context menu is available for IMAGE tokens with update permission; only the GM can mark anchors.
- The icon and manifest action URLs assume the exact GitHub account/repository names above. If you change them, edit `public/manifest.json` and the ICON constant in `main.ts`.
- If a marker is hidden from players, its visibility remains unchanged by teleportation. The extension never unhides it.
