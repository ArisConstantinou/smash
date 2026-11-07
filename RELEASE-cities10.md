# cities10 — visual level selection

- Level selection and Settings share the same two-column row on desktop, portrait and landscape phones.
- Replaced the level dropdown with 15 image cards, a selected-city preview, equipment information and an explicit Play action.
- Every image is a static 640×400 WebP rendered from the actual city definition and bundled gameplay meshes. No runtime preview GPU/context is needed.
- Each level has a named, deterministic city variant: a different building distribution, palette and weather, using the tested road grid and collision engine.
- The gallery is paginated (four cards in portrait, six on wide screens) instead of requiring page scrolling. Buttons, arrow keys, Home/End and Page Up/Down are supported. Focus returns to the chosen card when reopened.
- Card selection never starts a run or changes saves. The explicit Play button starts a separate test run. New Game and Continue retain the original city/save workflow. Retry retains the selected test city.
- Regression coverage checks all 15 postcard assets, distinct deterministic layouts, weather/hazards, spawn clearance, card navigation, no dropdown, same-row actions, the launched city, and preservation of the saved character.

Rebuild postcards with `node tools/render-cities.mjs` after installing the same isolated Playwright dependency used by the verification workflow.
