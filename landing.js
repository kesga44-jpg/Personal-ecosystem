const appUrls = window.PERSONAL_ECOSYSTEM_APP_URLS;
const usedOrigins = new Set([window.location.origin]);

const card = document.querySelector('[data-app-card="ecosystem"]');
if (card) {
  const configuredUrl = appUrls.ecosystem;
  const button = card.querySelector('[data-app-open]');
  const status = card.querySelector('[data-app-link-status]');

  if (typeof configuredUrl === 'string' && configuredUrl.trim() !== '') {
    let destination;
    try {
      destination = new URL(configuredUrl);
    } catch {
      status.textContent = 'De app-link is niet veilig ingesteld.';
    }

    if (destination) {
      if (destination.protocol !== 'https:' || usedOrigins.has(destination.origin)) {
        status.textContent = 'De app-link is niet veilig ingesteld.';
      } else {
        const link = document.createElement('a');
        link.className = button.className;
        link.href = destination.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = button.textContent;
        button.replaceWith(link);
        status.textContent = '';
        usedOrigins.add(destination.origin);
      }
    }
  }
}
