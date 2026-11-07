// The forge is an independent menu surface. Progress is supplied by the saved
// character, and never inferred from the selected test level or elapsed time.
export function createForgeMenu({ document: doc, audio, onSettings } = {}) {
  const get = id => doc?.getElementById?.(id);
  const menu = get('menu');
  const picker = get('levelSelectMenu');
  const walker = get('menuProgressWalker');
  const fill = get('menuXpFill');
  const track = get('menuXpTrack');
  const scene = get('forgeScene');
  const bindings = [];
  let active = !!menu && !menu.hidden;
  let target = 0, position = 0, strikeTime = -1, impacted = false;
  let returnFocus = null;
  const reduced = !!doc?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const bind = (node, name, handler) => {
    node?.addEventListener?.(name, handler);
    if (node?.removeEventListener) bindings.push(() => node.removeEventListener(name, handler));
  };
  const text = (id, value) => { const node = get(id); if (node) node.textContent = value; };
  const cue = () => { Promise.resolve(audio?.unlock?.()).then(() => audio?.play?.('menuSelect')).catch(() => {}); };
  function closeDialog() {
    if (!picker || picker.hidden) return false;
    picker.hidden = true;
    get('levelSelectButton')?.setAttribute?.('aria-expanded', 'false');
    returnFocus?.focus?.();
    returnFocus = null;
    return true;
  }
  function openDialog() {
    if (!picker || !active) return;
    cue();
    returnFocus = doc?.activeElement || get('levelSelectButton');
    picker.hidden = false;
    get('levelSelectButton')?.setAttribute?.('aria-expanded', 'true');
    get('startingLevel')?.focus?.();
  }
  function strike() {
    if (!active || strikeTime >= 0) return;
    audio?.unlock?.();
    strikeTime = 0;
    impacted = false;
    scene?.classList?.add('is-striking');
    text('forgeHitStatus', '');
  }
  function paintProgress() {
    walker?.style?.setProperty?.('--walker-x', `${position * 100}%`);
    walker?.style?.setProperty?.('--walker-offset', `${position * 76}px`);
    if (fill?.style) fill.style.width = `${position * 100}%`;
    walker?.classList?.toggle?.('is-walking', active && Math.abs(target - position) > .002 && !reduced);
  }
  function setProgress(data = {}) {
    const level = Math.max(1, Number(data.level) || 1);
    const xp = Math.max(0, Number(data.xp) || 0);
    const xpTarget = Math.max(0, Number(data.xpTarget) || 0);
    const maxed = level >= (Number(data.maxLevel) || 15);
    target = maxed ? 1 : xpTarget > 0 ? Math.min(1, xp / xpTarget) : 0;
    text('menuLevel', `${level}`);
    text('menuXpValue', maxed ? 'Μέγιστο επίπεδο' : `${xp} / ${xpTarget} XP`);
    text('menuXpPercent', `${Math.floor(target * 100)}%`);
    text('menuNextLevel', maxed ? 'Η κορυφή είναι δική σου.' : `Προς το επίπεδο ${level + 1}`);
    text('menuWeapon', data.weaponName || 'Κούτσουρο');
    text('menuSaveStatus', data.hasSave ? 'Η εξέλιξή σου έχει αποθηκευτεί' : 'Η περιπέτειά σου ξεκινά εδώ');
    text('continueSubtitle', data.hasSave ? 'Επίπεδο & εξοπλισμός' : 'Δεν υπάρχει αποθήκευση');
    track?.setAttribute?.('aria-valuenow', `${Math.floor(target * 100)}`);
    track?.setAttribute?.('aria-valuetext', `Επίπεδο ${level}, ${maxed ? 'μέγιστο επίπεδο' : `${xp} από ${xpTarget} πόντους εμπειρίας`}`);
    if (walker?.dataset) walker.dataset.weaponTier = `${Math.max(0, Number(data.weaponTier) || 0)}`;
    const resume = get('resumeCharacterButton');
    if (resume) { resume.hidden = false; resume.disabled = !data.hasSave || !data.ready; }
    if (reduced) position = target;
    paintProgress();
  }
  function setActive(value) {
    const next = !!value;
    if (next && !active) position = reduced ? target : 0;
    active = next;
    menu?.classList?.toggle?.('forge-active', active);
    audio?.setMenuActive?.(active);
    if (!active) {
      closeDialog();
      strikeTime = -1;
      scene?.classList?.remove('is-striking', 'has-impact');
    }
    paintProgress();
  }
  function update(dt = 0) {
    if (!active) return;
    const step = Math.max(0, Math.min(.25, Number(dt) || 0));
    if (Math.abs(position - target) > .0001) {
      const distance = Math.sign(target - position) * Math.min(Math.abs(target - position), step * .38);
      position = reduced ? target : position + distance;
      paintProgress();
    }
    if (strikeTime >= 0) {
      strikeTime += step;
      if (!impacted && strikeTime >= .245) {
        impacted = true;
        scene?.classList?.add('has-impact');
        audio?.play?.('menuStrike', .7);
        text('forgeHitStatus', 'Το σφυρί χτύπησε τον κορμό.');
      }
      if (strikeTime >= .78) {
        strikeTime = -1;
        scene?.classList?.remove('is-striking', 'has-impact');
      }
    }
  }
  bind(get('levelSelectButton'), 'click', openDialog);
  bind(get('closeLevelSelectButton'), 'click', () => { cue(); closeDialog(); });
  bind(get('menuSettingsButton'), 'click', () => { cue(); onSettings?.(); });
  bind(get('forgeHammerButton'), 'click', strike);
  bind(get('forgeLogButton'), 'click', strike);
  bind(get('testStartButton'), 'click', closeDialog);
  bind(picker, 'click', event => { if (event.target === picker) closeDialog(); });
  bind(doc, 'keydown', event => {
    if (!active || !picker || picker.hidden) return;
    if (event.key === 'Escape') { event.preventDefault?.(); closeDialog(); }
    if (event.key === 'Tab') {
      const nodes = Array.from(picker.querySelectorAll?.('button:not(:disabled), select, [tabindex="0"]') || []);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault?.(); last?.focus?.(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault?.(); first?.focus?.(); }
    }
  });
  for (const id of ['startButton', 'resumeCharacterButton', 'testStartButton']) bind(get(id), 'click', cue);
  setActive(active);
  return { setProgress, setActive, update, closeDialog, dispose() {
    setActive(false);
    for (const unbind of bindings) unbind();
  } };
}
