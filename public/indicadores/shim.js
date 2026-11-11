/*
 * Ponte do painel "Indicador Engenharia - Groner" com o servidor.
 *
 * O index.html foi gerado para um ambiente que injetava `dash` (dados) e `claude.use('db')`
 * (metas). Aqui:
 *   - dash.data('cards' | 'eng_resumo' | 'sales') lê /api/indicadores/cards, /eng-resumo e /sales
 *     (o servidor monta tudo do Neon; nada vem do Groner ao vivo);
 *   - window.indicadoresMetas guarda as metas em /api/indicadores/metas/:id (Neon) e mantém uma
 *     cópia no navegador (localStorage) para quando o servidor não responder.
 */
(function () {
  var BASE = '/api/indicadores';
  var FONTES = { cards: '/cards', eng_resumo: '/eng-resumo', sales: '/sales' };
  var estado = {};
  var ouvintes = [];
  var pronto = false;

  Object.keys(FONTES).forEach(function (k) { estado[k] = { status: 'loading', data: null }; });

  function obter(caminho) {
    return fetch(BASE + caminho, { headers: { accept: 'application/json' } }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (b) { throw new Error(b.error || ('Erro ' + r.status)); });
      return r.json();
    });
  }

  function avisar() {
    pronto = true;
    ouvintes.forEach(function (cb) { try { cb(); } catch (e) { console.error(e); } });
    // Link direto para uma visão: /indicadores/#sales, #exec, #funeng.
    var aba = window.location.hash.replace('#', '');
    var botao = aba && document.querySelector('[data-tab="' + aba.replace(/[^a-z]/g, '') + '"]');
    if (botao) botao.click();
  }

  window.dash = {
    data: function (nome) { return estado[nome] || { status: 'error', data: null, error: 'Fonte desconhecida' }; },
    onData: function (cb) { ouvintes.push(cb); if (pronto) cb(); },
  };

  // Estado de carregamento / erro: antes os gráficos ficavam em branco e os KPIs em "—" sem explicação.
  var NOMES = { cards: 'projetos', eng_resumo: 'resumo de engenharia', sales: 'vendas' };
  function aviso() {
    var el = document.getElementById('indicadores-estado');
    if (el) return el;
    var raiz = document.querySelector('#dash-root .eng-wrap') || document.getElementById('dash-root');
    if (!raiz) return null;
    el = document.createElement('div');
    el.id = 'indicadores-estado';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = 'font-size:13px;line-height:1.5;color:var(--color-fg);border:1px solid var(--color-border-line);border-left:4px solid var(--eng-teal);background:var(--color-panel);border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap';
    raiz.prepend(el);
    return el;
  }
  function mostrarCarregando() {
    quandoPronto(function () {
      var el = aviso();
      if (el && !pronto) el.textContent = 'Carregando indicadores do banco… os números e gráficos aparecem em instantes.';
    });
  }
  function mostrarResultado() {
    var falhas = Object.keys(estado).filter(function (k) { return estado[k].status === 'error'; });
    var el = document.getElementById('indicadores-estado');
    if (!falhas.length) { if (el) el.remove(); return; }
    el = aviso();
    if (!el) return;
    el.style.borderLeftColor = 'var(--eng-red)';
    el.textContent = 'Não foi possível carregar: ' + falhas.map(function (k) { return NOMES[k] + ' (' + estado[k].error + ')'; }).join('; ') + '. ';
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Tentar de novo';
    b.style.cssText = 'font:inherit;font-weight:600;cursor:pointer;border:1px solid var(--color-border-line);background:transparent;color:var(--color-fg);border-radius:8px;padding:4px 12px';
    b.addEventListener('click', function () { window.location.reload(); });
    el.appendChild(b);
  }
  mostrarCarregando();

  Promise.all(Object.keys(FONTES).map(function (k) {
    return obter(FONTES[k]).then(
      function (lista) { estado[k] = { status: 'ok', data: Array.isArray(lista) ? lista : [] }; },
      function (err) { estado[k] = { status: 'error', data: null, error: err.message }; }
    );
  })).then(function () { mostrarResultado(); avisar(); });

  // Faixa com a origem dos dados (e o aviso quando o banco ainda não tem projetos).
  function faixa(status, erro) {
    var raiz = document.querySelector('#dash-root .eng-wrap');
    if (!raiz) return;
    var el = document.createElement('div');
    el.id = 'indicadores-origem';
    el.setAttribute('role', 'status');
    el.style.cssText = 'font-size:12px;line-height:1.5;color:var(--color-fg-muted);border:1px solid var(--color-border-line);background:var(--color-panel);border-radius:8px;padding:8px 12px';
    var fmt = function (iso) { return iso ? new Date(iso).toLocaleString('pt-BR') : 'sem carga registrada'; };
    var texto;
    if (erro) {
      texto = 'Não foi possível ler a situação dos dados: ' + erro;
    } else {
      texto = 'Fonte: banco do painel, sincronizado com o Groner. ' +
        status.cards.total.toLocaleString('pt-BR') + ' cards (projetos: ' + fmt(status.cards.atualizadoEm) + ') · ' +
        status.sales.total.toLocaleString('pt-BR') + ' vendas (' + fmt(status.sales.atualizadoEm) + ').';
    }
    el.textContent = texto;
    if (status && status.aviso) {
      var b = document.createElement('strong');
      b.style.cssText = 'display:block;color:var(--eng-orange)';
      b.textContent = status.aviso;
      el.appendChild(b);
    }
    var band = raiz.querySelector('.eng-band');
    if (band && band.nextSibling) raiz.insertBefore(el, band.nextSibling); else raiz.prepend(el);
  }

  function quandoPronto(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn();
  }
  obter('/status').then(function (s) { quandoPronto(function () { faixa(s, null); }); }, function (e) { quandoPronto(function () { faixa(null, e.message); }); });

  // ---- Metas ----
  var CHAVE_LOCAL = 'indicadores-meta:';
  var CHAVE_CODIGO = 'indicadores-metas-codigo';
  function lerLocal(chave) { try { return window.localStorage.getItem(chave); } catch (e) { return null; } }
  function gravarLocal(chave, valor) { try { window.localStorage.setItem(chave, valor); } catch (e) { /* sem armazenamento */ } }

  function idDe(caminho) { return String(caminho).split('/').pop(); }

  function enviar(id, payload, codigo) {
    var headers = { 'content-type': 'application/json' };
    if (codigo) headers['X-Metas-Token'] = codigo;
    return fetch(BASE + '/metas/' + encodeURIComponent(id), { method: 'PUT', headers: headers, body: JSON.stringify(payload) });
  }

  window.indicadoresMetas = {
    doc: function (caminho) {
      var id = idDe(caminho);
      return {
        get: function () {
          return obter('/metas/' + encodeURIComponent(id)).then(function (r) {
            if (r.existe) gravarLocal(CHAVE_LOCAL + id, JSON.stringify(r.dados));
            return { exists: Boolean(r.existe), data: function () { return r.dados; } };
          }, function () {
            var local = lerLocal(CHAVE_LOCAL + id);
            var dados = local ? JSON.parse(local) : null;
            return { exists: Boolean(dados), data: function () { return dados; }, aviso: dados ? 'Servidor indisponível: meta lida da cópia deste navegador.' : undefined };
          });
        },
        set: function (payload) {
          gravarLocal(CHAVE_LOCAL + id, JSON.stringify(payload));
          return enviar(id, payload, lerLocal(CHAVE_CODIGO)).then(function (r) {
            if (r.status === 401) {
              var codigo = window.prompt('Código para editar as metas:');
              if (!codigo) throw new Error('Código não informado');
              return enviar(id, payload, codigo).then(function (r2) {
                if (!r2.ok) throw new Error('Código inválido');
                gravarLocal(CHAVE_CODIGO, codigo);
                return {};
              });
            }
            if (!r.ok) return r.json().catch(function () { return {}; }).then(function (b) { throw new Error(b.error || ('Erro ' + r.status)); });
            return {};
          }).catch(function (err) {
            if (/Código/.test(err.message)) throw err;
            return { aviso: 'Meta salva só neste navegador (servidor: ' + err.message + ').' };
          });
        },
      };
    },
  };
})();
