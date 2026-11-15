const appUrls = window.PERSONAL_ECOSYSTEM_APP_URLS;
const usedOrigins = new Set([window.location.origin]);

for (const card of document.querySelectorAll('[data-app-card]')) {
  const appId = card.getAttribute('data-app-card');
  const configuredUrl = appUrls[appId];
  const button = card.querySelector('[data-app-open]');
  const status = card.querySelector('[data-app-link-status]');

  if (typeof configuredUrl !== 'string' || configuredUrl.trim() === '') {
    continue;
  }

  let destination;
  try {
    destination = new URL(configuredUrl);
  } catch {
    status.textContent = 'De app-link is niet veilig ingesteld.';
    continue;
  }

  if (destination.protocol !== 'https:' || usedOrigins.has(destination.origin)) {
    status.textContent = 'De app-link is niet veilig ingesteld.';
    continue;
  }

  const link = document.createElement('a');
  link.className = button.className;
  link.href = destination.href;
  link.textContent = button.textContent;
  button.replaceWith(link);
  status.textContent = '';
  usedOrigins.add(destination.origin);
}
