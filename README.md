# 🎰 Seat Lottery — Online Product

A zero-dependency web app for running a live seat lottery. It renders the full
office floor plan, randomly draws a teammate with a slot-machine animation, and
lets the winner claim any free **Online Product** seat (the 14 yellow seats,
HS-34 … HS-47) — then moves on to the next draw.

## ✨ Features

- **Faithful floor plan** — the whole office map transcribed from the seating
  chart, with every team color-coded. Non-lottery seats are dimmed so the
  yellow Online Product seats stand out.
- **Dramatic draws** — full-screen slot-machine name shuffle, winner reveal,
  confetti and sound (mute toggle included). Perfect for projecting on a TV.
- **Winner's choice** — the drawn teammate clicks any glowing free seat, or
  hits **🎲 Random seat** to let fate decide everything.
- **Live tracker** — draw order, timestamps, and seat tags in the sidebar;
  assigned seats show the occupant's name on the map.
- **Safety nets** — undo the last assignment, cancel a draw (name goes back in
  the hat), or reset the whole lottery.
- **Persistence** — state is saved to `localStorage`, so a page refresh never
  loses progress.
- **CSV export** — download the final `Order, Name, Seat, Time` list.

## 🚀 Running it

It's a fully static site — no build step, no server logic.

```bash
# Option 1: just open it
open index.html

# Option 2: serve it
npx http-server .          # or: python3 -m http.server
```

Or enable **GitHub Pages** (Settings → Pages → deploy from `main`, root) and
share the URL with the team.

## 👥 Adding your teammates

On first launch a dialog asks for the participant list — paste one name per
line. You can edit the list any time via **👥 Edit participants** (teammates
who already won a seat keep it).

## ⌨️ Shortcuts

| Key      | Action                              |
| -------- | ----------------------------------- |
| `Space`  | Draw the next teammate              |
| `Enter`  | Continue after the winner reveal    |
| `Esc`    | Cancel the current pick             |

## 🔧 Tweaking the seat map

Everything lives in [`js/data.js`](js/data.js):

- Seats are placed on a 23×20 grid with `S(id, col, row, category)`.
- To run the lottery for a different team, change `LOTTERY_CAT` to any
  category key (e.g. `'hotels'`).

## 🗂 Structure

```
index.html        – page shell
css/style.css     – all styling
js/data.js        – seat map data (positions + categories)
js/confetti.js    – tiny canvas confetti
js/app.js         – lottery logic, rendering, persistence
```
