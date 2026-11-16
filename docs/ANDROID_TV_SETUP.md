# Android TV Setup

The display is a normal web page: no app, no login, no service-worker installation required.

## 1. Choose a browser

Android TV has no built-in browser on many models. Install one from the Play Store, in order of preference:

1. **Chrome** (if available for your TV) or **Kiwi/Chromium-based** browsers — best compatibility.
2. **TV Bro** — designed for remotes, supports fullscreen.
3. **Puffin TV** — works, but routes traffic through its own servers (not recommended).

Minimum engine: Chromium 111+ (Android TV 9+ with an up-to-date WebView usually qualifies).

## 2. Open the mosque URL

Enter `https://waktusolat.vercel.app/<slug>` (e.g. `/surau-al-amin`) once with the remote or a phone keyboard, then **bookmark it** / set it as the browser home page.

## 3. Fullscreen

Browsers only allow fullscreen after a user action. Press **OK/Enter** on the remote while the page is showing: the **⛶ Skrin Penuh** button is focused and visible for 10 seconds after loading (or after any key press). Keyboard users can press **F**.

TV Bro: Menu → *Fullscreen* also works.

## 4. Keep it running

- Disable the screensaver / *Ambient mode* (Settings → Device Preferences → Screen saver → *Never*). The page also requests a Screen Wake Lock where supported.
- Disable auto power-off / sleep timers in the TV settings.
- Prefer Ethernet over Wi-Fi. If the connection drops, the display keeps showing the last cached slideshow and prayer times and continues switching Prayer Mode from the cached official schedule, with an "Luar talian" indicator. It re-synchronises automatically when online.

## 5. Internet outages

After the display has been opened **once with internet** (leave it a minute so everything downloads):

- Up to **30 days** of prayer times are kept on the device; Countdown and Solat Mode keep running from them.
- **All** posters/videos of the published playlist are downloaded in the background, not only the ones already shown.
- The page itself is stored by the service worker, so a **reload or TV restart without internet** still opens the display (Chrome/Chromium-based browsers; some TV browsers without service-worker support can only continue while the page stays open).
- A yellow **"Luar talian"** notice is shown; a further warning appears when fewer than 3 days of stored prayer times remain. Everything re-synchronises automatically when the connection returns.

## 6. Known limitations

- **Video autoplay**: videos are muted and inline; if a TV browser still blocks autoplay, the item is skipped automatically (no freeze). Images are always the most reliable content.
- Some TV browsers evict cached data aggressively; after a power cut with no internet the page may need connectivity once to load.
- A heartbeat in the Master dashboard means a browser session is open, not that the TV screen is physically on.
- Automatic start after power-on requires a launcher/“autostart” app that opens the browser; this is device-specific. A Raspberry Pi in kiosk mode is the most robust option for unattended screens (see `RASPBERRY_PI_SETUP.md`).

## Compatibility review

The display uses only widely supported features: CSS transitions (opacity/transform/clip-path), `localStorage`, `fetch`, `<video muted playsinline>`, and Intl. Optional features (service worker, Wake Lock, Fullscreen API, Supabase Realtime WebSocket) degrade gracefully when unavailable: polling every 60 s replaces Realtime. Layout is sized in viewport units and tested at 1280×720, 1366×768, 1920×1080 and 3840×2160.
