# Workshop artwork

The PNG atlases are offline renders of this project's actual `models.js`, `mount-models.js` and `player-customization.js` geometry. Eight columns/rows, 160px cells; chassis occupies cell63. Player atlases correspond to the five existing weapon tiers. Their slot/option order comes directly from `mount-rules.js`. Three separate160px chassis PNGs keep the gameplay HUD from loading the full catalog.

`frame.svg`, `tools.svg` and `workshop.svg` are authored vector artwork for the approved teal/gold workshop direction. No stock pack, external download, purchased asset, AI image, new dependency or third-party artwork is included here. The supplied concept is a design reference; screenshots and thumbnails are real runtime/model renders.

Editable sources: `equipment-shapes.js`, `player-customization.js`, `mount-models.js`, `tools/workshop-atlas.js`, the SVG files and `mount-workshop.css`. Generate using `node tools/render-workshop-art.mjs` within the existing reviewed Smash runner, with the single preview already serving this worktree at port8000 `/candidate/`. This writes only to the stable canonical `work/workshop-art` folder. Review output and import the exact eleven PNGs into this directory as source assets; do not create another project/build copy.

Atlas cards show the option's rank1 geometry; purchased ranks1–5 and their actual numerical effects remain visible separately in the UI. Existing base equipment is labeled BASIC; an empty socket is explicitly labeled WITHOUT MODULE. No thumbnail is an inactive purchase control.
