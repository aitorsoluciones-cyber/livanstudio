
(() => {
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-menu]');
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      menu.classList.toggle('open', !open);
    });
    const closeMenu = () => {
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    };
    menu.addEventListener('click', e => {
      if (e.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && menu.classList.contains('open')) {
        closeMenu();
        toggle.focus();
      }
    });
    document.addEventListener('click', e => {
      if (menu.classList.contains('open') && !menu.contains(e.target) && !toggle.contains(e.target)) closeMenu();
    });
  }

  const params = new URLSearchParams(location.search);
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem('livan_attribution') || '{}'); } catch { return {}; } })();
  const attribution = {
    utm_source: params.get('utm_source') || saved.utm_source || '',
    utm_medium: params.get('utm_medium') || saved.utm_medium || '',
    utm_campaign: params.get('utm_campaign') || saved.utm_campaign || '',
    utm_content: params.get('utm_content') || saved.utm_content || '',
    landing_page: saved.landing_page || location.pathname,
    referrer: saved.referrer || document.referrer || '',
    lead_source: params.get('utm_source') || saved.lead_source || (document.referrer ? 'referral' : 'direct')
  };
  try { sessionStorage.setItem('livan_attribution', JSON.stringify(attribution)); } catch {}

  document.querySelectorAll('form[data-form-track]').forEach(form => {
    Object.entries(attribution).forEach(([name,value]) => { const input=form.elements.namedItem(name); if(input) input.value=value; });
    const submittedAt = form.elements.namedItem('submitted_at');
    if (submittedAt) submittedAt.value = new Date().toISOString();
    form.addEventListener('submit', () => {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({event:'form_submit', form_name:form.getAttribute('name'), page_path:location.pathname});
      window.dataLayer.push({event:'generate_lead', form_name:form.getAttribute('name'), page_path:location.pathname});
    });
  });


  document.querySelectorAll('a[href^="https://wa.me/"]').forEach(link => {
    try {
      const url = new URL(link.href);
      const baseText = url.searchParams.get('text') || '';
      const campaign = attribution.utm_campaign ? ` | campaña: ${attribution.utm_campaign}` : '';
      const source = attribution.utm_source ? ` | fuente: ${attribution.utm_source}` : '';
      url.searchParams.set('text', `${baseText}\n\n[Origen web: ${location.pathname}${source}${campaign}]`);
      link.href = url.toString();
    } catch {}
  });

  const serviceHeading = document.querySelector('.page-hero .eyebrow');
  if (serviceHeading && !['Información legal','Proceso de pedido','Presupuesto y contacto','Galería verificable','Inspiración para tu encargo','Información antes de pedir'].includes(serviceHeading.textContent.trim())) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({event:'product_view', product:serviceHeading.textContent.trim(), page_path:location.pathname});
  }

  document.addEventListener('click', event => {
    const link = event.target.closest('[data-track]');
    if (!link) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({event:link.dataset.track, product:link.dataset.product || '', page_path:location.pathname, utm_source:attribution.utm_source, utm_campaign:attribution.utm_campaign});
  });
})();
