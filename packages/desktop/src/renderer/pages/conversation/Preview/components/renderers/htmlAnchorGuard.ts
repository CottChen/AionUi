/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

const HASH_ANCHOR_GUARD_MARKER = 'data-aionui-hash-anchor-guard';

const HASH_ANCHOR_GUARD_SCRIPT = `<script ${HASH_ANCHOR_GUARD_MARKER}="true">
(function(){
  if (window.__aionuiHashAnchorGuardInstalled) return;
  window.__aionuiHashAnchorGuardInstalled = true;

  function decodeAnchor(hash) {
    try { return decodeURIComponent(hash.slice(1)); }
    catch (_) { return hash.slice(1); }
  }

  function findAnchorTarget(hash) {
    if (!hash || hash === '#') return null;
    var name = decodeAnchor(hash);
    if (!name) return null;
    return document.getElementById(name) || document.getElementsByName(name)[0] || null;
  }

  document.addEventListener('click', function(event) {
    var target = event.target;
    while (target && target !== document && target.tagName !== 'A') {
      target = target.parentElement;
    }
    if (!target || target.tagName !== 'A') return;

    var rawHref = target.getAttribute('href');
    if (!rawHref || rawHref.charAt(0) !== '#') return;

    event.preventDefault();

    if (rawHref === '#') {
      window.scrollTo(0, 0);
    } else {
      var anchorTarget = findAnchorTarget(rawHref);
      if (anchorTarget && anchorTarget.scrollIntoView) {
        anchorTarget.scrollIntoView();
      }
    }
  }, true);
})();
</script>`;

export function injectHashAnchorNavigationGuard(html: string): string {
  if (!html || html.includes(HASH_ANCHOR_GUARD_MARKER)) return html;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${HASH_ANCHOR_GUARD_SCRIPT}</body>`);
  }

  if (/<\/html>/i.test(html)) {
    return html.replace(/<\/html>/i, `${HASH_ANCHOR_GUARD_SCRIPT}</html>`);
  }

  return `${html}${HASH_ANCHOR_GUARD_SCRIPT}`;
}
