# IA Corporate — Impacta para Empresas

Landing page dedicada ao **Ecossistema de IA Corporativa** da Impacta (em parceria com o Olhar Digital).

Página-filha da [corporate](https://github.com/eduardoendo-hub/corporate): o hub vende o portfólio completo e linka para esta página, que captura a demanda quente de IA (mídia paga + SEO de "treinamento de IA para empresas").

## Stack
- Estática (`index.html`, `lp.css`, `app.js`, `assets/`) servida por nginx — mesmo padrão das LPs irmãs.
- `Dockerfile` + `nginx.conf` (healthcheck `/healthz`). Deploy via Coolify (Hetzner).
- Domínio: `ia-corporate.technowhub.ai` (depois espelhado em `impacta.com.br/corporate/ia`).

## Plumbing
- **Tracking:** `app.js` captura `utm_*` + clique-ids, persiste por sessão, emite eventos pro IRIS (`product_slug: ia-corporate`).
- **RD Station:** form `#leadForm` posta no backend `apiv2.impacta.com.br/api/v1/rdstation/corporate` com `conversion_identifier: "ia corporativa"`. Gated em `RD_ENABLED=false` até ativar (requer replicar a automação no RD com esse identificador).
- **WhatsApp** oficial Impacta nos CTAs.

## SEO
- Keyword-alvo: "treinamento de IA para empresas" (sem canibalizar o hub).
- `title`/`meta`/H1 próprios, canonical, JSON-LD (Org + Service IA + FAQ), `sitemap.xml`.
