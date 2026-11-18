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
      '.co-it.verde .co-pz { color: var(--eng-green); font-weight: 650; }',
      '#co-print { display: none; }',
      '@media print {',
      '  body.co-imprimindo > *:not(#co-print) { display: none !important; }',
      '  body.co-imprimindo #co-print { display: block; color: #111; font: 11.5px/1.45 system-ui, sans-serif; }',
      '  body.co-imprimindo { background: #fff !important; }',
      '  #co-print .cp-pag { break-after: page; }',
      '  #co-print .cp-pag:last-child { break-after: auto; }',
      '  #co-print h1 { font-size: 19px; margin: 0 0 2px; }',
      '  #co-print h2 { font-size: 14px; margin: 14px 0 6px; }',
      '  #co-print .cp-sub { color: #555; margin: 0 0 10px; }',
      '  #co-print .cp-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 8px 0; }',
      '  #co-print .cp-k { border: 1px solid #bbb; border-radius: 6px; padding: 6px 8px; }',
      '  #co-print .cp-k b { display: block; font-size: 17px; }',
      '  #co-print .cp-k span { font-size: 10px; color: #444; }',
      '  #co-print .cp-res { border-left: 4px solid #1b8a8f; background: #f1f6f6; padding: 7px 10px; margin: 8px 0; font-size: 12.5px; }',
      '  #co-print table { width: 100%; border-collapse: collapse; font-size: 10.5px; }',
      '  #co-print th, #co-print td { border-bottom: 1px solid #ccc; padding: 4px 5px; text-align: left; vertical-align: top; }',
      '  #co-print th { background: #eee; font-size: 10px; }',
      '  #co-print tr { break-inside: avoid; }',
      '  #co-print td.n, #co-print th.n { text-align: center; }',
      '  #co-print .s-ok { color: #1e7a45; font-weight: 700; } #co-print .s-atr { color: #b06a00; font-weight: 700; } #co-print .s-venc { color: #c62828; font-weight: 700; } #co-print .s-at { color: #9a7400; font-weight: 700; } #co-print .s-pz { color: #1e7a45; } #co-print .s-saiu { color: #555; }',
      '  @page { margin: 11mm; }',
      '}'
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
      '<select id="co-quem" class="eng-field" aria-label="Colaborador">' + op + '</select><button type="button" class="eng-clear-btn co-pdf">Exportar PDF</button></div>' +
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
    ligarEvolucao(el);
    pintarExtra();
  }

  function ligarEvolucao(el) {
    var pdf = el.querySelector('.co-pdf');
    if (pdf) pdf.onclick = function () { exportarPdf(pdf); };
    var qu = el.querySelector('#co-quem');
    if (qu) qu.onchange = function () { S.quem = qu.value; desenhar(); };
    var sel = el.querySelector('#co-dias');
    if (sel) sel.onchange = function () { S.dias = Number(sel.value); carregar(); };
  }

  // Gráfico e calendário por dia também aparecem dentro de "Acordos do dia" (S.extra = área reservada lá).
  function pintarExtra() {
    var x = S.extra;
    if (!x || !document.body.contains(x)) return;
    if (!S.dados || !S.dados.calendario) { x.innerHTML = S.erro ? '' : '<div class="ge-vazio">Carregando a evolução por colaborador…</div>'; return; }
    x.innerHTML = grafico(S.dados.calendario) + calendario(S.dados.calendario);
    ligarEvolucao(x);
  }

  function carregar() {
    if (S.carregando) return Promise.resolve();
    S.carregando = true;
    return fetch('/api/indicadores/engenharia/colaboradores?dias=' + S.dias, { headers: { accept: 'application/json' } }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (b) { throw new Error(b.error || ('Erro ' + r.status)); });
      return r.json();
    }).then(function (d) { S.dados = d; S.erro = null; S.carregadoEm = Date.now(); }, function (e) { S.erro = e.message; })
      .then(function () { S.carregando = false; desenhar(); pintarExtra(); });
  }

  // ─── PDF: comparativo do que cada colaborador combinou e do que realizou no período do calendário ───
  function diaBr(iso) { return iso ? new Date(Date.parse(iso) - 3 * 3600e3).toISOString().slice(0, 10) : null; }

  function situacao(a) {
    if (a.status === 'feita') {
      var d = diaBr(a.feitaEm);
      return d && d <= a.prazo ? { ord: 4, cls: 's-ok', txt: 'Feito no prazo (' + br(d) + ')' } : { ord: 3, cls: 's-atr', txt: 'Feito com atraso (' + br(d) + ')' };
    }
    if (a.status === 'saiu') return { ord: 5, cls: 's-saiu', txt: 'Card saiu da etapa' };
    if (a.cor === 'vermelho') return { ord: 0, cls: 's-venc', txt: a.diasParaPrazo === 0 ? 'Vence hoje' : 'Vencido há ' + (-a.diasParaPrazo) + ' dia(s)' };
    if (a.cor === 'amarelo') return { ord: 1, cls: 's-at', txt: 'Atenção (faltam ' + a.diasParaPrazo + ' dia(s))' };
    return { ord: 2, cls: 's-pz', txt: 'No prazo (faltam ' + a.diasParaPrazo + ' dias)' };
  }

  function paginaPdf(c, itens, cal, de, ate) {
    var lista = itens.filter(function (a) { return a.colaborador === c.chave && a.status !== 'atualizado'; })
      .map(function (a) { return { a: a, s: situacao(a) }; })
      .sort(function (x, y) { return x.s.ord - y.s.ord || (x.a.prazo < y.a.prazo ? -1 : 1); });
    var n = function (cls) { return lista.filter(function (x) { return x.s.cls === cls; }).length; };
    var noPrazo = n('s-ok'), atraso = n('s-atr'), saiu = n('s-saiu'), venc = n('s-venc'), aten = n('s-at'), pz = n('s-pz');
    var total = lista.length, resolvidos = noPrazo + atraso + saiu, cobrados = noPrazo + atraso + venc;
    var pc = function (a, b) { return b ? Math.round(a / b * 100) + '%' : '—'; };
    var linhaCal = '';
    var col = cal.colaboradores.filter(function (x) { return x.chave === c.chave; })[0];
    if (col) {
      linhaCal = '<h2>Cards em aberto no fim de cada dia</h2><table><thead><tr><th></th>' + cal.dias.map(function (d) { return '<th class="n">' + d.slice(8, 10) + '/' + d.slice(5, 7) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        [['Em aberto', 'abertos'], ['No prazo', 'verde'], ['Atenção', 'amarelo'], ['Vencido', 'vermelho'], ['Resolvidos no dia', 'resolvidos'], ['Acordos novos', 'novos']].map(function (r) {
          return '<tr><td>' + r[0] + '</td>' + col.porDia.map(function (x) { return '<td class="n">' + (x[r[1]] || 0) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table>';
    }
    var k = function (v, t) { return '<div class="cp-k"><b>' + v + '</b><span>' + t + '</span></div>'; };
    return '<section class="cp-pag"><h1>' + esc(c.nome) + ' · acordos da Engenharia</h1>' +
      '<p class="cp-sub">Período: ' + br(de) + ' a ' + br(ate) + ' (acordos feitos nesses dias) · gerado em ' + new Date().toLocaleString('pt-BR') + '</p>' +
      '<div class="cp-kpis">' + k(total, 'acordos no período') + k(resolvidos + ' · ' + pc(resolvidos, total), 'resolvidos (taxa de conclusão)') +
      k(noPrazo, 'feitos no prazo') + k(atraso, 'feitos com atraso') + k(saiu, 'card saiu da etapa') +
      k(pz, 'em aberto · no prazo') + k(aten, 'em aberto · atenção') + k(venc, 'em aberto · vencidos') + '</div>' +
      '<div class="cp-res"><b>Comparativo:</b> combinou ' + total + ' acordo(s) e resolveu ' + resolvidos + ' (' + pc(resolvidos, total) + '). ' +
      'Dos acordos cujo prazo já foi cobrado (feitos ou vencidos), cumpriu no prazo ' + noPrazo + ' de ' + cobrados + ' (' + pc(noPrazo, cobrados) + '). ' +
      (venc ? '<b>' + venc + ' vencido(s) sem conclusão.</b>' : 'Nenhum acordo vencido sem conclusão.') + '</div>' +
      linhaCal +
      '<h2>Cards com acordo (' + total + ')</h2>' +
      (total ? '<table><thead><tr><th>Card</th><th>Cliente / etapa</th><th>O que foi combinado</th><th>Acordo em</th><th>Prazo</th><th>Situação</th></tr></thead><tbody>' +
        lista.map(function (x) {
          var a = x.a;
          return '<tr><td>#' + a.codigo + '</td><td>' + esc(a.nome || '—') + '<br><span style="color:#555">' + esc(a.funil) + (a.funilNome ? ' · ' + esc(a.funilNome) : '') + ' · ' + esc(a.etapa || '') + '</span></td><td>' + esc(a.acao) + '</td><td>' + br(a.dia) + '</td><td>' + br(a.prazo) + '</td><td class="' + x.s.cls + '">' + x.s.txt + '</td></tr>';
        }).join('') + '</tbody></table>' : '<p>Nenhum acordo deste colaborador no período.</p>') +
      '</section>';
  }

  function exportarPdf(botao) {
    var cal = S.dados && S.dados.calendario;
    if (!cal || !cal.dias.length) return;
    var de = cal.dias[0], ate = cal.dias[cal.dias.length - 1];
    var rotulo = botao.textContent;
    botao.disabled = true; botao.textContent = 'Gerando…';
    fetch('/api/indicadores/engenharia/acordos?de=' + de + '&ate=' + ate, { headers: { accept: 'application/json' } }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (b) { throw new Error(b.error || ('Erro ' + r.status)); });
      return r.json();
    }).then(function (d) {
      var quem = cal.colaboradores.filter(function (c) { return S.quem === 'todos' || c.chave === S.quem; });
      var box = document.getElementById('co-print');
      if (!box) { box = document.createElement('div'); box.id = 'co-print'; document.body.appendChild(box); }
      box.innerHTML = quem.map(function (c) { return paginaPdf(c, d.itens, cal, de, ate); }).join('');
      var titulo = document.title;
      document.title = 'Acordos-' + (S.quem === 'todos' ? 'Colaboradores' : quem[0].nome.replace(/\s+/g, '-')) + '-' + de + '_a_' + ate;
      document.body.classList.add('co-imprimindo');
      var fim = function () { document.body.classList.remove('co-imprimindo'); document.title = titulo; window.removeEventListener('afterprint', fim); };
      window.addEventListener('afterprint', fim);
      window.print();
    }).catch(function (e) { window.alert('Não foi possível gerar o PDF: ' + e.message); })
      .then(function () { botao.disabled = false; botao.textContent = rotulo; });
  }

  window.engColab = {
    mostrar: function () { css(); desenhar(); carregar(); },
    evolucao: function (el) {
      css();
      S.extra = el;
      pintarExtra();
      if (!S.dados || Date.now() - (S.carregadoEm || 0) > 60000) carregar();
    },
  };
})();
