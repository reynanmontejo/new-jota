# Joyno Task lion branding

The application uses the owner-approved **03 / Lion Wordmark** concept: a right-facing lion with a flowing bronze J-shaped mane, charcoal structure, a blue eye accent, and the lowercase joyno / TASK wordmark. The parent attribution is **by Joyno Media**.

## Where it appears

- `BrandLogo` is shared by the desktop/mobile sidebar and login screen. The expanded sidebar uses the horizontal wordmark; the collapsed sidebar uses the lion on an ivory tile. The login screen also displays the parent attribution.
- The horizontal wordmark has light- and dark-theme exports. CSS switches them with the existing theme; their dimensions reserve layout space.
- Browser favicon, app icon, and Apple touch icon use the compact lion. The ICO contains 16, 32, and 48 pixel RGBA entries.
- In-app device notifications, Settings test notifications, and service-worker pushes share the same versioned PNG notification icon and transparent badge. No notification permissions, subscriptions, keys, or delivery settings change.
- Legacy `/jota-logo.svg`, `/jota-notification-icon.svg`, and `/icon.svg` URLs contain the new mark for compatibility. These SVG files embed PNG exports; they are not editable vector masters.

## Assets

Runtime images are stored under `public/brand/`. `src/lib/branding.ts` is the shared asset-path definition for React consumers; keep the two literal notification paths in `public/sw.js` aligned with it. Versioned filenames avoid stale image caches when a future revision is released.

The approved concept was prepared with the built-in image-generation tool, using the owner's selected board as the reference. The resulting transparent images were exported to size-appropriate WebP/PNG assets; the runtime has no dependency on the image service or the local source-artwork directory. The wordmark exports are raster artwork, not a new font dependency.

The source board and generation prompts remain in the workspace's `outputs/joyno-task-lion-logo-concepts` and `outputs/joyno-task-brand-rollout` directories. Production uses only the checked-in runtime exports.

## Scope

This replaces the visual logo and page-title branding. Existing Jota URLs, database identifiers, storage folders, email sender configuration, and workflow copy remain compatible. The existing tutorial recording contains earlier interface branding; its footage was not regenerated as part of the app logo update.

No database migration is needed for this branding change. It becomes visible after the app is deployed, and existing browsers receive the updated service worker normally. A browser may retain its old favicon temporarily until the tab or site is refreshed.
