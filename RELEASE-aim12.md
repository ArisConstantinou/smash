# IRONFALL — aim12: readable opener and ground throw picture

## Combat
- Every fresh normal attack chain starts with one-forehand (one hand) or two-broadside (two hands). Both are horizontal strokes.
- Follow-ups retain the weighted six-stroke variation bag. Releasing one tap does not reset the animation or discard a deliberate buffered follow-up.
- A 0.75-second idle interval AFTER the last stroke resets the chain. Guard, kick, jump, dash, thrown-weapon actions, equipment forging, damage interruptions, stance changes and phase/input cancellation also reset its next opener.
- The contact-earned spin and its existing damage/momentum rules remain unchanged.

## Throw picture
- The melee reach arc stays visible through confirm aiming, hold aiming, buffered release and windup.
- A broad, illustrated gold/steel SVG arrow appears beyond that arc, as a textured world-space ground mesh. It is not a thin debug line or a screen-space cursor.
- The arrow uses ground support heights, depth testing and small surface offsets. Its grid omits discontinuities at ledges instead of stretching the picture down vertical walls. It is a direction indicator, not a promised full flight path or a homing trajectory.
- Both floating crosshair drawings are removed. The old small direction triangle is suppressed during throw aiming, and the picture disappears after launch/cancellation or leaving play.
- Desktop retains mouse-directed aim. Mobile uses the existing left stick and remembers facing when released. The throw button is only a button: finger drift on it does not steer, and touching the world during throw aiming does not create a draggable target cursor.
- Both confirm (press, then press again) and hold/release modes remain supported. Auto-lock remains default-off; explicit opt-in is not overwritten.

## Verification coverage
- Pure tests cover chain reset timing, varied follow-up bags, decal layout, image readiness, ledges and resource cleanup.
- Real game/model integration tests cover repeated openers, interruption resets, single-stick throwing, both throw modes, launch direction, arc retention and cancellation.
- Chromium browser checks retain menu/city/save/manual combat tests and add real touch/mouse opener checks plus screenshots of confirm and held ground arrows in desktop, portrait, landscape and compact phone viewports.
- Browser automation is not a physical iPhone/Safari or audio-hardware test.
