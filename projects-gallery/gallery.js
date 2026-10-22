// Tiered masonry gallery of every page under a WordPress parent page ("projects" by default).
// Works on its own page or pasted into a WordPress Custom HTML block next to a
// <div id="projects-gallery"></div>. Options come from that div's data attributes:
//   data-site="https://briangooding.com"   site to read (defaults to this site when on it)
//   data-parent="projects"                  slug of the parent page
//   data-depth="3"                          how many levels of sub-pages to include
(() => {
  const root = document.getElementById('projects-gallery');
  if (!root) return;

  const params = new URLSearchParams(location.search);
  const onSite = /(^|\.)briangooding\.com$/.test(location.hostname);
  const site = (params.get('site') || root.dataset.site || (onSite ? location.origin : 'https://briangooding.com')).replace(/\/+$/, '');
  const parentSlug = params.get('parent') || root.dataset.parent || 'projects';
  const maxDepth = Number(params.get('depth') || root.dataset.depth || 3);
  const api = `${site}/wp-json/wp/v2/pages`;
  const FIELDS = 'id,parent,menu_order,date,link,title,excerpt,content,featured_media,_links,_embedded';

  // ---- Fetching ----

  async function getJSON(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);
    return { data: await res.json(), pages: Number(res.headers.get('X-WP-TotalPages') || 1) };
  }

  // All published pages whose parent is one of ids, following WordPress's pagination.
  async function childrenOf(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 50) {
      const q = ids.slice(i, i + 50).map((id) => `parent[]=${id}`).join('&');
      for (let page = 1, total = 1; page <= total; page++) {
        const r = await getJSON(`${api}?${q}&per_page=100&page=${page}&orderby=menu_order&order=asc&_embed=wp:featuredmedia&_fields=${FIELDS}`);
        out.push(...r.data);
        total = r.pages;
      }
    }
    return out;
  }

  async function loadTree() {
    const { data } = await getJSON(`${api}?slug=${encodeURIComponent(parentSlug)}&_fields=id,title,link`);
    if (!data.length) throw new Error(`No page with the slug "${parentSlug}" on ${site}.`);
    const top = data[0];
    const all = [];
    let level = [top.id];
    for (let depth = 1; depth <= maxDepth && level.length; depth++) {
      const kids = await childrenOf(level);
      kids.forEach((k) => { k.tier = depth; });
      all.push(...kids);
      level = kids.map((k) => k.id);
    }
    return { top, pages: all };
  }

  // ---- Shaping ----

  const text = (html) => {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  };

  // Featured image, else the first image in the page body.
  function imageOf(p) {
    const media = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
    if (media && media.source_url) {
      const sizes = (media.media_details && media.media_details.sizes) || {};
      const pick = sizes.large || sizes.medium_large || sizes.full || media;
      return { src: pick.source_url || media.source_url, w: pick.width, h: pick.height, alt: media.alt_text || '' };
    }
    const m = /<img[^>]+src=["']([^"']+)["'][^>]*>/i.exec((p.content && p.content.rendered) || '');
    if (!m) return null;
    const w = /width=["']?(\d+)/i.exec(m[0]);
    const h = /height=["']?(\d+)/i.exec(m[0]);
    const alt = /alt=["']([^"']*)["']/i.exec(m[0]);
    return { src: m[1], w: w && +w[1], h: h && +h[1], alt: alt ? text(alt[1]) : '' };
  }

  // Depth-first order so each project is followed by its own sub-pages.
  function treeOrder(topId, pages) {
    const byParent = new Map();
    pages.forEach((p) => {
      if (!byParent.has(p.parent)) byParent.set(p.parent, []);
      byParent.get(p.parent).push(p);
    });
    byParent.forEach((list) => list.sort((a, b) => a.menu_order - b.menu_order || text(a.title.rendered).localeCompare(text(b.title.rendered))));
    const byId = new Map(pages.map((p) => [p.id, p]));
    const out = [];
    const walk = (id) => (byParent.get(id) || []).forEach((p) => {
      let t = p;
      while (t.tier > 1) t = byId.get(t.parent);
      p.project = t;
      p.parentPage = byId.get(p.parent);
      p.childCount = (byParent.get(p.id) || []).length;
      out.push(p);
      walk(p.id);
    });
    walk(topId);
    return out;
  }

  // ---- Rendering ----

  const el = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };

  function card(p) {
    const tier = Math.min(p.tier, 3);
    const a = el('a', `pg-card pg-tier-${tier}`);
    a.href = p.link;
    a.dataset.project = p.project.id;
    const img = tier < 3 ? imageOf(p) : null;
    if (img) {
      const fig = el('div', 'pg-media');
      const i = el('img');
      i.src = img.src;
      i.alt = img.alt;
      i.loading = 'lazy';
      i.decoding = 'async';
      if (img.w && img.h) { i.width = img.w; i.height = img.h; }
      fig.append(i);
      a.append(fig);
    } else if (tier < 3) {
      a.classList.add('pg-noimg');
    }
    const body = el('div', 'pg-body');
    if (tier > 1) body.append(el('div', 'pg-crumb', text(p.parentPage.title.rendered)));
    body.append(el(tier === 1 ? 'h2' : 'h3', 'pg-title', text(p.title.rendered) || 'Untitled'));
    const ex = text(p.excerpt && p.excerpt.rendered).replace(/\s*(Continue reading.*|\[…\]|…)$/, '…');
    if (ex && tier < 3) body.append(el('p', 'pg-excerpt', ex.length > 220 ? ex.slice(0, 217).trimEnd() + '…' : ex));
    if (p.childCount) body.append(el('div', 'pg-count', `${p.childCount} page${p.childCount === 1 ? '' : 's'} inside`));
    a.append(body);
    return a;
  }

  function layout(grid) {
    // Each card spans enough 4px rows to hold its height plus its bottom margin (the gap).
    const row = parseFloat(getComputedStyle(grid).gridAutoRows) || 4;
    grid.querySelectorAll('.pg-card:not([hidden])').forEach((c) => {
      const h = c.getBoundingClientRect().height + parseFloat(getComputedStyle(c).marginBottom);
      c.style.gridRowEnd = `span ${Math.max(1, Math.ceil(h / row))}`;
    });
  }

  function render(top, pages) {
    root.textContent = '';
    root.classList.add('pg');
    const head = el('header', 'pg-head');
    head.append(el('h1', 'pg-h1', text(top.title.rendered) || 'Projects'));
    const projects = pages.filter((p) => p.tier === 1);
    head.append(el('p', 'pg-sub', `${projects.length} project${projects.length === 1 ? '' : 's'} · ${pages.length} page${pages.length === 1 ? '' : 's'}`));
    root.append(head);

    const grid = el('div', 'pg-grid');
    pages.forEach((p) => grid.append(card(p)));

    if (projects.length > 1) {
      const bar = el('div', 'pg-filters');
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', 'Filter by project');
      const chip = (label, id) => {
        const b = el('button', 'pg-chip', label);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(id === 'all'));
        b.addEventListener('click', () => {
          bar.querySelectorAll('.pg-chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
          grid.querySelectorAll('.pg-card').forEach((c) => { c.hidden = id !== 'all' && c.dataset.project !== String(id); });
          layout(grid);
        });
        return b;
      };
      bar.append(chip('All', 'all'));
      projects.forEach((p) => bar.append(chip(text(p.title.rendered), p.id)));
      root.append(bar);
    }
    root.append(grid);

    layout(grid);
    grid.querySelectorAll('img').forEach((i) => {
      i.addEventListener('load', () => layout(grid));
      i.addEventListener('error', () => { i.closest('.pg-media').remove(); layout(grid); });
    });
    let raf = 0;
    new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => layout(grid)); }).observe(grid);
  }

  root.setAttribute('aria-busy', 'true');
  root.innerHTML = '<p class="pg-status">Loading projects…</p>';
  loadTree()
    .then(({ top, pages }) => {
      if (!pages.length) {
        root.innerHTML = '';
        root.append(el('p', 'pg-status', `"${text(top.title.rendered)}" has no published sub-pages yet.`));
        return;
      }
      render(top, treeOrder(top.id, pages));
    })
    .catch((err) => {
      root.innerHTML = '';
      root.append(el('p', 'pg-status', `Couldn't load projects from ${site}. ${err.message}`));
    })
    .finally(() => root.removeAttribute('aria-busy'));
})();
