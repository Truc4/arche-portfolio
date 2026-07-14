# The site timeline — the old sites, in the world

**Where things are.** Two arrow signposts flank ABOUT at spawn and name the two directions, which is the same
split the ABOUT card describes:

```
  <- DEMOS        ABOUT        TIMELINE ->
  sandbox                      2018  2019  2022  2026        DATA-ORIENTED
  playground                   (the site panels)             THE LANGUAGE
                                                             SAY HELLO
  x < 2100        2100         5600 … 9200                   10400 … 11600
```

The three explainer signposts (`TAIL_X0…2`) sit **after** the timeline, so walking right reads as: here is who
I am → here is what I made, oldest first → here is how this one works → say hello. Nothing stands between
ABOUT and 2018 any more; that stretch is a deliberately empty walk into the timeline.


The right-hand side of the world is a timeline of the previous versions of this site. Each one is built the
same way the **playground** is: the site gets **its own always-visible panel**, and a **signpost on the ground**
is what carries the information about it.

Walk up to a signpost and an info card opens with the story of that site. The site panel itself is always
there, whether you are standing at it or not.

So each entry is three things at one world x:

```
        ┌──────────────────────────┐
        │ 2018                     │   <- pinned panel (always visible), world y = EMB_WY
        │ ┌──────────────────────┐ │      the site itself, live or as a still
        │ │   the site           │ │
        │ └──────────────────────┘ │
        └──────────────────────────┘
        ┌──────────────────────────┐
        │ 2018   pure html, css, js│   <- info card: opens when you walk near (iprog)
        │  Made with pure HTML...  │
        └──────────────────────────┘
                  ╤═════╤
                  │2018 │               <- signpost, on the ground
                  └──┬──┘
```

The vertical budget is tight and load-bearing: the camera only ever shows world y ≈ 180…1260 (eye at
`EYE_Y0` = 720, half a 1080-tall view either side). The pinned panel occupies world y 250…700 and the info card
705…945, which is why `EMB_H` is 450 and `SITE_H` is 240. **Grow either one and they collide.**

## Which site is live, and which is a picture

`ekind` decides what the device makes:

| `ekind` | what the card is | what the device makes |
|---|---|---|
| `0` | LIVE — the site itself, interactive | `<iframe src=esrc>` |
| `1` | SHOT — a still picture of the site | `<a href=elink><img src=esrc></a>` |

**The signs do not match the URLs, and that is on purpose.** The sign says what year the work is from; the URL
says where it happens to be hosted. They disagree:

| Sign | `ekind` | Actually loads | Why |
|---|---|---|---|
| **2018** | LIVE | `2018.curtreyes.com/portfolio` | GitHub Pages. Real TLS, and it sends no `X-Frame-Options` / CSP `frame-ancestors`. Nothing in the way. |
| **2019** | LIVE | `2018.curtreyes.com` | Same host, same story. |
| **2022** | **SHOT** | `www/shots/2022.png` → links to `2022.curtreyes.com` | WordPress on Apache. It serves the host's *default* self-signed certificate (`CN=example.com`, expired 2022-11-12), so `https://` fails outright. Over plain `http://` the site is fine — but **this page is served over HTTPS**, and a browser hard-blocks an `http://` iframe inside an `https://` page as mixed content. Not a warning. A block. It cannot be embedded live today, no matter what the code does. |
| **2026** | **SHOT** | `www/shots/2026.png` | This site. It cannot embed itself without recursing, so it is a still, with no link — you are already here. |

Do not "fix" the first two by renaming the signs to match their domains. The subdomain a site sits on is not
the year the work is from.

There is no card for `2019.curtreyes.com` the *domain*. Its DNS still points at S3 and S3 replies
`NoSuchBucket` — the content is gone. (S3's website endpoints also serve no TLS, so it would have hit the same
mixed-content wall anyway.)

### To make 2022 live

Two things, in order:

1. **Give it a real certificate.** `certbot --apache -d 2022.curtreyes.com` on the box. If there's no shell on
   that host, putting Cloudflare in front of the domain in *Flexible* SSL mode gets valid TLS at the edge
   without touching the origin.
2. **Tell WordPress it is https.** Set `siteurl` / `home` to `https://` (Settings → General, or `WP_HOME` /
   `WP_SITEURL` in `wp-config.php`). Otherwise the framed page loads its own assets over `http://` and renders
   broken *inside* the iframe.

Then verify — a `200` with no framing header is the whole test:

```sh
curl -sSI https://2022.curtreyes.com | grep -iE '^HTTP|x-frame|content-security'
```

Then set its `esrc` to the URL, flip `ekind` to `0`, and delete `www/shots/2022.png`.

## A card is only fetched when you walk near it

A visitor who never goes right should never download the other sites. This used to fall out for free — a shut
card had a zero-size rect, so "has a rect" meant "is open". **Now every card is always open**, so that signal is
gone. What is left is *where* the rect is: a card you have not walked to is far off the side of the viewport.
The dom host assigns `src` the first time a card comes within one screen-width of the viewport, and caches it
forever after. Walking past twice does not re-fetch, and does not lose the embedded site's scroll position.

Verified: nothing is requested from `curtreyes.com` at page load.

## Clicking a site brings the camera to it

Same move the playground makes when its editor takes the keyboard: click into a site and the camera eases until
that panel is centred, so you are looking at the site rather than at the world with a site in the corner.

Getting the click is the whole problem. A card is a **DOM element above the gfx `<canvas>`**, and gfx binds its
mouse listeners to the canvas — so a click on a card never reaches the canvas at all, and `focus_claim`'s
screen-rect hit test can never see it. (This is also why the playground doesn't use `focus_claim` for its
editor; it reads `gfx.text_focus`.)

The browser knows, though — it focuses whatever was clicked, cross-origin iframe included. So the embed device
reads `document.activeElement` and writes it back as a column, `efocus`, exactly like button's `clicked`: *a
producer writes a column, a consumer reads it*. The driver's `embed_focus` (in `cards.arche`) turns that into
`fcam = epanel + 1`, and `cam_center_site` (in `camview.arche`) frames it.

`cam_center_site` is a **second** system rather than a branch in `cam_center`, because the two kinds of panel
know where they are in different ways: the playground and sandbox have compile-time constant spots, while a site
panel carries its own world anchor (`iwx`/`iwy`). Note the trap it fixes — `cam_center`'s query
`{bid, title, size}` *also matches every InfoPanel*, since an InfoPanel is a superset of a Panel. Without the
`fixed` bid check now guarding it, focusing a site panel would have yanked the camera to the playground's
coordinates. Querying `ipin` keeps `cam_center_site` to the pinned site panels: a proximity info card is text,
not a destination, and must not steal the camera.

Nothing new is needed to give the camera back. Clicking the world clears `fcam` (`focus_input`), and so does
walking off the edge of the view (`focus_release`).

## Focus — clicking a live embed takes your arrow keys

An iframe is a separate document. Click into a cross-origin one and focus leaves this page, so the arrow keys go
to the embedded site instead of the player. That is the same contract the playground editor already has (see
[input-and-focus.md](input-and-focus.md)): *click the world to resume walking*. The browser will not blur a
cross-origin iframe on our behalf, so the host explicitly blurs it on any `pointerdown` outside every card.

## The world had an edge, and these cards walk you to it

The ground is a *single* static `Solid`. It is finite. Before the timeline, the rightmost thing in the world was
the SAY HELLO sign at x=4800 and nobody ever walked far enough right to find where the floor stopped — so the
player falling out of the world was a latent bug, not a new one. Putting cards out at 5600…9200 walked people
straight into it.

Two things fix it, and you need both:

- The ground (`Solid[0]`) and the floor band (`Back`) span **x = −3900 … 13000**, well past the last signpost.
- `clamp_player` (in `camview.arche`) also clamps the player to **`WORLD_LMAG` … `WORLD_R`** (−3800 … 12700),
  *inside* the floor. Widening the ground alone only moves the cliff — a finite floor always has an end. The
  clamp is what means there is no edge to fall off, on either side.

If you add a card further right than `WORLD_R`, move `WORLD_R` **and** the ground/`Back` extents with it, or you
re-open the hole.

(`WORLD_LMAG` holds a positive magnitude and is negated at the use site because an arche constant's value must
be a literal — `-3800.0` and `0.0 - 3800.0` are both rejected there. That is why the seeds are full of
`0.0 - 490.0`.)

## Gotchas

- **`ipin` is what makes a card always-visible.** `info_open` eases `iprog` toward proximity for a normal card,
  but toward a hard `1.0` for a pinned one. The site panels and their embeds are `ipin: 1`; their info cards are
  `ipin: 0`. Everything else about the two is identical, which is why they share `info_layout`.
- **Panels are spaced 1200 apart** (`EMB_WX0…3`) because they are 1000 render px wide and would otherwise
  overlap on screen — they are all visible at once now, so spacing is not cosmetic.
- **`www/index.html` hard-codes each element's z-index by id** (`#ui-embed-0…3`, `#ui-panel-9…16`,
  `#ui-textview-8…11`). A new card needs its ids added there or it renders behind the canvas.
- **Adding a card means checking the pools.** Each site costs 3 `Prop`s (post + board edge + board face), a
  `Sign`, two `InfoPanel`s (pinned panel + info card), an `InfoBody` and an `Embed`.
- **`elen`/`ellen` are measured, not counted.** `measure_cards` scans to the NUL, so the URL strings don't
  repeat the hand-counted-length trap the `Sign`s and panel titles have.
