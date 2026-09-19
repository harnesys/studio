const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// install tabs
$$('.tabs [role="tab"]').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.tabs [role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    $$('.tabpanels > [role="tabpanel"]').forEach((panel) => {
      panel.hidden = panel.id !== tab.getAttribute('aria-controls');
    });
  });
});

// copy buttons
$$('.copy-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
    } catch {
      return;
    }
    btn.textContent = 'Copied';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy';
      btn.classList.remove('copied');
    }, 1600);
  });
});

// reveal on scroll
const revealables = $$('.reveal');
if ('IntersectionObserver' in window && revealables.length) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 },
  );
  revealables.forEach((el) => io.observe(el));
} else {
  revealables.forEach((el) => el.classList.add('in'));
}

// releases
const list = $('#release-list');
const REPO = 'harnesys/studio';
const ASSET_LIMIT = 8;

function renderError() {
  list.innerHTML = '<p class="muted">Could not load releases. Check <a href="https://github.com/harnesys/studio/releases">GitHub</a>.</p>';
}

function renderReleases(releases) {
  if (!releases.length) {
    list.innerHTML = '<p class="muted">No releases yet. The first one lands on the <a href="https://github.com/harnesys/studio/releases">releases page</a>.</p>';
    return;
  }
  list.innerHTML = releases
    .map((rel) => {
      const date = new Date(rel.published_at).toLocaleDateString('en-US', { dateStyle: 'medium' });
      const assets = rel.assets.slice(0, ASSET_LIMIT).map((a) => `<a href="${escapeHtml(a.browser_download_url)}">${escapeHtml(a.name)}</a>`).join('');
      const notes = (rel.body || '').split('\n').filter(Boolean).slice(0, 3).map(escapeHtml).join('<br>');
      return `<article class="release">
        <div>
          <h3><a href="${escapeHtml(rel.html_url)}">${escapeHtml(rel.name || rel.tag_name)}</a></h3>
          <time datetime="${escapeHtml(rel.published_at)}">${date}</time>
        </div>
        <div>
          ${notes ? `<p class="release-notes">${notes}</p>` : ''}
          ${assets ? `<div class="release-assets">${assets}</div>` : ''}
        </div>
      </article>`;
    })
    .join('');
}

fetch(`https://api.github.com/repos/${REPO}/releases`)
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
  .then(renderReleases)
  .catch(renderError);
