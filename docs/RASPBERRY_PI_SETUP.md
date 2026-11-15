# Raspberry Pi Kiosk Setup

The Raspberry Pi is **only a display client**. The application is hosted on Vercel; the Pi just runs Chromium full-screen.

Recommended: Raspberry Pi 4 (2 GB+) or Pi 5, Raspberry Pi OS (64-bit, *with desktop*), wired Ethernet.

## 1. Install Raspberry Pi OS

1. Use **Raspberry Pi Imager** → *Raspberry Pi OS (64-bit)* (Bookworm or newer).
2. In the imager's settings: set hostname, user/password, Wi-Fi (if no Ethernet), locale **Asia/Kuala_Lumpur**, and enable SSH.
3. Boot, then update:
   ```bash
   sudo apt update && sudo apt full-upgrade -y
   sudo apt install -y chromium unclutter
   ```
   (On older images the package is `chromium-browser`.)
4. Enable **desktop autologin**: `sudo raspi-config` → *System Options* → *Boot / Auto Login* → *Desktop Autologin*.
5. Make sure time sync is on: `timedatectl` should show *System clock synchronized: yes*. (The display also corrects drift against the server clock.)

## 2. Kiosk launcher script

Create `~/waktusolat-kiosk.sh` (replace the slug):

```bash
#!/usr/bin/env bash
URL="https://waktusolat.vercel.app/surau-al-amin"

# Wait for the network (up to ~60 s); the page also works from cache if offline.
for i in $(seq 1 30); do ping -c1 -W2 vercel.app >/dev/null 2>&1 && break; sleep 2; done

# Never blank the screen.
xset s off 2>/dev/null; xset -dpms 2>/dev/null; xset s noblank 2>/dev/null
unclutter -idle 1 -root &

# Clear "Chromium didn't shut down correctly" bubbles after power loss.
PREFS="$HOME/.config/chromium/Default/Preferences"
[ -f "$PREFS" ] && sed -i 's/"exited_cleanly":false/"exited_cleanly":true/; s/"exit_type":"[^"]*"/"exit_type":"Normal"/' "$PREFS"

# Restart Chromium automatically if it crashes.
while true; do
  chromium --kiosk --noerrdialogs --disable-infobars --no-first-run \
    --autoplay-policy=no-user-gesture-required \
    --disable-session-crashed-bubble --disable-features=Translate \
    --check-for-update-interval=31536000 \
    "$URL"
  sleep 5
done
```

```bash
chmod +x ~/waktusolat-kiosk.sh
```

## 3. Start automatically after reboot

**Wayland (Bookworm default, labwc/wayfire):**

- labwc: add to `~/.config/labwc/autostart`:
  ```
  /home/<user>/waktusolat-kiosk.sh &
  ```
- wayfire: add to `~/.config/wayfire.ini`:
  ```ini
  [autostart]
  kiosk = /home/<user>/waktusolat-kiosk.sh
  ```

**X11 (older images):** create `~/.config/autostart/waktusolat.desktop`:
```ini
[Desktop Entry]
Type=Application
Name=WaktuSolat
Exec=/home/<user>/waktusolat-kiosk.sh
X-GNOME-Autostart-enabled=true
```

On Wayland, screen blanking is controlled by `raspi-config` → *Display Options* → *Screen Blanking* → **Disable**.

## 4. Recover from problems automatically

- The script's loop restarts Chromium if it exits or crashes.
- Optional nightly reboot to clear memory (03:30, outside prayer times):
  ```bash
  echo "30 3 * * * root /sbin/shutdown -r now" | sudo tee /etc/cron.d/waktusolat-reboot
  ```
- Optional hardware watchdog: add `dtparam=watchdog=on` to `/boot/firmware/config.txt` and enable `RuntimeWatchdogSec=15` in `/etc/systemd/system.conf`.
- Network: NetworkManager reconnects automatically; the page re-syncs on the browser `online` event and otherwise every 60 s.

## 5. Audio & video

Videos play muted. `--autoplay-policy=no-user-gesture-required` ensures autoplay in kiosk mode. Use H.264 MP4 — the Pi decodes it efficiently; HEVC uploads are rejected by the server.

## 6. Performance notes

- The display re-renders only the clock once per second; Solat Mode is completely static and the slideshow is unmounted during Countdown/Solat Mode.
- Old slide layers and video decoders are released after each transition.
- Keep the Pi's GPU memory default (Bookworm manages it); use 1080p output (`raspi-config` → Display → Resolution) on 4K TVs for the smoothest transitions.
