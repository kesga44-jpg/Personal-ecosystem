const appUrls = window.PERSONAL_ECOSYSTEM_APP_URLS;
const pageOrigin = window.location.origin;
/** Each external origin belongs to one configured app; the PE tiles share the hub origin. */
const originOwners = new Map();

for (const card of document.querySelectorAll('[data-app-card]')) {
  const appId = card.getAttribute('data-app-card');
  const path = card.getAttribute('data-app-path') ?? '/';
  const configuredUrl = appUrls[appId];
  const button = card.querySelector('[data-app-open]');
  const status = card.querySelector('[data-app-link-status]');

  if (!button || typeof configuredUrl !== 'string' || configuredUrl.trim() === '') {
    continue;
  }

  let destination;
  try {
    if (!/^\/[a-z-]*$/.test(path)) throw new Error('unsafe path');
    destination = new URL(path, configuredUrl);
  } catch {
    status.textContent = 'De app-link is niet veilig ingesteld.';
    continue;
  }

  const owner = originOwners.get(destination.origin);
  if (destination.protocol !== 'https:' || destination.origin === pageOrigin || (owner !== undefined && owner !== appId)) {
    status.textContent = 'De app-link is niet veilig ingesteld.';
    continue;
  }

  const link = document.createElement('a');
  link.className = button.className;
  link.href = destination.href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = button.textContent;
  button.replaceWith(link);
  status.textContent = '';
  originOwners.set(destination.origin, appId);
}
