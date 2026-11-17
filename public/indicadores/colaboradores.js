/*
 * Colaboradores (aba "Colaboradores" do grupo Engenharia).
 * Lê /api/indicadores/engenharia/colaboradores: por pessoa, quantos cards está tratando (acordos em aberto), a divisão
 * por cor do prazo (no prazo / atenção / vencido) e a taxa de conclusão dos acordos.
 */
(function () {
  var S = { dados: null, carregando: false, erro: null, dias: 14, quem: 'todos' };
  var SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

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
      '.co-cal { overflow-x: auto; margin-top: 18px; }',
      '.co-cal h3 { font-size: 14px; margin: 0 0 4px; }',
      '.co-cal table { border-collapse: separate; border-spacing: 0; font-size: 12px; min-width: 100%; }',
      '.co-cal th, .co-cal td { padding: 6px 8px; border-bottom: 1px solid var(--color-border-line); text-align: center; min-width: 74px; }',
      '.co-cal th { font-size: 11.5px; color: var(--color-fg-muted); font-weight: 650; background: var(--color-bg); position: sticky; top: 0; }',
      '.co-cal th:first-child, .co-cal td:first-child { text-align: left; position: sticky; left: 0; background: var(--color-panel); font-weight: 700; min-width: 110px; z-index: 1; }',
      '.co-cal th:first-child { background: var(--color-bg); z-index: 2; }',
      '.co-cal th.hoje { color: var(--color-fg); box-shadow: inset 0 -3px var(--eng-teal); }',
      '.co-cal .ab { font-size: 17px; font-weight: 750; font-variant-numeric: tabular-nums; display: block; }',
      '.co-cal .ab.zero { color: var(--color-fg-muted); font-weight: 500; }',
      '.co-cal .pt { display: inline-flex; gap: 6px; font-size: 11px; font-variant-numeric: tabular-nums; }',
      '.co-cal .pt .v { color: var(--eng-green); } .co-cal .pt .a { color: color-mix(in srgb, var(--co-amarelo) 55%, var(--color-fg)); } .co-cal .pt .r { color: var(--eng-red); }',
      '.co-cal .rs { display: block; font-size: 11px; color: var(--eng-teal); font-weight: 650; }',
      '.co-cal .nv { display: block; font-size: 10.5px; color: var(--color-fg-muted); }',
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

  function somaDia(cal, i) {
    var t = { verde: 0, amarelo: 0, vermelho: 0, resolvidos: 0 };
    cal.colaboradores.forEach(function (c) {
      if (S.quem !== 'todos' && c.chave !== S.quem) return;
      var x = c.porDia[i];
      t.verde += x.verde; t.amarelo += x.amarelo; t.vermelho += x.vermelho; t.resolvidos += x.resolvidos;
    });
    return t;
  }

  function grafico(cal) {
    var n = cal.dias.length, hoje = S.dados.hoje;
    var vals = cal.dias.map(function (d, i) { return somaDia(cal, i); });
    var max = Math.max(4, Math.max.apply(null, vals.map(function (v) { return v.verde + v.amarelo + v.vermelho; })));
    var W = Math.max(560, n * 46 + 50), H = 230, L = 34, T = 22, B = 36, ph = H - T - B, bw = Math.min(30, (W - L - 10) / n * 0.62);
    var passo = (W - L - 10) / n;
    var cores = { verde: 'var(--eng-green)', amarelo: '#e6b422', vermelho: 'var(--eng-red)' };
    var g = '';
    [0, 0.5, 1].forEach(function (f) {
      var y = T + ph - ph * f;
      g += '<line x1="' + L + '" x2="' + (W - 6) + '" y1="' + y + '" y2="' + y + '" stroke="var(--color-border-line)" stroke-width="1"/><text x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="var(--color-fg-muted)">' + Math.round(max * f) + '</text>';
    });
    cal.dias.forEach(function (d, i) {
      var v = vals[i], x = L + passo * i + (passo - bw) / 2, y = T + ph, tot = v.verde + v.amarelo + v.vermelho;
      var tip = br(d) + ': ' + tot + ' em aberto — ' + v.verde + ' no prazo, ' + v.amarelo + ' atenção, ' + v.vermelho + ' venceu/estourou · ' + v.resolvidos + ' resolvido(s)';
      g += '<g><title>' + esc(tip) + '</title>';
      ['verde', 'amarelo', 'vermelho'].forEach(function (k) {
        var h = ph * v[k] / max;
        if (h <= 0) return;
        y -= h;
        g += '<rect x="' + x + '" y="' + (y + 1) + '" width="' + bw + '" height="' + Math.max(0, h - 2) + '" rx="3" fill="' + cores[k] + '"/>';
        if (h >= 14) g += '<text x="' + (x + bw / 2) + '" y="' + (y + h / 2 + 4) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff">' + v[k] + '</text>';
      });
      if (tot) g += '<text x="' + (x + bw / 2) + '" y="' + (y - 4) + '" text-anchor="middle" font-size="11" font-weight="700" fill="var(--color-fg)">' + tot + '</text>';
      g += '<text x="' + (x + bw / 2) + '" y="' + (H - 18) + '" text-anchor="middle" font-size="10" font-weight="' + (d === hoje ? 700 : 400) + '" fill="' + (d === hoje ? 'var(--color-fg)' : 'var(--color-fg-muted)') + '">' + d.slice(8, 10) + '/' + d.slice(5, 7) + '</text>';
      g += '<text x="' + (x + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9" fill="var(--color-fg-muted)">' + SEM[new Date(d + 'T12:00:00').getDay()] + (d === hoje ? ' · hoje' : '') + '</text></g>';
    });
    var hi = cal.dias.indexOf(hoje), hv = hi >= 0 ? vals[hi] : null;
    var resumo = hv ? 'Hoje (' + br(hoje) + '): <b>' + (hv.verde + hv.amarelo + hv.vermelho) + '</b> cards em aberto — <b style="color:var(--eng-green)">' + hv.verde + ' no prazo</b>, <b style="color:#b8860b">' + hv.amarelo + ' atenção</b>, <b style="color:var(--eng-red)">' + hv.vermelho + ' venceu ou estourou</b>.' : '';
    var op = '<option value="todos"' + (S.quem === 'todos' ? ' selected' : '') + '>Todos</option>' + cal.colaboradores.map(function (c) {
      return '<option value="' + esc(c.chave) + '"' + (S.quem === c.chave ? ' selected' : '') + '>' + esc(c.nome) + '</option>';
    }).join('');
    return '<div class="co-cal"><div class="eng-panel-head"><h3>Cards por dia: no prazo, atenção e venceu</h3><span class="eng-panel-note">cards com acordo em aberto no fim de cada dia</span>' +
      '<select id="co-quem" class="eng-field" aria-label="Colaborador">' + op + '</select></div>' +
      (resumo ? '<div class="co-sub" style="margin:0 0 6px;font-size:13px">' + resumo + '</div>' : '') +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Cards em aberto por dia, por cor do prazo" style="max-width:100%;height:auto">' + g + '</svg>' +
      '<div class="ac-leg" style="display:flex;gap:14px;font-size:12px;color:var(--color-fg-muted)"><span><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--eng-green);margin-right:5px"></i>No prazo (mais de 2 dias)</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#e6b422;margin-right:5px"></i>Atenção (1 ou 2 dias)</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--eng-red);margin-right:5px"></i>Venceu ou estourou</span></div></div>';
  }

  function calendario(cal) {
    if (!cal || !cal.dias.length) return '';
    var hoje = S.dados.hoje;
    var cab = '<tr><th>Colaborador</th>' + cal.dias.map(function (d) {
      return '<th' + (d === hoje ? ' class="hoje"' : '') + '>' + SEM[new Date(d + 'T12:00:00').getDay()] + '<br>' + d.slice(8, 10) + '/' + d.slice(5, 7) + '</th>';
    }).join('') + '</tr>';
    var linhas = cal.colaboradores.map(function (c) {
      return '<tr><td>' + esc(c.nome) + '</td>' + c.porDia.map(function (x) {
        if (!x.abertos && !x.resolvidos && !x.novos) return '<td><span class="ab zero">0</span></td>';
        return '<td title="' + esc(c.nome) + ' · ' + br(x.dia) + ': ' + x.abertos + ' aberto(s) ao fim do dia (' + x.verde + ' em prazo, ' + x.amarelo + ' atenção, ' + x.vermelho + ' vencido), ' + x.resolvidos + ' resolvido(s), ' + x.novos + ' acordo(s) novo(s)">' +
          '<span class="ab' + (x.abertos ? '' : ' zero') + '">' + x.abertos + '</span>' +
          (x.abertos ? '<span class="pt"><span class="v">' + x.verde + '</span><span class="a">' + x.amarelo + '</span><span class="r">' + x.vermelho + '</span></span>' : '') +
          (x.resolvidos ? '<span class="rs">✓ ' + x.resolvidos + ' resolvido(s)</span>' : '') +
          (x.novos ? '<span class="nv">+' + x.novos + ' acordo(s)</span>' : '') + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var op = [7, 14, 30].map(function (n) { return '<option value="' + n + '"' + (S.dias === n ? ' selected' : '') + '>Últimos ' + n + ' dias</option>'; }).join('');
    return '<div class="co-cal"><div class="eng-panel-head"><h3>Evolução por dia</h3><span class="eng-panel-note">cards em aberto no fim de cada dia · <span style="color:var(--eng-green)">verde</span> em prazo, <span style="color:#b8860b">amarelo</span> atenção, <span style="color:var(--eng-red)">vermelho</span> vencido</span><select id="co-dias" class="eng-field" aria-label="Período">' + op + '</select></div>' +
      '<table><thead>' + cab + '</thead><tbody>' + linhas + '</tbody></table></div>';
  }

  function desenhar() {
    var el = raiz();
    if (!el) return;
    if (S.erro && !S.dados) { el.innerHTML = '<div class="eng-panel"><div class="ge-vazio">Não foi possível carregar os colaboradores: ' + esc(S.erro) + '</div></div>'; return; }
    if (!S.dados) { el.innerHTML = '<div class="eng-panel"><div class="ge-vazio">Carregando os colaboradores…</div></div>'; return; }
    var cs = S.dados.colaboradores, o = S.dados.outros;
    var outros = o.total ? '<div class="co-sub">Acordos de outros responsáveis (fora desta lista): ' + o.cards + ' em aberto, ' + (o.feitos + o.saiu) + ' resolvido(s).</div>' : '';
    el.innerHTML = '<section class="eng-panel"><div class="eng-panel-head"><h2>Colaboradores · Engenharia</h2><span class="eng-panel-note">cards = acordos em aberto · cores pelo prazo · taxa = resolvidos ÷ todos os acordos</span><button id="co-atualizar" class="eng-clear-btn" type="button">Atualizar</button></div>' +
      '<div class="co-grid">' + cs.map(cartao).join('') + '</div>' + (S.dados.calendario ? grafico(S.dados.calendario) : '') + calendario(S.dados.calendario) + outros +
      '<div class="co-sub">Verde: mais de 2 dias para o prazo · Amarelo: faltam 1 ou 2 dias · Vermelho: vence hoje ou estourou. Taxa de conclusão = acordos feitos (ou cujo card saiu da etapa) ÷ acordos feitos, abertos e saídos; acordos substituídos por um mais novo não contam.</div></section>';
    var b = document.getElementById('co-atualizar');
    if (b) b.onclick = function () { carregar(); };
    var qu = document.getElementById('co-quem');
    if (qu) qu.onchange = function () { S.quem = qu.value; desenhar(); };
    var sel = document.getElementById('co-dias');
    if (sel) sel.onchange = function () { S.dias = Number(sel.value); carregar(); };
  }

  function carregar() {
    if (S.carregando) return Promise.resolve();
    S.carregando = true;
    return fetch('/api/indicadores/engenharia/colaboradores?dias=' + S.dias, { headers: { accept: 'application/json' } }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (b) { throw new Error(b.error || ('Erro ' + r.status)); });
      return r.json();
    }).then(function (d) { S.dados = d; S.erro = null; }, function (e) { S.erro = e.message; })
      .then(function () { S.carregando = false; desenhar(); });
  }

  window.engColab = { mostrar: function () { css(); desenhar(); carregar(); } };
})();
