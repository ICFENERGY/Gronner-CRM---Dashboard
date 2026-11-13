/*
 * Colaboradores (aba "Colaboradores" do grupo Engenharia).
 * Lê /api/indicadores/engenharia/colaboradores: por pessoa, quantos cards está tratando (acordos em aberto), a divisão
 * por cor do prazo (no prazo / atenção / vencido) e a taxa de conclusão dos acordos.
 */
(function () {
  var S = { dados: null, carregando: false, erro: null };

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function br(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—'; }
  function raiz() { return document.getElementById('eng-view-colab'); }
  function pct(v) { return v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'; }

  function css() {
    if (document.getElementById('colab-css')) return;
    var st = document.createElement('style');
    st.id = 'colab-css';
    st.textContent = [
      '#eng-view-colab { --co-amarelo: #e6b422; }',
      '.co-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; margin-bottom: 14px; }',
      '.co-card { border: 1px solid var(--color-border-line); border-radius: 12px; background: var(--color-panel); padding: 16px; }',
      '.co-top { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }',
      '.co-nome { font-size: 17px; font-weight: 700; }',
      '.co-cards { font-size: 12px; color: var(--color-fg-muted); }',
      '.co-big { font-size: 34px; font-weight: 750; font-variant-numeric: tabular-nums; line-height: 1.1; margin: 8px 0 2px; }',
      '.co-cores { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0; }',
      '.co-cor { border-radius: 10px; padding: 8px 10px; border-left: 4px solid; }',
      '.co-cor b { display: block; font-size: 22px; font-variant-numeric: tabular-nums; }',
      '.co-cor span { font-size: 11.5px; color: var(--color-fg-muted); }',
      '.co-cor.verde { border-color: var(--eng-green); background: color-mix(in srgb, var(--eng-green) 10%, transparent); }',
      '.co-cor.amarelo { border-color: var(--co-amarelo); background: color-mix(in srgb, var(--co-amarelo) 12%, transparent); }',
      '.co-cor.vermelho { border-color: var(--eng-red); background: color-mix(in srgb, var(--eng-red) 11%, transparent); }',
      '.co-taxa-l { display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 5px; }',
      '.co-taxa-l b { font-variant-numeric: tabular-nums; }',
      '.co-barra { height: 10px; border-radius: 6px; background: color-mix(in srgb, var(--eng-gray) 22%, transparent); overflow: hidden; }',
      '.co-barra i { display: block; height: 100%; background: var(--eng-teal); border-radius: 6px; }',
      '.co-sub { font-size: 11.5px; color: var(--color-fg-muted); margin-top: 6px; }',
      '.co-lista { margin-top: 12px; border-top: 1px solid var(--color-border-line); }',
      '.co-it { display: grid; grid-template-columns: 62px minmax(0,1fr) auto; gap: 8px; padding: 6px 0 6px 8px; font-size: 12.5px; border-bottom: 1px solid var(--color-border-line); border-left: 4px solid transparent; align-items: baseline; }',
      '.co-it.verde { border-left-color: var(--eng-green); } .co-it.amarelo { border-left-color: var(--co-amarelo); } .co-it.vermelho { border-left-color: var(--eng-red); }',
      '.co-it b { font-variant-numeric: tabular-nums; }',
      '.co-it .co-ac { overflow-wrap: anywhere; }',
      '.co-it .co-pz { font-size: 11.5px; color: var(--color-fg-muted); white-space: nowrap; }',
      '.co-it.vermelho .co-pz { color: var(--eng-red); font-weight: 700; }',
      '.co-it.amarelo .co-pz { color: color-mix(in srgb, var(--co-amarelo) 55%, var(--color-fg)); font-weight: 650; }',
      '.co-it.verde .co-pz { color: var(--eng-green); font-weight: 650; }'
    ].join('\n');
    document.head.appendChild(st);
  }

  function prazoTxt(a) {
    var d = a.diasParaPrazo;
    if (d < 0) return 'vencido há ' + (-d) + ' dia(s)';
    if (d === 0) return 'vence hoje';
    return 'prazo ' + br(a.prazo) + ' · ' + (d === 1 ? '1 dia' : d + ' dias');
  }

  function cartao(m) {
    var lista = m.abertos.slice(0, 8).map(function (a) {
      return '<div class="co-it ' + esc(a.cor) + '"><b>#' + a.codigo + '</b><span class="co-ac">' + esc(a.nome || a.acao) + '</span><span class="co-pz">' + prazoTxt(a) + '</span></div>';
    }).join('');
    var mais = m.abertos.length > 8 ? '<div class="co-sub">+ ' + (m.abertos.length - 8) + ' card(s) em aberto — veja todos em "Acordos do dia"</div>' : '';
    return '<div class="co-card">' +
      '<div class="co-top"><span class="co-nome">' + esc(m.nome) + '</span><span class="co-cards">cards em tratamento</span></div>' +
      '<div class="co-big">' + m.cards.toLocaleString('pt-BR') + '</div>' +
      '<div class="co-cores">' +
      '<div class="co-cor verde"><b>' + m.noPrazo + '</b><span>Em prazo</span></div>' +
      '<div class="co-cor amarelo"><b>' + m.atencao + '</b><span>Atenção</span></div>' +
      '<div class="co-cor vermelho"><b>' + m.vencido + '</b><span>Vencido</span></div>' +
      '</div>' +
      '<div class="co-taxa-l"><span>Taxa de conclusão</span><b>' + pct(m.taxa) + '</b></div>' +
      '<div class="co-barra" role="img" aria-label="Taxa de conclusão ' + pct(m.taxa) + '"><i style="width:' + (m.taxa || 0) + '%"></i></div>' +
      '<div class="co-sub">' + (m.total ? (m.feitos + m.saiu) + ' resolvido(s) de ' + m.total + ' acordo(s) · ' + m.feitos + ' marcado(s) como feito, ' + m.saiu + ' saiu(ram) da etapa' : 'Nenhum acordo registrado ainda') + '</div>' +
      (lista ? '<div class="co-lista">' + lista + '</div>' + mais : '') +
      '</div>';
  }

  function desenhar() {
    var el = raiz();
    if (!el) return;
    if (S.erro && !S.dados) { el.innerHTML = '<div class="eng-panel"><div class="ge-vazio">Não foi possível carregar os colaboradores: ' + esc(S.erro) + '</div></div>'; return; }
    if (!S.dados) { el.innerHTML = '<div class="eng-panel"><div class="ge-vazio">Carregando os colaboradores…</div></div>'; return; }
    var cs = S.dados.colaboradores, o = S.dados.outros;
    var outros = o.total ? '<div class="co-sub">Acordos de outros responsáveis (fora desta lista): ' + o.cards + ' em aberto, ' + (o.feitos + o.saiu) + ' resolvido(s).</div>' : '';
    el.innerHTML = '<section class="eng-panel"><div class="eng-panel-head"><h2>Colaboradores · Engenharia</h2><span class="eng-panel-note">cards = acordos em aberto · cores pelo prazo · taxa = resolvidos ÷ todos os acordos</span><button id="co-atualizar" class="eng-clear-btn" type="button">Atualizar</button></div>' +
      '<div class="co-grid">' + cs.map(cartao).join('') + '</div>' + outros +
      '<div class="co-sub">Verde: mais de 2 dias para o prazo · Amarelo: faltam 1 ou 2 dias · Vermelho: vence hoje ou estourou. Taxa de conclusão = acordos feitos (ou cujo card saiu da etapa) ÷ acordos feitos, abertos e saídos; acordos substituídos por um mais novo não contam.</div></section>';
    var b = document.getElementById('co-atualizar');
    if (b) b.onclick = function () { carregar(); };
  }

  function carregar() {
    if (S.carregando) return Promise.resolve();
    S.carregando = true;
    return fetch('/api/indicadores/engenharia/colaboradores', { headers: { accept: 'application/json' } }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (b) { throw new Error(b.error || ('Erro ' + r.status)); });
      return r.json();
    }).then(function (d) { S.dados = d; S.erro = null; }, function (e) { S.erro = e.message; })
      .then(function () { S.carregando = false; desenhar(); });
  }

  window.engColab = { mostrar: function () { css(); desenhar(); carregar(); } };
})();
