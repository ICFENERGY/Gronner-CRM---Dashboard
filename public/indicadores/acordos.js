/*
 * Acordos do dia (aba "Acordos do dia" do grupo Engenharia).
 * Lê /api/indicadores/engenharia/acordos: cada ação combinada na Gestão diária fica registrada no dia em que foi feita.
 * A tela é o checklist da execução: marcar o item como feito conclui a ação (a mesma de "Marcar como feita" na Gestão
 * diária). "Exportar PDF" abre a impressão do navegador só com esta tela (escolher "Salvar como PDF").
 */
(function () {
  var BASE = '/api/indicadores/engenharia';
  var CHAVE_CODIGO = 'indicadores-metas-codigo';
  var DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var S = { dados: null, carregando: false, erro: null, de: null, ate: null, status: 'all', resp: 'all', salvando: {}, mes: null, meses: {}, buscandoMes: {} };
  var ORDEM_COLAB = ['eliardo', 'joao martins', 'priscilla'];
  var NOME_COLAB = { eliardo: 'Eliardo', 'joao martins': 'João Martins', priscilla: 'Priscilla' };
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var ROTULO = { aberta: 'Aberto', feita: 'Feito', saiu: 'Saiu da etapa', atualizado: 'Substituído' };

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hoje(delta) { var d = new Date(); d.setDate(d.getDate() + (delta || 0)); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
  function br(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—'; }
  function semana(iso) { return DIAS[new Date(iso + 'T12:00:00').getDay()]; }
  function lerLocal(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function gravarLocal(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } }
  function raiz() { return document.getElementById('eng-view-acordos'); }

  function css() {
    if (document.getElementById('acordos-css')) return;
    var st = document.createElement('style');
    st.id = 'acordos-css';
    st.textContent = [
      '.ac-dia { border: 1px solid var(--color-border-line); border-radius: 12px; background: var(--color-panel); overflow: hidden; margin-bottom: 14px; break-inside: auto; }',
      '.ac-dia-h { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; padding: 12px 16px; background: var(--color-bg); font-size: 15px; font-weight: 700; }',
      '.ac-dia-h small { font-size: 12px; font-weight: 600; color: var(--color-fg-muted); }',
      '.ac-resp { padding: 8px 16px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--color-fg-muted); border-top: 1px solid var(--color-border-line); display: flex; justify-content: space-between; gap: 10px; break-after: avoid; }',
      '.ac-item { display: grid; grid-template-columns: 26px 70px minmax(0,1fr) minmax(0,1.6fr) 150px; gap: 12px; align-items: start; padding: 10px 16px; border-top: 1px solid var(--color-border-line); font-size: 13px; break-inside: avoid; }',
      '.ac-item input[type=checkbox] { width: 18px; height: 18px; margin: 1px 0 0; cursor: pointer; accent-color: var(--eng-teal); }',
      '.ac-item input[type=checkbox]:disabled { cursor: default; }',
      '.ac-item.is-feita .ac-acao b { text-decoration: line-through; color: var(--color-fg-muted); }',
      '.ac-item.is-saiu, .ac-item.is-atualizado { opacity: .7; }',
      '.ac-cod { font-weight: 700; font-variant-numeric: tabular-nums; }',
      '.ac-nome { font-weight: 650; overflow-wrap: anywhere; }',
      '.ac-sub { font-size: 11.5px; color: var(--color-fg-muted); }',
      '.ac-venc { color: var(--eng-red); font-weight: 650; }',
      '.ac-dia { --ac-amarelo: #e6b422; }',
      '.ac-item { border-left: 4px solid transparent; }',
      '.ac-item.cor-verde { border-left-color: var(--eng-green); }',
      '.ac-item.cor-amarelo { border-left-color: var(--ac-amarelo); background: color-mix(in srgb, var(--ac-amarelo) 9%, transparent); }',
      '.ac-item.cor-vermelho { border-left-color: var(--eng-red); background: color-mix(in srgb, var(--eng-red) 10%, transparent); }',
      '.ac-sub.cor-amarelo { color: color-mix(in srgb, var(--ac-amarelo) 55%, var(--color-fg)); font-weight: 650; }',
      '.ac-sub.cor-verde { color: var(--eng-green); font-weight: 650; }',
      '.ac-sub.cor-vermelho { color: var(--eng-red); font-weight: 700; }',
      '.ac-tag.verde { background: color-mix(in srgb, var(--eng-green) 16%, transparent); color: var(--eng-green); }',
      '.ac-tag.amarelo { background: color-mix(in srgb, var(--ac-amarelo) 24%, transparent); color: color-mix(in srgb, var(--ac-amarelo) 55%, var(--color-fg)); }',
      '.ac-tag.vermelho { background: color-mix(in srgb, var(--eng-red) 18%, transparent); color: var(--eng-red); }',
      '.ac-leg { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; font-size: 12px; color: var(--color-fg-muted); margin: 0 0 12px; }',
      '.ac-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: -1px; }',
      '.ac-tag { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: color-mix(in srgb, var(--eng-gray) 20%, transparent); color: var(--color-fg-muted); }',
      '.ac-tag.aberta { background: color-mix(in srgb, var(--eng-orange) 18%, transparent); color: var(--eng-orange); }',
      '.ac-tag.feita { background: color-mix(in srgb, var(--eng-green) 16%, transparent); color: var(--eng-green); }',
      '.ac-print-head { display: none; }',
      '.ac-print-colab { display: none; }',
      '.ac-mes-colab { margin-top: 16px; }',
      '.ac-mes-colab h3 { font-size: 15px; margin: 0 0 6px; display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }',
      '.ac-mes-colab h3 small { font-size: 12px; font-weight: 600; color: var(--color-fg-muted); }',
      '.ac-mes-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }',
      '.ac-mes-sem { font-size: 11px; font-weight: 700; color: var(--color-fg-muted); text-align: center; padding: 2px 0; text-transform: uppercase; }',
      '.ac-mes-d { border: 1px solid var(--color-border-line); border-radius: 8px; padding: 6px 8px; min-height: 76px; background: var(--color-panel); font-size: 11.5px; }',
      '.ac-mes-d.vazio { border: 0; background: transparent; }',
      '.ac-mes-d.futuro { opacity: .45; }',
      '.ac-mes-d.hoje { box-shadow: inset 0 0 0 2px var(--eng-teal); }',
      '.ac-mes-d .dn { font-weight: 700; color: var(--color-fg-muted); }',
      '.ac-mes-d .ab { font-size: 20px; font-weight: 750; font-variant-numeric: tabular-nums; line-height: 1.1; }',
      '.ac-mes-d .ab small { font-size: 10.5px; font-weight: 600; color: var(--color-fg-muted); }',
      '.ac-mes-d .barra { display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin: 4px 0; background: color-mix(in srgb, var(--eng-gray) 18%, transparent); }',
      '.ac-mes-d .barra i { display: block; height: 100%; }',
      '.ac-mes-d .ct { display: flex; gap: 6px; font-variant-numeric: tabular-nums; font-weight: 700; }',
      '.ac-mes-d .ct .v { color: var(--eng-green); } .ac-mes-d .ct .a { color: color-mix(in srgb, var(--ac-amarelo, #e6b422) 55%, var(--color-fg)); } .ac-mes-d .ct .r { color: var(--eng-red); }',
      '.ac-mes-d .ex { color: var(--color-fg-muted); font-size: 10.5px; }',
      '.ac-mes-d .ex b { color: var(--eng-teal); }',
      '@media (max-width: 700px) { .ac-mes-d { min-height: 60px; padding: 4px; } .ac-mes-d .ab { font-size: 15px; } .ac-mes-d .ex { display: none; } }',
      '.ac-quick { display: flex; gap: 6px; flex-wrap: wrap; align-items: flex-end; }',
      '@media (max-width: 900px) { .ac-item { grid-template-columns: 26px minmax(0,1fr); } .ac-item > :nth-child(2) { grid-column: 2; } .ac-item > :nth-child(n+3) { grid-column: 2; } }',
      '@media print {',
      '  html, html[data-theme] { --color-fg: #111 !important; --color-bg: #fff !important; --color-panel: #fff !important; --color-fg-muted: #444 !important; --color-border-line: #bbb !important; background: #fff !important; }',
      '  body.ac-imprimindo { background: #fff !important; color: #111 !important; }',
      '  body.ac-imprimindo .eng-wrap > *:not(#eng-view-acordos) { display: none !important; }',
      '  body.ac-imprimindo #eng-view-acordos .ac-no-print { display: none !important; }',
      '  body.ac-imprimindo #eng-view-acordos .ac-print-head { display: block; margin: 0 0 12px; }',
      '  body.ac-imprimindo #eng-view-acordos .ac-print-head h1 { margin: 0 0 4px; font-size: 20px; }',
      '  body.ac-imprimindo #eng-view-acordos .ac-print-head p { margin: 0; font-size: 12px; color: #444; }',
      '  body.ac-imprimindo .ac-dia { border-color: #bbb; }',
      '  body.ac-imprimindo .ac-por-dia { display: none !important; }',
      '  body.ac-imprimindo .ac-print-colab { display: block; }',
      '  body.ac-imprimindo .ac-colab-pag { break-before: page; }',
      '  body.ac-imprimindo .ac-colab-pag:first-child { break-before: auto; }',
      '  body.ac-imprimindo .ac-colab-h { font-size: 17px; font-weight: 750; margin: 0 0 4px; }',
      '  body.ac-imprimindo .ac-colab-s { font-size: 12px; color: #444; margin: 0 0 10px; }',
      '  body.ac-imprimindo .ac-item input[type=checkbox] { accent-color: #111; }',
      '  body.ac-imprimindo .ac-ev { margin: 0 0 12px; break-inside: avoid; }',
      '  body.ac-imprimindo .ac-ev h4 { font-size: 13px; margin: 0 0 4px; }',
      '  body.ac-imprimindo .ac-ev .ac-ev-res { border-left: 4px solid #1b8a8f; background: #f1f6f6; padding: 6px 10px; margin: 0 0 6px; font-size: 12px; }',
      '  body.ac-imprimindo .ac-ev svg { display: block; width: 100%; height: auto; margin: 0 0 6px; }',
      '  body.ac-imprimindo .ac-ev table { width: 100%; border-collapse: collapse; font-size: 10px; font-variant-numeric: tabular-nums; }',
      '  body.ac-imprimindo .ac-ev th, body.ac-imprimindo .ac-ev td { border-bottom: 1px solid #ccc; padding: 3px 4px; text-align: center; }',
      '  body.ac-imprimindo .ac-ev th { background: #eee; font-size: 9.5px; }',
      '  body.ac-imprimindo .ac-ev td:first-child, body.ac-imprimindo .ac-ev th:first-child { text-align: left; white-space: nowrap; }',
      '  @page { margin: 12mm; }',
      '}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function filtrados() {
    return S.dados.itens.filter(function (i) {
      if (S.status === 'abertas' && i.status !== 'aberta') return false;
      if (S.status === 'feitas' && i.status !== 'feita') return false;
      if (S.resp !== 'all' && i.responsavel !== S.resp) return false;
      return true;
    });
  }

  function kpi(cor, rotulo, valor, sub) {
    return '<div class="eng-kpi eng-kpi--' + cor + '"><div class="eng-kpi-label">' + rotulo + '</div><div class="eng-kpi-value">' + valor + '</div><div class="eng-kpi-sub">' + sub + '</div></div>';
  }

  function periodoTexto() { return S.de === S.ate ? br(S.de) : br(S.de) + ' a ' + br(S.ate); }

  function cabecalho() {
    var r = S.dados.resumo;
    var resps = {};
    S.dados.itens.forEach(function (i) { resps[i.responsavel] = true; });
    var opResp = '<option value="all">Todos</option>' + Object.keys(resps).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); }).map(function (n) {
      return '<option value="' + esc(n) + '"' + (S.resp === n ? ' selected' : '') + '>' + esc(n) + '</option>';
    }).join('');
    var opSt = [['all', 'Todos'], ['abertas', 'Só abertos'], ['feitas', 'Só feitos']].map(function (s) {
      return '<option value="' + s[0] + '"' + (S.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
    }).join('');
    return '<section class="eng-kpi-row ac-no-print">' +
      kpi('gray', 'ACORDOS NO PERÍODO', r.total.toLocaleString('pt-BR'), periodoTexto()) +
      kpi('teal', 'FEITOS', r.feitas.toLocaleString('pt-BR'), 'marcados como feitos') +
      kpi('green', 'NO PRAZO', r.verdes.toLocaleString('pt-BR'), 'mais de 2 dias para o prazo') +
      kpi('orange', 'ATENÇÃO', r.amarelos.toLocaleString('pt-BR'), 'faltam 1 ou 2 dias') +
      kpi('red', 'VENCE HOJE OU VENCIDO', r.vermelhos.toLocaleString('pt-BR'), r.vencidas.toLocaleString('pt-BR') + ' já estouraram o prazo') +
      '</section>' +
      '<section class="eng-filterbar ac-no-print"><div class="eng-filters-row">' +
      '<label class="eng-field"><span>De</span><input id="ac-de" type="date" value="' + esc(S.de) + '" max="' + hoje(0) + '"></label>' +
      '<label class="eng-field"><span>Até</span><input id="ac-ate" type="date" value="' + esc(S.ate) + '" max="' + hoje(0) + '"></label>' +
      '<div class="ac-quick"><button class="eng-clear-btn" type="button" data-p="0">Hoje</button><button class="eng-clear-btn" type="button" data-p="1">Ontem</button><button class="eng-clear-btn" type="button" data-p="7">Últimos 7 dias</button></div>' +
      '<label class="eng-field"><span>Responsável</span><select id="ac-resp">' + opResp + '</select></label>' +
      '<label class="eng-field"><span>Situação</span><select id="ac-st">' + opSt + '</select></label>' +
      '<button id="ac-atualizar" class="eng-clear-btn" type="button">Atualizar</button>' +
      '<button id="ac-pdf" class="eng-clear-btn" type="button">Exportar PDF</button>' +
      '</div></section>';
  }

  function linha(i) {
    var k = i.dia + ':' + i.codigo + ':' + i.funil;
    var pode = i.status === 'aberta';
    var cor = i.cor || '';
    var prazoTxt = 'Prazo ' + br(i.prazo);
    if (cor === 'vermelho') prazoTxt += i.diasParaPrazo === 0 ? ' · vence hoje' : ' · vencido há ' + (-i.diasParaPrazo) + ' dia(s)';
    else if (cor === 'amarelo') prazoTxt += i.diasParaPrazo === 1 ? ' · falta 1 dia' : ' · faltam ' + i.diasParaPrazo + ' dias';
    else if (cor === 'verde') prazoTxt += ' · faltam ' + i.diasParaPrazo + ' dias';
    var rotulo = cor === 'vermelho' ? (i.diasParaPrazo === 0 ? 'Vence hoje' : 'Vencido') : cor === 'amarelo' ? 'Atenção' : cor === 'verde' ? 'No prazo' : ROTULO[i.status];
    return '<div class="ac-item is-' + i.status + (cor ? ' cor-' + cor : '') + '">' +
      '<input type="checkbox" data-c="' + i.codigo + '" data-f="' + esc(i.funil) + '"' + (i.status === 'feita' ? ' checked' : '') + (pode && !S.salvando[k] ? '' : ' disabled') + ' aria-label="Marcar o acordo do card ' + i.codigo + ' como feito">' +
      '<span class="ac-cod">#' + i.codigo + '</span>' +
      '<span><div class="ac-nome">' + esc(i.nome || '—') + '</div><div class="ac-sub">' + esc(i.funil) + (i.funilNome ? ' · ' + esc(i.funilNome) : '') + ' · ' + esc(i.etapa || '') + '</div></span>' +
      '<span class="ac-acao"><div><b>' + esc(i.acao) + '</b></div><div class="ac-sub' + (cor ? ' cor-' + cor : '') + '">' + prazoTxt + '</div></span>' +
      '<span><span class="ac-tag ' + (cor || i.status) + '">' + rotulo + '</span>' + (i.status === 'feita' && i.feitaEm ? '<div class="ac-sub">em ' + new Date(i.feitaEm).toLocaleString('pt-BR') + '</div>' : '') + '</span>' +
      '</div>';
  }

  function porDia(lista) {
    var dias = {};
    lista.forEach(function (i) { (dias[i.dia] = dias[i.dia] || []).push(i); });
    return Object.keys(dias).sort().reverse().map(function (dia) {
      var doDia = dias[dia];
      var feitas = doDia.filter(function (i) { return i.status === 'feita'; }).length;
      var resps = {};
      doDia.forEach(function (i) { (resps[i.responsavel] = resps[i.responsavel] || []).push(i); });
      var h = '<section class="ac-dia"><div class="ac-dia-h">' + semana(dia) + ', ' + br(dia) + '<small>' + doDia.length + ' acordo(s) · ' + feitas + ' feito(s)</small></div>';
      Object.keys(resps).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); }).forEach(function (nome) {
        var d = resps[nome], f = d.filter(function (i) { return i.status === 'feita'; }).length;
        h += '<div class="ac-resp"><span>' + esc(nome) + '</span><span>' + f + ' de ' + d.length + ' feito(s)</span></div>' + d.map(linha).join('');
      });
      return h + '</section>';
    }).join('');
  }

  function desenhar() {
    var el = raiz();
    if (!el) return;
    if (S.erro && !S.dados) { el.innerHTML = '<div class="eng-panel"><div class="ge-vazio">Não foi possível carregar os acordos: ' + esc(S.erro) + '</div></div>'; return; }
    if (!S.dados) { el.innerHTML = '<div class="eng-panel"><div class="ge-vazio">Carregando os acordos…</div></div>'; return; }
    var lista = filtrados();
    var agora = new Date().toLocaleString('pt-BR');
    el.innerHTML = cabecalho() +
      '<section class="eng-panel ac-no-print" id="ac-evolucao-box"><div id="ac-evolucao"></div></section>' +
      '<section class="eng-panel"><div class="ac-print-head"><h1>Acordos da Engenharia · ' + periodoTexto() + '</h1><p>' + lista.length + ' acordo(s)' + (S.resp !== 'all' ? ' · Responsável: ' + esc(S.resp) : '') + (S.status !== 'all' ? ' · ' + (S.status === 'abertas' ? 'só abertos' : 'só feitos') : '') + ' · gerado em ' + agora + '</p></div>' +
      '<div class="ac-leg"><span><i style="background:var(--eng-green)"></i>Verde: mais de 2 dias para o prazo</span><span><i style="background:#e6b422"></i>Amarelo: faltam 1 ou 2 dias</span><span><i style="background:var(--eng-red)"></i>Vermelho: vence hoje ou estourou</span></div>' +
      '<div class="eng-panel-head ac-no-print"><h2>Checklist de execução por dia do acordo</h2><span class="eng-panel-note">' + lista.length.toLocaleString('pt-BR') + ' acordo(s) · cada acordo aparece no dia em que foi feito</span></div>' +
      (lista.length ? '<div class="ac-por-dia">' + porDia(lista) + '</div><div class="ac-print-colab"></div>' : '<div class="ge-vazio">Nenhum acordo neste período.</div>') +
      '</section>' +
      '<section class="eng-panel ac-no-print" id="ac-mes"></section>';
    ligar(el);
    pintarMes();
    var ev = document.getElementById('ac-evolucao');
    if (ev && window.engColab) window.engColab.evolucao(ev);
  }

  function codigoEdicao(forcar) {
    var c = lerLocal(CHAVE_CODIGO);
    if (forcar || !c) { c = window.prompt('Código de edição do painel:') || ''; if (c) gravarLocal(CHAVE_CODIGO, c); }
    return c;
  }

  function enviar(caminho, metodo, tentativa) {
    var headers = { 'content-type': 'application/json' };
    var c = lerLocal(CHAVE_CODIGO);
    if (c) headers['X-Metas-Token'] = c;
    return fetch(BASE + caminho, { method: metodo, headers: headers }).then(function (r) {
      if (r.status === 401 && !tentativa) { if (codigoEdicao(true)) return enviar(caminho, metodo, true); }
      return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error(b.error || ('Erro ' + r.status)); return b; });
    });
  }

  // Evolução por dia de um colaborador no PDF: gráfico (no prazo / atenção / vencido em aberto no fim de cada dia),
  // a tabela dia a dia e uma frase comparando o primeiro e o último dia do período.
  var COR_EV = { verde: '#2e9e5b', amarelo: '#e6b422', vermelho: '#d64545' };
  function evolucaoPdf(col, cal) {
    if (!col || !cal || !cal.dias.length) return '';
    var p = col.porDia, n = p.length, ini = p[0], fim = p[n - 1];
    var soma = function (k) { return p.reduce(function (t, x) { return t + (x[k] || 0); }, 0); };
    var W = 720, H = 156, base = 120, topo = 10, larg = W / n;
    var max = Math.max(4, Math.max.apply(null, p.map(function (x) { return x.verde + x.amarelo + x.vermelho; })));
    var barras = p.map(function (x, i) {
      var y = base, bw = Math.max(4, Math.min(34, larg * 0.62)), cx = i * larg + larg / 2, s = '';
      ['verde', 'amarelo', 'vermelho'].forEach(function (k) {
        var h = (x[k] || 0) / max * (base - topo);
        if (h > 0) { y -= h; s += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, h - 1).toFixed(1) + '" fill="' + COR_EV[k] + '"/>'; }
      });
      var tot = x.verde + x.amarelo + x.vermelho;
      if (tot) s += '<text x="' + cx.toFixed(1) + '" y="' + (y - 3).toFixed(1) + '" font-size="10" font-weight="700" text-anchor="middle" fill="#111">' + tot + '</text>';
      if (n <= 16 || i % Math.ceil(n / 16) === 0 || i === n - 1) s += '<text x="' + cx.toFixed(1) + '" y="' + (base + 14) + '" font-size="9.5" text-anchor="middle" fill="#444">' + x.dia.slice(8, 10) + '/' + x.dia.slice(5, 7) + '</text>';
      return s;
    }).join('');
    var leg = [['verde', 'No prazo'], ['amarelo', 'Atenção'], ['vermelho', 'Vencido']].map(function (l, i) {
      return '<rect x="' + (i * 90) + '" y="' + (H - 9) + '" width="9" height="9" fill="' + COR_EV[l[0]] + '"/><text x="' + (i * 90 + 13) + '" y="' + (H - 1) + '" font-size="10" fill="#333">' + l[1] + '</text>';
    }).join('');
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Cards em aberto por dia"><line x1="0" x2="' + W + '" y1="' + base + '" y2="' + base + '" stroke="#999"/>' + barras + leg + '</svg>';
    var dif = function (a, b) { var d = b - a; return d === 0 ? 'igual' : (d > 0 ? '+' : '') + d; };
    var res = 'Do dia ' + br(ini.dia) + ' ao dia ' + br(fim.dia) + ': em aberto ' + ini.abertos + ' → ' + fim.abertos + ' (' + dif(ini.abertos, fim.abertos) + '), ' +
      'vencidos ' + ini.vermelho + ' → ' + fim.vermelho + ' (' + dif(ini.vermelho, fim.vermelho) + '). ' +
      soma('novos') + ' acordo(s) novo(s) e ' + soma('resolvidos') + ' resolvido(s) no período.';
    var linhas = [['Em aberto', 'abertos'], ['No prazo', 'verde'], ['Atenção', 'amarelo'], ['Vencido', 'vermelho'], ['Resolvidos no dia', 'resolvidos'], ['Acordos novos', 'novos']];
    var tab = '<table><thead><tr><th></th>' + p.map(function (x) { return '<th>' + x.dia.slice(8, 10) + '/' + x.dia.slice(5, 7) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      linhas.map(function (l) { return '<tr><td>' + l[0] + '</td>' + p.map(function (x) { return '<td>' + (x[l[1]] || 0) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    return '<div class="ac-ev"><h4>Evolução por dia</h4><div class="ac-ev-res">' + res + '</div>' + svg + (n <= 31 ? tab : '') + '</div>';
  }

  // PDF: tudo do Eliardo no período, depois João Martins, depois Priscilla (e por último outros responsáveis).
  function porColaborador(lista, cal) {
    var grupos = {};
    lista.forEach(function (i) { var k = i.colaborador || ('~' + i.responsavel); (grupos[k] = grupos[k] || []).push(i); });
    var colDe = function (k) { return cal ? cal.colaboradores.filter(function (c) { return c.chave === k; })[0] : null; };
    // Quem tem card em aberto no período aparece mesmo sem acordo novo nele (só quando não há filtro de responsável).
    if (cal && S.resp === 'all') cal.colaboradores.forEach(function (c) { if (!grupos[c.chave] && c.porDia.some(function (x) { return x.abertos; })) grupos[c.chave] = []; });
    var chaves = Object.keys(grupos).sort(function (a, b) {
      var ia = ORDEM_COLAB.indexOf(a), ib = ORDEM_COLAB.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'pt-BR');
    });
    return chaves.map(function (k) {
      var d = grupos[k].slice().sort(function (a, b) { return a.dia.localeCompare(b.dia) || a.codigo - b.codigo; });
      var conta = function (f) { return d.filter(f).length; };
      var nome = NOME_COLAB[k] || (colDe(k) || {}).nome || d[0].responsavel;
      var dias = {};
      d.forEach(function (i) { (dias[i.dia] = dias[i.dia] || []).push(i); });
      return '<section class="ac-colab-pag"><div class="ac-colab-h">' + esc(nome) + '</div>' +
        '<div class="ac-colab-s">' + periodoTexto() + ' · ' + d.length + ' acordo(s) · ' + conta(function (i) { return i.status === 'feita'; }) + ' feito(s) · ' +
        conta(function (i) { return i.status === 'saiu'; }) + ' saiu(ram) da etapa · em aberto: ' + conta(function (i) { return i.cor === 'verde'; }) + ' no prazo, ' +
        conta(function (i) { return i.cor === 'amarelo'; }) + ' atenção, ' + conta(function (i) { return i.cor === 'vermelho'; }) + ' vence hoje ou vencido</div>' +
        evolucaoPdf(colDe(k), cal) +
        (d.length ? '<div class="ac-dia">' + Object.keys(dias).sort().map(function (dia) {
          var x = dias[dia];
          return '<div class="ac-resp"><span>' + semana(dia) + ', ' + br(dia) + '</span><span>' + x.filter(function (i) { return i.status === 'feita'; }).length + ' de ' + x.length + ' feito(s)</span></div>' + x.map(linha).join('');
        }).join('') + '</div>' : '<div class="ac-colab-s">Nenhum acordo novo registrado neste período.</div>') + '</section>';
    }).join('');
  }

  // A evolução usa o período escolhido; se ele tiver menos de 7 dias, mostra os 7 dias que terminam na data final.
  function exportarPdf() {
    var botao = document.getElementById('ac-pdf');
    var seteAntes = new Date(Date.parse(S.ate + 'T12:00:00Z') - 6 * 864e5).toISOString().slice(0, 10);
    var de = S.de < seteAntes ? S.de : seteAntes;
    var rotulo = botao ? botao.textContent : '';
    if (botao) { botao.disabled = true; botao.textContent = 'Gerando…'; }
    fetch(BASE + '/colaboradores?de=' + de + '&ate=' + S.ate, { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (d) {
        if (botao) { botao.disabled = false; botao.textContent = rotulo; }
        imprimir(d && d.calendario);
      });
  }

  function imprimir(cal) {
    var box = raiz() && raiz().querySelector('.ac-print-colab');
    if (box) box.innerHTML = porColaborador(filtrados(), cal);
    var titulo = document.title;
    document.title = 'Acordos-Engenharia-' + S.de + (S.de === S.ate ? '' : '_a_' + S.ate);
    document.body.classList.add('ac-imprimindo');
    var fim = function () { document.body.classList.remove('ac-imprimindo'); document.title = titulo; window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    window.print();
  }

  // ─── Demonstrativo do mês: por colaborador, um calendário com os cards acumulados (em aberto) em cada dia ───
  function mesAtual() { return hoje(0).slice(0, 7); }

  function pintarMes() {
    var el = document.getElementById('ac-mes');
    if (!el) return;
    if (!S.mes) S.mes = mesAtual();
    var d = S.meses[S.mes];
    var op = [];
    for (var i = 0; i < 6; i++) {
      var dt = new Date(); dt.setDate(1); dt.setMonth(dt.getMonth() - i);
      var v = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
      op.push('<option value="' + v + '"' + (v === S.mes ? ' selected' : '') + '>' + MESES[dt.getMonth()] + ' de ' + dt.getFullYear() + '</option>');
    }
    var cab = '<div class="eng-panel-head"><h2>Demonstrativo do mês por colaborador</h2><span class="eng-panel-note">cards com acordo em aberto acumulados no fim de cada dia · resolvidos e acordos novos do dia</span>' +
      '<select id="ac-mes-sel" class="eng-field" aria-label="Mês">' + op.join('') + '</select></div>';
    if (!d) { el.innerHTML = cab + '<div class="ge-vazio">Carregando o mês…</div>'; ligarMes(el); carregarMes(S.mes); return; }
    if (d.erro) { el.innerHTML = cab + '<div class="ge-vazio">Não foi possível carregar o mês: ' + esc(d.erro) + '</div>'; ligarMes(el); return; }
    var cal = d.calendario, ano = Number(S.mes.slice(0, 4)), m = Number(S.mes.slice(5, 7));
    var nDias = new Date(Date.UTC(ano, m, 0)).getUTCDate();
    var primeiro = new Date(Date.UTC(ano, m - 1, 1)).getUTCDay();
    var sem = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    var blocos = cal.colaboradores.map(function (c) {
      var porDia = {};
      c.porDia.forEach(function (x) { porDia[x.dia] = x; });
      var tot = c.porDia.reduce(function (t, x) { t.novos += x.novos; t.resolvidos += x.resolvidos; return t; }, { novos: 0, resolvidos: 0 });
      var ult = c.porDia[c.porDia.length - 1];
      var celulas = '';
      for (var b = 0; b < primeiro; b++) celulas += '<div class="ac-mes-d vazio"></div>';
      for (var dia = 1; dia <= nDias; dia++) {
        var iso = S.mes + '-' + String(dia).padStart(2, '0'), x = porDia[iso];
        if (!x) { celulas += '<div class="ac-mes-d futuro"><span class="dn">' + dia + '</span></div>'; continue; }
        var t = x.abertos || 0, pct = function (n) { return t ? (n / t * 100) + '%' : '0'; };
        celulas += '<div class="ac-mes-d' + (iso === d.hoje ? ' hoje' : '') + '" title="' + esc(c.nome) + ' · ' + br(iso) + ': ' + t + ' em aberto (' + x.verde + ' no prazo, ' + x.amarelo + ' atenção, ' + x.vermelho + ' vencido) · ' + x.resolvidos + ' resolvido(s) · ' + x.novos + ' acordo(s) novo(s)">' +
          '<span class="dn">' + dia + '</span>' +
          '<div class="ab">' + t + ' <small>em aberto</small></div>' +
          '<div class="barra"><i style="width:' + pct(x.verde) + ';background:var(--eng-green)"></i><i style="width:' + pct(x.amarelo) + ';background:#e6b422"></i><i style="width:' + pct(x.vermelho) + ';background:var(--eng-red)"></i></div>' +
          '<div class="ct"><span class="v">' + x.verde + '</span><span class="a">' + x.amarelo + '</span><span class="r">' + x.vermelho + '</span></div>' +
          '<div class="ex">' + (x.resolvidos ? '<b>✓ ' + x.resolvidos + '</b> ' : '') + (x.novos ? '+' + x.novos + ' acordo(s)' : '') + '</div></div>';
      }
      return '<div class="ac-mes-colab"><h3>' + esc(c.nome) + '<small>' + tot.novos + ' acordo(s) no mês · ' + tot.resolvidos + ' resolvido(s) · ' + (ult ? ult.abertos + ' em aberto em ' + br(ult.dia) + ' (' + ult.verde + ' no prazo, ' + ult.amarelo + ' atenção, ' + ult.vermelho + ' vencido)' : '') + '</small></h3>' +
        '<div class="ac-mes-grid">' + sem.map(function (n) { return '<div class="ac-mes-sem">' + n + '</div>'; }).join('') + celulas + '</div></div>';
    }).join('');
    el.innerHTML = cab + '<div class="ac-leg"><span><i style="background:var(--eng-green)"></i>No prazo</span><span><i style="background:#e6b422"></i>Atenção</span><span><i style="background:var(--eng-red)"></i>Vence hoje ou vencido</span><span>✓ resolvidos no dia · +acordos novos no dia</span></div>' + blocos;
    ligarMes(el);
  }

  function ligarMes(el) {
    var sel = el.querySelector('#ac-mes-sel');
    if (sel) sel.onchange = function () { S.mes = sel.value; pintarMes(); };
  }

  function carregarMes(mes) {
    if ((S.meses[mes] && !S.meses[mes].erro) || S.buscandoMes[mes]) return;
    S.buscandoMes[mes] = true;
    fetch(BASE + '/colaboradores?mes=' + encodeURIComponent(mes), { headers: { accept: 'application/json' } }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (b) { throw new Error(b.error || ('Erro ' + r.status)); });
      return r.json();
    }).then(function (d) { S.meses[mes] = d; }, function (e) { S.meses[mes] = { erro: e.message }; })
      .then(function () { S.buscandoMes[mes] = false; if (S.mes === mes) pintarMes(); });
  }

  function periodo(de, ate) { S.de = de; S.ate = ate; carregar(); }

  function ligar(el) {
    var q = function (id) { return document.getElementById(id); };
    q('ac-de').onchange = function () { if (this.value) periodo(this.value, this.value > S.ate ? this.value : S.ate); };
    q('ac-ate').onchange = function () { if (this.value) periodo(this.value < S.de ? this.value : S.de, this.value); };
    el.querySelectorAll('[data-p]').forEach(function (b) {
      b.onclick = function () { var n = Number(b.dataset.p); if (n === 7) periodo(hoje(-6), hoje(0)); else periodo(hoje(-n), hoje(-n)); };
    });
    q('ac-resp').onchange = function () { S.resp = this.value; desenhar(); };
    q('ac-st').onchange = function () { S.status = this.value; desenhar(); };
    q('ac-atualizar').onclick = function () { S.meses = {}; carregar(); };
    q('ac-pdf').onclick = exportarPdf;
    el.querySelectorAll('.ac-item input[type=checkbox]').forEach(function (c) {
      c.onchange = function () {
        if (!c.checked) return;
        var k = c.closest('.ac-item');
        if (!window.confirm('Marcar este acordo como feito? A ação também é concluída na Gestão diária.')) { c.checked = false; return; }
        c.disabled = true;
        enviar('/acoes/' + c.dataset.c + '/' + c.dataset.f + '/concluir', 'POST')
          .then(function () { return carregar(); })
          .catch(function (err) { c.checked = false; c.disabled = false; window.alert('Não foi possível concluir: ' + err.message); });
      };
    });
  }

  function carregar() {
    if (S.carregando) return Promise.resolve();
    S.carregando = true;
    var url = BASE + '/acordos?de=' + encodeURIComponent(S.de) + '&ate=' + encodeURIComponent(S.ate);
    return fetch(url, { headers: { accept: 'application/json' } }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (b) { throw new Error(b.error || ('Erro ' + r.status)); });
      return r.json();
    }).then(function (d) { S.dados = d; S.erro = null; }, function (e) { S.erro = e.message; })
      .then(function () { S.carregando = false; desenhar(); });
  }

  window.engAcordos = {
    mostrar: function () {
      css();
      if (!S.de) { S.de = hoje(0); S.ate = hoje(0); }
      desenhar(); carregar();
    },
  };
})();
