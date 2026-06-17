/* ──────────────────────────────────────────────────────────────────────────────
 *  app.js — Impacta para Empresas / Corporate (corporate.technowhub.ai)
 *  ─────────────────────────────────────────────────────────────────────────────
 *  O que faz:
 *   1. Captura utm_* (+ gclid/fbclid/...) da URL e persiste por sessão.
 *      → permite saber de QUAL campanha/anúncio o lead veio (atribuição).
 *   2. Repassa os params para TODOS os links de saída absolutos (WhatsApp),
 *      preservando a atribuição até a conversa.
 *   3. Empurra eventos pra IRIS (cockpit em tempo real): lp_view, click_whats,
 *      click_cta, lead — POST /api/events (mesma convenção das LPs irmãs).
 *   4. Formulário de lead: valida → envia evento `lead` pra IRIS (com UTMs) →
 *      envia pro RD Station (quando RD_* estiver preenchido) → mostra sucesso.
 *   5. Pixel Meta — placeholder no-op até META_PIXEL_ID ser preenchido.
 *  ──────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var CFG = {
    PRODUCT_SLUG:    'corporativo',
    CAMPAIGN_SLUG:   'corporativo', // campanha padrão (orgânico/institucional);
                                                  // campanhas reais chegam via utm_campaign na URL.
    IRIS_EVENTS_URL: 'https://iris.technowhub.ai/api/events',
    CURRENCY:        'BRL',
    // Preencher quando o Pixel entrar (deixe vazio = no-op):
    META_PIXEL_ID:   '',
    // ─── RD Station via backend da Impacta ─────────────────────────────
    // A LP posta no MESMO endpoint do site atual (apiv2.impacta.com.br), que
    // cria o lead no RD e abre a oportunidade (chave da API fica no servidor).
    // Mantenha RD_ENABLED=false até o backend liberar CORS p/ esta origem —
    // assim não disparamos leads de teste na produção. Em impacta.com.br/corporate
    // (mesma origem) o CORS deixa de ser problema.
    RD_ENABLED:               false,
    RD_ENDPOINT:              'https://apiv2.impacta.com.br/api/v1/rdstation/corporate',
    RD_CONVERSION_IDENTIFIER: 'ia corporativa',   // NOVO identificador (segmenta leads de IA);
                                                  // exige replicar a automação no RD com esse nome.
  };

  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  // Outros params de clique que também devem ser repassados / atribuídos:
  var PASSTHROUGH_KEYS = ['gclid', 'fbclid', 'gad_source', 'msclkid'];
  var ALL_KEYS = UTM_KEYS.concat(PASSTHROUGH_KEYS);

  // ─── 1. Captura + persiste params da URL ──────────────────────────────────
  function getTrackingParams() {
    var qs = new URLSearchParams(window.location.search);
    var saved = {};
    try { saved = JSON.parse(sessionStorage.getItem('cp_tracking') || '{}'); } catch (e) {}
    ALL_KEYS.forEach(function (k) {
      var v = qs.get(k);
      if (v) saved[k] = v;
    });
    try { sessionStorage.setItem('cp_tracking', JSON.stringify(saved)); } catch (e) {}
    return saved;
  }

  // ─── 2. Anexa os params capturados a uma URL absoluta, sem sobrescrever ────
  function withTracking(rawHref, params) {
    if (!rawHref) return rawHref;
    var url;
    try { url = new URL(rawHref, window.location.href); } catch (e) { return rawHref; }
    Object.keys(params).forEach(function (k) {
      if (!url.searchParams.has(k)) url.searchParams.set(k, params[k]);
    });
    return url.toString();
  }

  // ─── 3. Evento pra IRIS (cockpit em tempo real) ───────────────────────────
  function sendIrisEvent(eventName, extra) {
    try {
      var p = getTrackingParams();
      var body = {
        product_slug:  CFG.PRODUCT_SLUG,
        event_name:    eventName,
        campaign_slug: p.utm_campaign || CFG.CAMPAIGN_SLUG,
        page_url:      location.href,
        utm_source:    p.utm_source   || null,
        utm_medium:    p.utm_medium   || null,
        utm_campaign:  p.utm_campaign || null,
        utm_content:   p.utm_content  || null,
        utm_term:      p.utm_term     || null,
        referrer:      document.referrer || null
      };
      if (extra && extra.value != null) body.value = extra.value;
      if (extra && extra.currency)      body.currency = extra.currency;
      if (extra)                        body.meta = extra;
      fetch(CFG.IRIS_EVENTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
        mode: 'cors'
      }).catch(function () {});
    } catch (e) {}
  }

  // ─── 4. Aplica nos links de saída (WhatsApp) + dispara eventos de clique ───
  function decorateOutboundLinks(params) {
    document.querySelectorAll('a[data-cta]').forEach(function (el) {
      if (el.dataset.ctaBound) return;
      el.dataset.ctaBound = '1';
      var cta = el.getAttribute('data-cta');
      var href = el.getAttribute('href') || '';
      // só decora URLs absolutas (WhatsApp), nunca âncoras internas (#contato)
      if (href.indexOf('http') === 0) {
        el.setAttribute('href', withTracking(href, params));
      }
      el.addEventListener('click', function () {
        if (cta === 'whatsapp') {
          sendIrisEvent('click_whats', { channel: 'whatsapp' });
          track('Contact', { placement: 'whatsapp' });
        } else if (cta === 'proposta') {
          sendIrisEvent('click_consultor', { channel: 'proposta' });
        }
      });
    });
  }

  // ─── 5. Formulário de lead → IRIS + RD Station ────────────────────────────
  function sendToRD(payload) {
    // Posta no backend da Impacta (mesmo endpoint do site atual) que cria o lead
    // no RD e abre a oportunidade. No-op enquanto RD_ENABLED=false (espera CORS).
    if (!CFG.RD_ENABLED) return Promise.resolve();
    var p = getTrackingParams();
    var body = {
      conversion_identifier: CFG.RD_CONVERSION_IDENTIFIER,   // "ia corporativa" (segmenta como IA)
      pessoa:    payload.nome,
      email:     payload.email,
      telefone:  payload.telefone,
      empresa:   payload.empresa,
      produto:   payload.interesse,   // mapeia "Solução de interesse" -> produto
      tamanho:   payload.porte,       // "Nº de colaboradores" -> tamanho
      cargo:     payload.cargo,
      consentimento_email: payload.consent ? 'true' : 'false',
      mensagem:  payload.msg,
      // marcação de origem — deixa claro no lead/oportunidade que veio da página de IA
      origem:    'IA Corporate (impacta.com.br/ia-corporate)',
      tags:      ['IA Corporate', 'ia-corporate'],
      // atribuição (de onde veio o lead) — RD usa traffic_*; mandamos também utm_*
      traffic_source:   p.utm_source   || null,
      traffic_medium:   p.utm_medium   || null,
      traffic_campaign: p.utm_campaign || null,
      traffic_value:    p.utm_content  || null,
      utm_source:   p.utm_source   || null,
      utm_medium:   p.utm_medium   || null,
      utm_campaign: p.utm_campaign || null,
      utm_content:  p.utm_content  || null,
      utm_term:     p.utm_term     || null
    };
    return fetch(CFG.RD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      mode: 'cors'
    }).catch(function () {});
  }

  function initLeadForm() {
    var f = document.getElementById('leadForm');
    if (!f || f.dataset.bound) return;
    f.dataset.bound = '1';
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!f.checkValidity()) { f.reportValidity(); return; }
      var data = {
        nome:      (f.nome      && f.nome.value      || '').trim(),
        email:     (f.email     && f.email.value     || '').trim(),
        telefone:  (f.telefone  && f.telefone.value  || '').trim(),
        empresa:   (f.empresa   && f.empresa.value   || '').trim(),
        porte:     (f.porte     && f.porte.value     || ''),
        interesse: (f.interesse && f.interesse.value || ''),
        cargo:     (f.cargo     && f.cargo.value     || ''),
        consent:   !!(f.consent && f.consent.checked),
        msg:       (f.msg       && f.msg.value       || '').trim()
      };
      // IRIS: evento de lead (sem PII sensível — empresa/interesse para o cockpit)
      sendIrisEvent('lead_form', { empresa: data.empresa, interesse: data.interesse, porte: data.porte });
      track('Lead', { content_name: data.interesse || 'corporate' });
      // RD Station (no-op até configurar o token)
      sendToRD(data);
      // UI de sucesso (otimista)
      f.style.display = 'none';
      var ok = document.getElementById('formOk');
      if (ok) ok.classList.add('show');
    });
  }

  // ─── 6. Pixel Meta (no-op até ter ID) ─────────────────────────────────────
  function initPixel() {
    if (!CFG.META_PIXEL_ID || window.fbq) return;
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
      (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', CFG.META_PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function track(eventName, params) {
    params = params || {};
    if (window.fbq) { try { window.fbq('track', eventName, params); } catch (e) {} }
    if (window.dataLayer) { window.dataLayer.push(Object.assign({ event: eventName }, params)); }
  }

  // ─── 7. Run + observa mudanças no DOM ─────────────────────────────────────
  function apply() {
    var params = getTrackingParams();
    decorateOutboundLinks(params);
    initLeadForm();
  }

  initPixel();
  apply();
  new MutationObserver(apply).observe(document.body, { childList: true, subtree: true });

  // lp_view — uma vez por carregamento
  sendIrisEvent('lp_view');
})();
