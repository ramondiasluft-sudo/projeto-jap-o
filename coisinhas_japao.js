/**
 * ════════════════════════════════════════════════════════════════
 *  COISINHAS DO JAPÃO — Script Principal
 * ════════════════════════════════════════════════════════════════
 *
 *  ESTRUTURA: UMA ABA ÚNICA "🛍️ Pedidos do Site"
 *
 *  A  Carimbo de data/h    (form, automático)
 *  B  Produto / Variação   (form)
 *  C  Nome completo        (form)
 *  D  WhatsApp             (form, formatado automático)
 *  E  Quantidade           (form)
 *  F  Observações          ← campo livre (notas do pedido, pagamento, entrega…)
 *  G  Valor Unit (R$)      ← calculado do nome do produto
 *  H  Total (R$)           ← G × E, calculado
 *  I  💵 Pago (R$)         ← você preenche ao receber pagamento
 *  J  📍 Pendente (R$)     ← H − I, automático
 *  K  Forma de Pagamento   ← dropdown: Pix / Cartão / Dinheiro / Outro
 *  L  ✅ Status            ← automático via Pago, pode ser sobrescrito
 *
 *  FUNÇÕES PARA EXECUTAR:
 *  1. migrarParaAbaUnificada()    — UMA VEZ, faz a migração preservando dados manuais
 *  2. configurarTudo()            — UMA VEZ após migrar, ativa os gatilhos
 *
 *  FUNÇÕES DE USO RECORRENTE:
 *  - recalcularTodos()            — força recálculo de toda a aba (use se algo ficar fora de sincronia)
 *  - reconciliarEstoque()         — audita e corrige estoque do Catálogo com base nos pedidos ativos
 *  - resumo()                     — imprime totais no log (Execuções → ver logs)
 * ════════════════════════════════════════════════════════════════
 */

// ── Configurações ──────────────────────────────────────────────
var ID_PLANILHA  = "1fv0bJ4lWQpjCUbX-_Lzx3u7NDKU1DdbvjSkppc4QDZk";
var ABA_PEDIDOS  = "🛍️ Pedidos do Site";
var MAX_POR_ITEM = 5; // máximo de unidades do mesmo produto por cliente

// Índices das colunas (1-indexed para getRange, use −1 para arrays)
var C = {
  DATA: 1, PRODUTO: 2, NOME: 3, WPP: 4, QTD: 5, OBS: 6,
  VU: 7, TOTAL: 8, PAGO: 9, PEND: 10, FORMA: 11, STATUS: 12
};
var N_COLS = 12;

// ════════════════════════════════════════════════════════════════
//  CONFIGURAÇÃO — execute UMA VEZ após migrar
// ════════════════════════════════════════════════════════════════
function configurarTudo() {
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("aoEditar").forSpreadsheet(ID_PLANILHA).onEdit().create();
  ScriptApp.newTrigger("calcularAbas").timeBased().everyMinutes(1).create();
  Logger.log("✅ Gatilhos ativos: aoEditar + calcularAbas (1 min)");
}

// ════════════════════════════════════════════════════════════════
//  AO EDITAR — gatilho automático (não execute manualmente)
// ════════════════════════════════════════════════════════════════
function aoEditar(e) {
  try {
    var sheet = e.range.getSheet();
    if (sheet.getName().trim() !== ABA_PEDIDOS) return;

    var col = e.range.getColumn();
    var row = e.range.getRow();
    if (row < 2) return;

    if (col === C.PAGO) {
      // Pago alterado → recalcula Pendente e Status
      _recalcularPagamento(sheet, row);
      return;
    }

    if (col === C.STATUS) {
      // Status alterado manualmente → só colore
      _colorir(sheet.getRange(row, C.STATUS), e.range.getValue().toString());
      // Se mudou para Cancelado/de Cancelado → ajustar estoque
      var anterior = (e.oldValue || "").toString();
      var novo     = e.range.getValue().toString();
      var eraCancelado = anterior.indexOf("Cancelado") > -1;
      var ehCancelado  = novo.indexOf("Cancelado") > -1;
      if (eraCancelado !== ehCancelado) {
        var prod = sheet.getRange(row, C.PRODUTO).getValue().toString();
        var qtd  = parseInt(sheet.getRange(row, C.QTD).getValue()) || 1;
        _ajustarEstoque(SpreadsheetApp.openById(ID_PLANILHA),
                        _nomeSemPreco(prod), ehCancelado ? qtd : -qtd);
      }
      return;
    }

    if (col === C.QTD || col === C.PRODUTO) {
      // Quantidade ou produto mudou → recalcula Total e pagamento
      _recalcularTotal(sheet, row);
      return;
    }

  } catch(err) {
    Logger.log("Erro aoEditar: " + err.message);
  }
}

// ════════════════════════════════════════════════════════════════
//  CALCULAR ABAS — roda a cada 1 min
//  Atualiza Valor Unit, Total e WhatsApp formatado em Pedidos do Site
// ════════════════════════════════════════════════════════════════
function calcularAbas() {
  var ss  = SpreadsheetApp.openById(ID_PLANILHA);
  var aba = ss.getSheetByName(ABA_PEDIDOS);
  if (!aba || aba.getLastRow() < 2) return;

  var dados = aba.getDataRange().getValues();
  var n     = dados.length - 1;
  var vus = [], tots = [], wpps = [];

  for (var i = 1; i < dados.length; i++) {
    var prod = dados[i][C.PRODUTO - 1].toString().trim();
    var m    = prod.match(/R\$\s*([\d.]+,\d{2})/);
    var vu   = m ? _num(m[1].replace(/\./g, "").replace(",", ".")) : _num(dados[i][C.VU - 1]);
    var qtd  = parseInt(dados[i][C.QTD - 1]) || 1;
    vus.push([vu]);
    tots.push([vu * qtd]);
    wpps.push([_fmtWpp(dados[i][C.WPP - 1].toString().trim())]);
  }

  aba.getRange(2, C.VU,    n, 1).setValues(vus).setNumberFormat("R$ #,##0.00");
  aba.getRange(2, C.TOTAL, n, 1).setValues(tots).setNumberFormat("R$ #,##0.00").setFontWeight("bold");
  aba.getRange(2, C.WPP,   n, 1).setValues(wpps);
}

// ════════════════════════════════════════════════════════════════
//  MIGRAR PARA ABA UNIFICADA — execute UMA VEZ
//  Cruza Pedidos do Site com Pagamentos, preserva todos os dados
//  manuais (Pago, Forma, Status, Observação) e faz backup de Pagamentos.
// ════════════════════════════════════════════════════════════════
function migrarParaAbaUnificada() {
  var ss     = SpreadsheetApp.openById(ID_PLANILHA);
  var abaPed = ss.getSheetByName(ABA_PEDIDOS);
  var abaPag = ss.getSheetByName("Pagamentos");

  if (!abaPed) { Logger.log("❌ Aba 'Pedidos do Site' não encontrada."); return; }

  // ── 1. Ler Pagamentos e montar mapa por chave ─────────────────
  var mapaPag = {}; // chave → {pago, forma, status, obs}
  if (abaPag && abaPag.getLastRow() >= 2) {
    var dp   = abaPag.getDataRange().getValues();
    var cabP = dp[0];
    var iWpp = _col(cabP, ["whatsapp", "wpp"]);
    var iItm = _col(cabP, ["item"]);
    var iPag = _col(cabP, ["pago", "💵"]);
    var iFrm = _col(cabP, ["forma"]);
    var iStt = _col(cabP, ["status"]);
    var iObs = _col(cabP, ["observa"]);

    for (var i = 1; i < dp.length; i++) {
      var wpp  = iWpp > -1 ? dp[i][iWpp].toString() : "";
      var item = iItm > -1 ? dp[i][iItm].toString() : "";
      if (!item) continue;
      var ch = _chave(wpp, item);
      var pago  = iPag > -1 ? _num(dp[i][iPag]) : 0;
      var forma = iFrm > -1 ? dp[i][iFrm].toString().trim() : "";
      var stt   = iStt > -1 ? dp[i][iStt].toString().trim() : "";
      var obs   = iObs > -1 ? dp[i][iObs].toString().trim() : "";
      if (mapaPag[ch]) {
        mapaPag[ch].pago += pago;
        if (forma && !mapaPag[ch].forma) mapaPag[ch].forma = forma;
        if (obs   && !mapaPag[ch].obs)   mapaPag[ch].obs   = obs;
      } else {
        mapaPag[ch] = { pago: pago, forma: forma, status: stt, obs: obs };
      }
    }
    Logger.log("Pagamentos mapeados: " + Object.keys(mapaPag).length + " entradas");
  }

  // ── 2. Processar Pedidos do Site ──────────────────────────────
  var ded   = abaPed.getDataRange().getValues();
  var cabD  = ded[0];
  var iProd = _col(cabD, ["produto", "varia"]);
  var iNome = _col(cabD, ["nome"]);
  var iWppD = _col(cabD, ["whatsapp", "wpp"]);
  var iQtd  = _col(cabD, ["quantid"]);
  var iObsF = _col(cabD, ["observa"]);
  var iVU   = _col(cabD, ["valor unit"]);
  var iTot  = _col(cabD, ["total"]);
  var iSttD = _col(cabD, ["status"]);
  var iData = _col(cabD, ["carimbo", "data", "timestamp"]);

  // ── 3. Montar linhas novas ─────────────────────────────────────
  var linhas = [[
    "Carimbo de data/h", "Produto / Variação", "Nome completo",
    "WhatsApp", "Quantidade", "Observações",
    "Valor Unit (R$)", "Total (R$)",
    "💵 Pago (R$)", "📍 Pendente (R$)", "Forma de Pagamento",
    "✅ Status"
  ]];

  var cruzados = 0, semCruz = 0;
  for (var r = 1; r < ded.length; r++) {
    var row  = ded[r];
    var prod = iProd > -1 ? row[iProd].toString().trim() : "";
    if (!prod) continue;

    var data = iData > -1 ? row[iData] : "";
    var nome = iNome > -1 ? row[iNome].toString().trim() : "";
    var wpp  = iWppD > -1 ? row[iWppD].toString().trim() : "";
    var qtd  = iQtd  > -1 ? (parseInt(row[iQtd]) || 1) : 1;
    var obsF = iObsF > -1 ? row[iObsF].toString().trim() : "";
    var m    = prod.match(/R\$\s*([\d.]+,\d{2})/);
    var vu   = m ? _num(m[1].replace(/\./g,"").replace(",",".")) : (iVU > -1 ? _num(row[iVU]) : 0);
    var total= iTot > -1 ? _num(row[iTot]) : vu * qtd;
    if (!total) total = vu * qtd;

    var prodSP = _nomeSemPreco(prod);
    var pg     = mapaPag[_chave(wpp, prodSP)] || null;
    var pago   = pg ? pg.pago  : 0;
    var forma  = pg ? pg.forma : "";
    var obsP   = pg ? pg.obs   : "";
    // Mescla obs do formulário + obs manual de Pagamentos em campo único
    var obs    = [obsF, obsP].filter(function(o){ return o !== ""; }).join(" | ");
    var stPag  = pg ? pg.status : "";
    var stPed  = iSttD > -1 ? row[iSttD].toString().trim() : "";

    // Prioridade de status: manual de Pagamentos > Pedidos do Site > calculado
    var status;
    if      (stPag && stPag !== "")                      status = _normStatus(stPag);
    else if (stPed && stPed !== "" && stPed !== "0")     status = _normStatus(stPed);
    else if (pago >= total - 0.01 && total > 0)          status = "✅ Pago";
    else if (pago > 0.01)                                status = "⚠️ Pago Parcial";
    else                                                  status = "🟡 Pendente";

    if (pg) cruzados++; else semCruz++;

    linhas.push([
      data, prod, nome, _fmtWpp(wpp), qtd, obs,
      vu, total, pago, Math.max(total - pago, 0), forma, status
    ]);
  }

  Logger.log("Pedidos: " + (linhas.length - 1) +
             " | Cruzados com Pagamentos: " + cruzados +
             " | Sem cruzamento: " + semCruz);

  // ── 4. Backup de Pagamentos (renomeia, não apaga) ─────────────
  if (abaPag) {
    var bkp = "Pagamentos_bkp_" +
      Utilities.formatDate(new Date(), "America/Sao_Paulo", "ddMMyy_HHmm");
    abaPag.setName(bkp);
    Logger.log("📦 Backup criado: '" + bkp + "' — pode apagar após conferir");
  }

  // ── 5. Reescrever aba ─────────────────────────────────────────
  abaPed.clearContents();
  abaPed.clearFormats();
  abaPed.getRange(1, 1, Math.max(abaPed.getMaxRows(), linhas.length), N_COLS)
        .clearDataValidations();

  abaPed.getRange(1, 1, linhas.length, N_COLS).setValues(linhas);
  _formatarAba(abaPed, linhas.length);

  Logger.log("✅ Migração concluída! Execute configurarTudo() para ativar os gatilhos.");
}

// ════════════════════════════════════════════════════════════════
//  RECALCULAR TODOS — força recálculo de Pendente + Status em toda a aba
//  Use se algo ficar fora de sincronia
// ════════════════════════════════════════════════════════════════
function recalcularTodos() {
  var ss  = SpreadsheetApp.openById(ID_PLANILHA);
  var aba = ss.getSheetByName(ABA_PEDIDOS);
  if (!aba || aba.getLastRow() < 2) return;

  var n     = aba.getLastRow() - 1;
  var dados = aba.getRange(2, 1, n, N_COLS).getValues();
  var pends = [], stats = [];

  for (var i = 0; i < dados.length; i++) {
    var total = _num(dados[i][C.TOTAL - 1]);
    var pago  = _num(dados[i][C.PAGO  - 1]);
    var st    = dados[i][C.STATUS - 1].toString().trim();
    var pend  = Math.max(total - pago, 0);

    // Não sobrescreve Cancelado/Enviado que o usuário colocou
    if (st.indexOf("Cancelado") === -1 && st.indexOf("Enviado") === -1) {
      if      (pago >= total - 0.01 && total > 0) st = "✅ Pago";
      else if (pago > 0.01)                        st = "⚠️ Pago Parcial";
      else                                         st = "🟡 Pendente";
    }

    pends.push([pend]);
    stats.push([st]);
  }

  aba.getRange(2, C.PEND,   n, 1).setValues(pends).setNumberFormat("R$ #,##0.00");
  aba.getRange(2, C.STATUS, n, 1).setValues(stats);

  for (var i = 0; i < stats.length; i++) {
    _colorir(aba.getRange(i + 2, C.STATUS), stats[i][0]);
  }

  Logger.log("✅ recalcularTodos: " + n + " linhas atualizadas.");
}

// ════════════════════════════════════════════════════════════════
//  RECONCILIAR ESTOQUE — audita Catálogo com base nos pedidos ativos
//  Use quando o estoque parecer incorreto
// ════════════════════════════════════════════════════════════════
function reconciliarEstoque() {
  var ss     = SpreadsheetApp.openById(ID_PLANILHA);
  var abaCat = ss.getSheetByName("Catálogo");
  var abaPed = ss.getSheetByName(ABA_PEDIDOS);
  if (!abaCat || !abaPed) { Logger.log("❌ Aba Catálogo ou Pedidos não encontrada."); return; }

  var dadosCat = abaCat.getDataRange().getValues();
  var cabCat   = dadosCat[0];
  var iNomeC   = _col(cabCat, ["nome completo", "nome"]);
  var iEstC    = _col(cabCat, ["estoque"]);
  if (iNomeC < 0 || iEstC < 0) { Logger.log("❌ Catálogo sem coluna 'Nome Completo' ou 'Estoque'."); return; }

  var dadosPed = abaPed.getDataRange().getValues();
  var cabPed   = dadosPed[0];
  var iProdP   = _col(cabPed, ["produto", "varia"]);
  var iQtdP    = _col(cabPed, ["quantid"]);
  var iSttP    = _col(cabPed, ["status"]);

  // Contar quantidades pedidas (não canceladas) por nome de produto
  var pedidos = {};
  for (var i = 1; i < dadosPed.length; i++) {
    var prod = iProdP > -1 ? dadosPed[i][iProdP].toString().trim() : "";
    if (!prod) continue;
    var st = iSttP > -1 ? dadosPed[i][iSttP].toString() : "";
    if (st.indexOf("Cancelado") > -1) continue;
    var qtd  = iQtdP > -1 ? (parseInt(dadosPed[i][iQtdP]) || 1) : 1;
    var nome = _nomeSemPreco(prod);
    pedidos[nome] = (pedidos[nome] || 0) + qtd;
  }

  var ajustes = [];
  for (var r = 1; r < dadosCat.length; r++) {
    var nc       = dadosCat[r][iNomeC].toString().trim();
    var vendido  = pedidos[nc] || 0;
    if (!vendido) continue;
    var atual = Number(dadosCat[r][iEstC]) || 0;
    var novo  = Math.max(atual - vendido, 0);
    if (novo !== atual) {
      abaCat.getRange(r + 1, iEstC + 1).setValue(novo);
      ajustes.push(nc + ": " + atual + " → " + novo + " (pedidos: " + vendido + ")");
    }
  }

  Logger.log("✅ Reconciliação: " + ajustes.length + " produto(s) ajustado(s)");
  ajustes.forEach(function(a) { Logger.log("  " + a); });
  if (!ajustes.length) Logger.log("(nada a ajustar)");
}

// ════════════════════════════════════════════════════════════════
//  RESUMO — imprime totais no log (Execuções → ver logs)
// ════════════════════════════════════════════════════════════════
function resumo() {
  var ss  = SpreadsheetApp.openById(ID_PLANILHA);
  var aba = ss.getSheetByName(ABA_PEDIDOS);
  if (!aba || aba.getLastRow() < 2) { Logger.log("Aba vazia."); return; }

  var dados = aba.getRange(2, 1, aba.getLastRow() - 1, N_COLS).getValues();
  var total = 0, pago = 0, nPago = 0, nParc = 0, nPend = 0, nCanc = 0;

  dados.forEach(function(r) {
    var t  = _num(r[C.TOTAL - 1]);
    var p  = _num(r[C.PAGO  - 1]);
    var st = r[C.STATUS - 1].toString();
    total += t;
    pago  += p;
    if      (st.indexOf("Cancelado") > -1)               nCanc++;
    else if (st.indexOf("Parcial")   > -1)               nParc++;
    else if (st.indexOf("✅") > -1 || st.indexOf("Pago") > -1) nPago++;
    else                                                  nPend++;
  });

  Logger.log("══════ RESUMO COISINHAS DO JAPÃO ══════");
  Logger.log("Pedidos ativos : " + (dados.length - nCanc));
  Logger.log("A receber      : R$ " + total.toFixed(2));
  Logger.log("Recebido       : R$ " + pago.toFixed(2));
  Logger.log("Pendente       : R$ " + (total - pago).toFixed(2));
  Logger.log("✅ Pagos       : " + nPago);
  Logger.log("⚠️ Parciais    : " + nParc);
  Logger.log("🟡 Pendentes   : " + nPend);
  Logger.log("❌ Cancelados  : " + nCanc);
}

// ════════════════════════════════════════════════════════════════
//  HELPERS INTERNOS
// ════════════════════════════════════════════════════════════════

// Recalcula Pendente e Status após mudança no Pago
function _recalcularPagamento(aba, row) {
  var vals  = aba.getRange(row, 1, 1, N_COLS).getValues()[0];
  var total = _num(vals[C.TOTAL - 1]);
  var pago  = _num(vals[C.PAGO  - 1]);
  var pend  = Math.max(total - pago, 0);
  var st    = vals[C.STATUS - 1].toString();

  // Só recalcula se não estava Cancelado/Enviado
  if (st.indexOf("Cancelado") === -1 && st.indexOf("Enviado") === -1) {
    if      (pago >= total - 0.01 && total > 0) st = "✅ Pago";
    else if (pago > 0.01)                        st = "⚠️ Pago Parcial";
    else                                         st = "🟡 Pendente";
  }

  aba.getRange(row, C.PEND).setValue(pend).setNumberFormat("R$ #,##0.00");
  var cellSt = aba.getRange(row, C.STATUS);
  cellSt.setValue(st);
  _colorir(cellSt, st);
}

// Recalcula VU e Total quando Produto ou Qtd muda
function _recalcularTotal(aba, row) {
  var vals = aba.getRange(row, 1, 1, N_COLS).getValues()[0];
  var prod = vals[C.PRODUTO - 1].toString();
  var m    = prod.match(/R\$\s*([\d.]+,\d{2})/);
  var vu   = m ? _num(m[1].replace(/\./g,"").replace(",",".")) : _num(vals[C.VU - 1]);
  var qtd  = parseInt(vals[C.QTD - 1]) || 1;
  aba.getRange(row, C.VU).setValue(vu).setNumberFormat("R$ #,##0.00");
  aba.getRange(row, C.TOTAL).setValue(vu * qtd).setNumberFormat("R$ #,##0.00");
  _recalcularPagamento(aba, row);
}

// Aplica cor na célula de status
function _colorir(cell, val) {
  if      (val.indexOf("Parcial")   > -1) cell.setBackground("#FFF3CD").setFontColor("#8A6D00").setFontWeight("bold");
  else if (val.indexOf("Pago")      > -1) cell.setBackground("#C8E6C9").setFontColor("#1B5E20").setFontWeight("bold");
  else if (val.indexOf("Cancelado") > -1) cell.setBackground("#FFCDD2").setFontColor("#B71C1C").setFontWeight("bold");
  else if (val.indexOf("Enviado")   > -1) cell.setBackground("#BBDEFB").setFontColor("#0D47A1").setFontWeight("bold");
  else                                    cell.setBackground("#FFF9C4").setFontColor("#8A6D00").setFontWeight("bold");
}

// Ajusta estoque no Catálogo. delta > 0 = devolve, delta < 0 = retira.
function _ajustarEstoque(ss, nomeProduto, delta) {
  if (!delta) return;
  var aba = ss.getSheetByName("Catálogo");
  if (!aba || aba.getLastRow() < 2) return;
  var dados = aba.getDataRange().getValues();
  var iNome = _col(dados[0], ["nome completo", "nome"]);
  var iEst  = _col(dados[0], ["estoque"]);
  if (iNome < 0 || iEst < 0) return;
  var alvo = nomeProduto.trim();
  for (var r = 1; r < dados.length; r++) {
    if (dados[r][iNome].toString().trim() === alvo) {
      aba.getRange(r + 1, iEst + 1).setValue(Math.max((Number(dados[r][iEst]) || 0) + delta, 0));
      return;
    }
  }
  Logger.log("⚠️ Produto não encontrado no Catálogo: " + alvo);
}

// Retorna estoque de um produto (ou null se não encontrado)
function _estoque(ss, nomeProduto) {
  var aba = ss.getSheetByName("Catálogo");
  if (!aba || aba.getLastRow() < 2) return null;
  var dados = aba.getDataRange().getValues();
  var iNome = _col(dados[0], ["nome completo", "nome"]);
  var iEst  = _col(dados[0], ["estoque"]);
  if (iNome < 0 || iEst < 0) return null;
  for (var r = 1; r < dados.length; r++) {
    if (dados[r][iNome].toString().trim() === nomeProduto.trim())
      return Number(dados[r][iEst]) || 0;
  }
  return null;
}

// Retorna max unidades que cliente pode pedir com base no estoque
function _limiteCliente(estoque) {
  if (estoque === null)           return MAX_POR_ITEM;
  if (estoque >= MAX_POR_ITEM)    return MAX_POR_ITEM;
  if (estoque > 0)                return 1;
  return 0;
}

// Formata e aplica cabeçalho, dropdowns, larguras e zebra na aba
function _formatarAba(aba, nLinhas) {
  var n = nLinhas - 1;
  if (n < 1) return;

  aba.getRange(1, 1, 1, N_COLS)
     .setBackground("#1A1410").setFontColor("#C9A84C")
     .setFontWeight("bold").setFontSize(11);

  aba.getRange(2, C.VU,    n, 1).setNumberFormat("R$ #,##0.00");
  aba.getRange(2, C.TOTAL, n, 1).setNumberFormat("R$ #,##0.00").setFontWeight("bold");
  aba.getRange(2, C.PAGO,  n, 1).setNumberFormat("R$ #,##0.00");
  aba.getRange(2, C.PEND,  n, 1).setNumberFormat("R$ #,##0.00");

  aba.getRange(2, C.STATUS, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(["🟡 Pendente","✅ Pago","⚠️ Pago Parcial","❌ Cancelado","📦 Enviado"], true)
      .setAllowInvalid(false).build()
  );

  aba.getRange(2, C.FORMA, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(["","Pix","Cartão","Dinheiro","Outro"], true)
      .setAllowInvalid(true).build()
  );

  // Zebra
  var bg = [];
  for (var i = 0; i < n; i++) {
    var cor = i % 2 === 0 ? "#FFFFFF" : "#F5EFE6";
    bg.push(Array(N_COLS).fill(cor));
  }
  aba.getRange(2, 1, n, N_COLS).setBackgrounds(bg);

  // Colorir status linha a linha
  var sts = aba.getRange(2, C.STATUS, n, 1).getValues();
  for (var i = 0; i < sts.length; i++) {
    _colorir(aba.getRange(i + 2, C.STATUS), sts[i][0].toString());
  }

  aba.setColumnWidth(C.DATA,    140);
  aba.setColumnWidth(C.PRODUTO, 350);
  aba.setColumnWidth(C.NOME,    180);
  aba.setColumnWidth(C.WPP,     130);
  aba.setColumnWidth(C.QTD,    60);
  aba.setColumnWidth(C.OBS,   220);
  aba.setColumnWidth(C.VU,    110);
  aba.setColumnWidth(C.TOTAL,   110);
  aba.setColumnWidth(C.PAGO,   110);
  aba.setColumnWidth(C.PEND,   110);
  aba.setColumnWidth(C.FORMA,  120);
  aba.setColumnWidth(C.STATUS, 140);

  aba.setFrozenRows(1);
  aba.setFrozenColumns(3); // congela Data, Produto, Nome
}

// Normaliza texto de status para o padrão com emoji
function _normStatus(st) {
  st = (st || "").toString().trim();
  if (st.indexOf("Parcial")   > -1)                       return "⚠️ Pago Parcial";
  if (st.indexOf("Pago")      > -1 || st.indexOf("✅") > -1) return "✅ Pago";
  if (st.indexOf("Cancelado") > -1 || st.indexOf("❌") > -1) return "❌ Cancelado";
  if (st.indexOf("Enviado")   > -1 || st.indexOf("📦") > -1) return "📦 Enviado";
  return "🟡 Pendente";
}

// Chave de matching: wpp normalizado + produto sem preço + sem acentos
function _chave(wpp, produto) {
  return _wpp(wpp) + "|" + _semAcento(_semPreco(String(produto || "").toLowerCase()));
}

function _wpp(v) {
  var d = String(v || "").replace(/\D/g, "");
  if (d.length >= 12 && d.substring(0, 2) === "55") d = d.substring(2);
  return d.length > 8 ? d.slice(-8) : d;
}

function _semAcento(s) {
  return String(s || "")
    .replace(/[áàãâä]/gi, "a").replace(/[éèêë]/gi, "e")
    .replace(/[íìîï]/gi,  "i").replace(/[óòõôö]/gi, "o")
    .replace(/[úùûü]/gi,  "u").replace(/[ç]/gi, "c").replace(/[ñ]/gi, "n");
}

function _semPreco(s) {
  return String(s || "").replace(/\s*-?\s*r\$\s*[\d.,]+/gi, "").replace(/\s+/g, " ").trim();
}

// Nome limpo do produto (sem "- R$ xx,xx" e sem emojis do início)
function _nomeSemPreco(texto) {
  return texto.replace(/\s*-?\s*R\$\s*[\d.,]+\s*$/i, "")
              .replace(/^[^a-zA-Z0-9À-ɏ]+/, "").trim();
}

// Converte valor de célula para número.
// Suporta formato BR (1.234,56) e US/planilha (1234.56 ou 35.00).
function _num(v) {
  if (typeof v === "number") return v;
  var s = String(v || "").replace(/[R$\s]/g, ""); // remove símbolo e espaços
  if (s.indexOf(",") > -1) {
    // Formato BR: ponto = milhar, vírgula = decimal
    s = s.replace(/\./g, "").replace(",", ".");
  }
  // Se só tem ponto (formato US ou número puro), parseFloat lida corretamente
  return parseFloat(s) || 0;
}

// Formata WhatsApp: XX XXXXX-XXXX
function _fmtWpp(raw) {
  if (!raw || raw.length < 7) return raw;
  var d = raw.replace(/\D/g, "");
  if (d.length >= 12 && d.substring(0, 2) === "55") d = d.substring(2);
  if (d.length === 11) return d.substring(0,2) + " " + d.substring(2,7) + "-" + d.substring(7);
  if (d.length === 10) return d.substring(0,2) + " " + d.substring(2,6) + "-" + d.substring(6);
  return raw;
}

// Encontra índice (0-based) de coluna pelo nome (parcial, case-insensitive)
function _col(cab, termos) {
  for (var i = 0; i < cab.length; i++) {
    var h = cab[i].toString().toLowerCase().trim();
    for (var t = 0; t < termos.length; t++) {
      if (h.indexOf(termos[t]) !== -1) return i;
    }
  }
  return -1;
}
