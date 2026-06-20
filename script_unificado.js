/**
 * ════════════════════════════════════════════════════════════════
 *  COISINHAS DO JAPÃO — Script Unificado (Opção A)
 * ════════════════════════════════════════════════════════════════
 *
 *  UMA ABA ÚNICA: "🛍️ Pedidos do Site"
 *  Colunas após a migração:
 *    A  Carimbo de data/h
 *    B  Produto / Variação
 *    C  Seu nome completo
 *    D  WhatsApp
 *    E  Quantidade
 *    F  Obs. do pedido  (campo do formulário)
 *    G  Valor Unit (R$)  ← calculado
 *    H  Total (R$)       ← calculado
 *    I  💵 Pago (R$)     ← você preenche manualmente
 *    J  📍 Pendente (R$) ← automático (H - I)
 *    K  Forma de Pgto    ← dropdown manual
 *    L  ✅ Status        ← automático + pode ser sobrescrito
 *    M  Observação Pgto  ← campo livre manual
 *
 *  COMO USAR:
 *  1. Execute migrarParaAbaUnificada() UMA VEZ — preserva todos os dados manuais
 *  2. Execute configurarTudo() UMA VEZ — ativa o gatilho automático
 *  3. Pronto. Edite "Pago" na linha e Status/Pendente atualizam sozinhos.
 *
 *  FUNÇÕES:
 *  - migrarParaAbaUnificada()  → migração segura (execute 1x)
 *  - configurarTudo()          → ativa gatilhos (execute 1x)
 *  - aoEditar()                → gatilho automático (não execute manualmente)
 *  - calcularAbas()            → recalcula Valor Unit/Total a cada 1 min
 *  - recalcularTodos()         → recalcula Pago/Pendente/Status em toda a aba
 *  - resumoRapido()            → loga totais no console (diagnóstico)
 * ════════════════════════════════════════════════════════════════
 */

var PLANILHA_ID     = "1fv0bJ4lWQpjCUbX-_Lzx3u7NDKU1DdbvjSkppc4QDZk";
var ABA_PEDIDOS     = "🛍️ Pedidos do Site";
var MAX_QTD_PRODUTO = 5;

// Colunas da aba unificada (1-indexed para getRange, 0-indexed para arrays)
var COL = {
  DATA:    1,   // A - Carimbo
  PRODUTO: 2,   // B - Produto/Variação
  NOME:    3,   // C - Nome completo
  WPP:     4,   // D - WhatsApp
  QTD:     5,   // E - Quantidade
  OBS_PED: 6,   // F - Obs. pedido (form)
  VU:      7,   // G - Valor Unit
  TOTAL:   8,   // H - Total
  PAGO:    9,   // I - Pago (manual)
  PEND:    10,  // J - Pendente (auto)
  FORMA:   11,  // K - Forma de Pagamento
  STATUS:  12,  // L - Status
  OBS_PG:  13   // M - Observação Pgto
};
var N_COLS = 13;

// ════════════════════════════════════════════════════════════════
//  CONFIGURAR GATILHOS — execute UMA VEZ após migrar
// ════════════════════════════════════════════════════════════════
function configurarTudo() {
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("calcularAbas").timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger("aoEditar").forSpreadsheet(PLANILHA_ID).onEdit().create();
  Logger.log("✅ Gatilhos configurados: calcularAbas (1 min) + aoEditar (onEdit)");
}

// ════════════════════════════════════════════════════════════════
//  AO EDITAR — gatilho automático
// ════════════════════════════════════════════════════════════════
function aoEditar(e) {
  try {
    var sheet = e.range.getSheet();
    if (sheet.getName().trim() !== ABA_PEDIDOS) return;

    var col = e.range.getColumn();
    var row = e.range.getRow();
    if (row < 2) return;

    // Editou Pago (col I) → recalcula Pendente e Status
    if (col === COL.PAGO) {
      _atualizarLinha(sheet, row);
      return;
    }

    // Editou Status (col L) manualmente → só colore
    if (col === COL.STATUS) {
      _colorirStatus(sheet.getRange(row, COL.STATUS), e.range.getValue().toString());
      return;
    }

    // Editou Quantidade ou Produto → recalcular Total e Status
    if (col === COL.QTD || col === COL.PRODUTO) {
      _recalcularTotalLinha(sheet, row);
      return;
    }
  } catch(err) {
    Logger.log("Erro aoEditar: " + err.message);
  }
}

// ════════════════════════════════════════════════════════════════
//  CALCULAR ABAS — roda a cada 1 min (Valor Unit + Total + WPP)
// ════════════════════════════════════════════════════════════════
function calcularAbas() {
  var ss    = SpreadsheetApp.openById(PLANILHA_ID);
  var abas  = ss.getSheets();
  var inicio = new Date().getTime();

  abas.forEach(function(aba) {
    if (new Date().getTime() - inicio > 240000) return;

    var nome = aba.getName().trim();
    // Só processa o Pedidos do Site (e ignora abas de sistema)
    var ignorar = ["RESUMO","CLIENTES","Pagamentos","PAGAMENTOS","PEDIDOS",
                   "COBRANÇAS","EXTRATO","Catálogo","CATÁLOGO","_ARQUIVADO_","Extrato"];
    var skip = false;
    ignorar.forEach(function(ig){ if (nome.indexOf(ig) > -1) skip = true; });
    if (skip) return;
    if (aba.getLastRow() < 2) return;

    var dados = aba.getDataRange().getValues();
    var cab   = dados[0];
    var colProd  = _col(cab, ["produto","varia"]);
    var colQtd   = _col(cab, ["quantid"]);
    var colVU    = _col(cab, ["valor unit"]);
    var colTotal = _col(cab, ["total"]);
    var colWpp   = _col(cab, ["whatsapp","wpp"]);
    if (colProd === -1) return;

    var nLinhas  = dados.length - 1;
    var vus=[], tots=[], wpps=[];

    for (var i = 1; i < dados.length; i++) {
      var prod = dados[i][colProd] ? dados[i][colProd].toString().trim() : "";
      var m    = prod.match(/R\$\s*([\d.]+,\d{2})/);
      var vu   = m ? parseFloat(m[1].replace(/\./g,"").replace(",",".")) : 0;
      var qtd  = colQtd > -1 ? (parseInt(dados[i][colQtd]) || 1) : 1;
      vus.push([vu]);
      tots.push([vu * qtd]);
      var wppAtual = colWpp > -1 ? dados[i][colWpp].toString().trim() : "";
      wpps.push([_formatarWpp(wppAtual)]);
    }

    if (colVU    > -1) aba.getRange(2, colVU+1,    nLinhas, 1).setValues(vus).setNumberFormat("R$ #,##0.00");
    if (colTotal > -1) aba.getRange(2, colTotal+1,  nLinhas, 1).setValues(tots).setNumberFormat("R$ #,##0.00").setFontWeight("bold");
    if (colWpp   > -1) aba.getRange(2, colWpp+1,    nLinhas, 1).setValues(wpps);
  });
}

// ════════════════════════════════════════════════════════════════
//  MIGRAR PARA ABA UNIFICADA — execute UMA VEZ
//  Preserva todos os dados manuais de Pagamentos
// ════════════════════════════════════════════════════════════════
function migrarParaAbaUnificada() {
  var ss     = SpreadsheetApp.openById(PLANILHA_ID);
  var abaPed = ss.getSheetByName(ABA_PEDIDOS);
  var abaPag = ss.getSheetByName("Pagamentos");

  if (!abaPed) { Logger.log("❌ Aba 'Pedidos do Site' não encontrada"); return; }

  // ── 1. Ler dados de Pagamentos e montar mapa por chave ─────────
  var mapaPag = {};  // chave → {pago, forma, status, obs}
  if (abaPag && abaPag.getLastRow() >= 2) {
    var dadosPag = abaPag.getDataRange().getValues();
    var cabPag   = dadosPag[0];
    var cpWpp  = _col(cabPag, ["whatsapp","wpp"]);
    var cpItem = _col(cabPag, ["item"]);
    var cpPago = _col(cabPag, ["pago","💵"]);
    var cpPend = _col(cabPag, ["pendente"]);
    var cpForma= _col(cabPag, ["forma"]);
    var cpStat = _col(cabPag, ["status"]);
    var cpObs  = _col(cabPag, ["observa"]);

    for (var i = 1; i < dadosPag.length; i++) {
      var row = dadosPag[i];
      var wpp  = cpWpp  > -1 ? row[cpWpp].toString()  : "";
      var item = cpItem > -1 ? row[cpItem].toString()  : "";
      if (!wpp && !item) continue;

      var pago  = cpPago  > -1 ? (_toNum(row[cpPago]))  : 0;
      var forma = cpForma > -1 ? row[cpForma].toString().trim() : "";
      var st    = cpStat  > -1 ? row[cpStat].toString().trim()  : "";
      var obs   = cpObs   > -1 ? row[cpObs].toString().trim()   : "";

      var chave = _chave(wpp, item);
      // Se já existe chave (produto repetido do mesmo cliente), soma pago
      if (mapaPag[chave]) {
        mapaPag[chave].pago += pago;
        if (forma) mapaPag[chave].forma = forma;
        if (obs)   mapaPag[chave].obs   = obs;
        if (st && !mapaPag[chave].status) mapaPag[chave].status = st;
      } else {
        mapaPag[chave] = { pago: pago, forma: forma, status: st, obs: obs };
      }
    }
    Logger.log("Pagamentos lidos: " + Object.keys(mapaPag).length + " entradas mapeadas");
  } else {
    Logger.log("⚠️ Aba Pagamentos não encontrada ou vazia — migração só com dados de Pedidos");
  }

  // ── 2. Ler dados de Pedidos do Site ────────────────────────────
  var dadosPed = abaPed.getDataRange().getValues();
  var cabPed   = dadosPed[0];

  var cpProd  = _col(cabPed, ["produto","varia"]);
  var cpNome  = _col(cabPed, ["nome"]);
  var cpWppP  = _col(cabPed, ["whatsapp","wpp"]);
  var cpQtd   = _col(cabPed, ["quantid"]);
  var cpObsF  = _col(cabPed, ["observa"]);
  var cpVU    = _col(cabPed, ["valor unit"]);
  var cpTotal = _col(cabPed, ["total"]);
  var cpStatP = _col(cabPed, ["status"]);
  var cpData  = _col(cabPed, ["carimbo","data","timestamp"]);

  // ── 3. Montar novas linhas com dados mesclados ─────────────────
  var novasLinhas = [[
    "Carimbo de data/h", "Produto / Variação", "Seu nome completo",
    "WhatsApp", "Quantidade", "Obs. do pedido",
    "Valor Unit (R$)", "Total (R$)",
    "💵 Pago (R$)", "📍 Pendente (R$)", "Forma de Pagamento",
    "✅ Status", "Observação Pgto"
  ]];

  var matched = 0, unmatched = 0;
  for (var r = 1; r < dadosPed.length; r++) {
    var row = dadosPed[r];
    var prod  = cpProd  > -1 ? row[cpProd].toString().trim()  : "";
    if (!prod) continue;

    var data  = cpData  > -1 ? row[cpData]  : "";
    var nome  = cpNome  > -1 ? row[cpNome].toString().trim()  : "";
    var wpp   = cpWppP  > -1 ? row[cpWppP].toString().trim()  : "";
    var qtd   = cpQtd   > -1 ? (parseInt(row[cpQtd]) || 1)    : 1;
    var obsF  = cpObsF  > -1 ? row[cpObsF].toString().trim()  : "";
    var vu    = 0;
    var m     = prod.match(/R\$\s*([\d.]+,\d{2})/);
    if (m) vu = parseFloat(m[1].replace(/\./g,"").replace(",","."));
    if (vu === 0 && cpVU > -1) vu = _toNum(row[cpVU]);
    var total = cpTotal > -1 ? _toNum(row[cpTotal]) : vu * qtd;
    if (!total) total = vu * qtd;

    // Nome limpo do produto (sem "- R$ xx,xx")
    var prodSemPreco = prod.replace(/\s*-?\s*R\$\s*[\d.,]+\s*$/i,"").trim();

    // Buscar no mapa de Pagamentos
    var chave  = _chave(wpp, prodSemPreco);
    var pg     = mapaPag[chave] || null;

    var pago   = pg ? pg.pago   : 0;
    var forma  = pg ? pg.forma  : "";
    var obsP   = pg ? pg.obs    : "";
    var stPag  = pg ? pg.status : "";

    // Também tenta status atual de Pedidos do Site
    var stPed  = cpStatP > -1 ? row[cpStatP].toString().trim() : "";

    // Status final: prioridade → Pagamentos manual → Pedidos do Site → derivado de pago
    var status;
    if (stPag && stPag !== "") {
      status = _normalizarStatus(stPag);
    } else if (stPed && stPed !== "" && stPed !== "0") {
      status = _normalizarStatus(stPed);
    } else {
      var pend = total - pago;
      if (pago >= total - 0.01)    status = "✅ Pago";
      else if (pago > 0.01)        status = "⚠️ Pago Parcial";
      else                         status = "🟡 Pendente";
    }

    var pendente = Math.max(total - pago, 0);

    if (pg) matched++; else unmatched++;

    novasLinhas.push([
      data, prod, nome, _formatarWpp(wpp), qtd, obsF,
      vu, total, pago, pendente, forma, status, obsP
    ]);
  }

  Logger.log("Pedidos processados: " + (novasLinhas.length-1) +
             " | Cruzados com Pagamentos: " + matched +
             " | Sem cruzamento: " + unmatched);

  // ── 4. Fazer backup de Pagamentos (renomeia, não apaga) ─────────
  if (abaPag) {
    var nomeBkp = "Pagamentos_bkp_" + Utilities.formatDate(new Date(), "America/Sao_Paulo", "ddMMyy_HHmm");
    abaPag.setName(nomeBkp);
    Logger.log("📦 Backup criado: " + nomeBkp + " (pode apagar depois de conferir)");
  }

  // ── 5. Reescrever Pedidos do Site ──────────────────────────────
  abaPed.clearContents();
  abaPed.clearFormats();
  var maxR = Math.max(abaPed.getMaxRows(), novasLinhas.length + 10);
  abaPed.getRange(1, 1, maxR, N_COLS).clearDataValidations();

  abaPed.getRange(1, 1, novasLinhas.length, N_COLS).setValues(novasLinhas);

  // ── 6. Formatar ─────────────────────────────────────────────────
  _formatarAbaUnificada(abaPed, novasLinhas.length);

  Logger.log("✅ Migração concluída! " + (novasLinhas.length-1) + " pedidos na aba unificada.");
  Logger.log("PRÓXIMO PASSO: execute configurarTudo() para ativar o gatilho automático.");
}

// ════════════════════════════════════════════════════════════════
//  RECALCULAR TODOS — força recalculo de toda a aba
//  Use após qualquer edição em massa na coluna Pago
// ════════════════════════════════════════════════════════════════
function recalcularTodos() {
  var ss  = SpreadsheetApp.openById(PLANILHA_ID);
  var aba = ss.getSheetByName(ABA_PEDIDOS);
  if (!aba || aba.getLastRow() < 2) return;

  var n = aba.getLastRow() - 1;
  var dados = aba.getRange(2, 1, n, N_COLS).getValues();
  var pendentes = [], statuses = [], bgMatrix = [];

  for (var i = 0; i < dados.length; i++) {
    var total = _toNum(dados[i][COL.TOTAL-1]);
    var pago  = _toNum(dados[i][COL.PAGO-1]);
    var st    = dados[i][COL.STATUS-1].toString().trim();
    var pend  = Math.max(total - pago, 0);

    // Só recalcula status se não foi sobrescrito manualmente para Cancelado/Enviado
    if (st.indexOf("Cancelado") === -1 && st.indexOf("Enviado") === -1) {
      if (pago >= total - 0.01 && total > 0) st = "✅ Pago";
      else if (pago > 0.01)                  st = "⚠️ Pago Parcial";
      else                                    st = "🟡 Pendente";
    }

    pendentes.push([pend]);
    statuses.push([st]);

    var bg = _bgStatus(st);
    var rowBg = [];
    for (var j = 0; j < N_COLS; j++) rowBg.push(j === COL.STATUS-1 ? bg[0] : (i%2===0 ? "#FFFFFF" : "#F5EFE6"));
    bgMatrix.push(rowBg);
  }

  aba.getRange(2, COL.PEND,   n, 1).setValues(pendentes).setNumberFormat("R$ #,##0.00");
  aba.getRange(2, COL.STATUS, n, 1).setValues(statuses);
  aba.getRange(2, 1, n, N_COLS).setBackgrounds(bgMatrix);

  // Colorir status em batch
  for (var i = 0; i < statuses.length; i++) {
    _colorirStatus(aba.getRange(i+2, COL.STATUS), statuses[i][0]);
  }

  Logger.log("✅ recalcularTodos: " + n + " linhas atualizadas.");
}

// ════════════════════════════════════════════════════════════════
//  RESUMO RÁPIDO — loga totais (diagnóstico)
// ════════════════════════════════════════════════════════════════
function resumoRapido() {
  var ss  = SpreadsheetApp.openById(PLANILHA_ID);
  var aba = ss.getSheetByName(ABA_PEDIDOS);
  if (!aba || aba.getLastRow() < 2) { Logger.log("Aba vazia"); return; }

  var dados = aba.getRange(2, 1, aba.getLastRow()-1, N_COLS).getValues();
  var total=0, pago=0, pend=0, nPago=0, nPend=0, nParc=0, nCanc=0;
  dados.forEach(function(r) {
    var t = _toNum(r[COL.TOTAL-1]);
    var p = _toNum(r[COL.PAGO-1]);
    var st= r[COL.STATUS-1].toString();
    total += t; pago += p; pend += Math.max(t-p,0);
    if (st.indexOf("Pago") > -1 && st.indexOf("Parcial") === -1) nPago++;
    else if (st.indexOf("Parcial") > -1) nParc++;
    else if (st.indexOf("Cancelado") > -1) nCanc++;
    else nPend++;
  });
  Logger.log("════ RESUMO ════");
  Logger.log("Total pedidos  : " + dados.length);
  Logger.log("A receber      : R$ " + total.toFixed(2));
  Logger.log("Pago           : R$ " + pago.toFixed(2));
  Logger.log("Pendente       : R$ " + pend.toFixed(2));
  Logger.log("✅ Pagos       : " + nPago);
  Logger.log("⚠️ Parciais    : " + nParc);
  Logger.log("🟡 Pendentes   : " + nPend);
  Logger.log("❌ Cancelados  : " + nCanc);
}

// ════════════════════════════════════════════════════════════════
//  CONTROLE DE ESTOQUE (Catálogo)
// ════════════════════════════════════════════════════════════════
function _ajustarEstoque(ss, nomeProduto, delta) {
  var aba = ss.getSheetByName("Catálogo") || ss.getSheetByName("CATÁLOGO");
  if (!aba) return;
  var dados = aba.getDataRange().getValues();
  var cab   = dados[0];
  var cNome = _col(cab, ["nome completo","nome"]);
  var cEst  = _col(cab, ["estoque"]);
  if (cNome < 0 || cEst < 0) return;

  var alvo = nomeProduto.trim();
  for (var i = 1; i < dados.length; i++) {
    if (dados[i][cNome].toString().trim() === alvo) {
      var atual = Number(dados[i][cEst]) || 0;
      aba.getRange(i+1, cEst+1).setValue(Math.max(atual + delta, 0));
      return;
    }
  }
}

// ════════════════════════════════════════════════════════════════
//  HELPERS INTERNOS
// ════════════════════════════════════════════════════════════════

// Atualiza Pendente + Status de uma linha após edição do Pago
function _atualizarLinha(aba, row) {
  var vals  = aba.getRange(row, 1, 1, N_COLS).getValues()[0];
  var total = _toNum(vals[COL.TOTAL-1]);
  var pago  = _toNum(vals[COL.PAGO-1]);
  var pend  = Math.max(total - pago, 0);

  var status;
  if (pago >= total - 0.01 && total > 0) status = "✅ Pago";
  else if (pago > 0.01)                  status = "⚠️ Pago Parcial";
  else                                   status = "🟡 Pendente";

  aba.getRange(row, COL.PEND).setValue(pend).setNumberFormat("R$ #,##0.00");
  var cellSt = aba.getRange(row, COL.STATUS);
  cellSt.setValue(status);
  _colorirStatus(cellSt, status);
}

// Recalcula Total quando Qtd ou Produto mudam
function _recalcularTotalLinha(aba, row) {
  var vals  = aba.getRange(row, 1, 1, N_COLS).getValues()[0];
  var prod  = vals[COL.PRODUTO-1].toString();
  var m     = prod.match(/R\$\s*([\d.]+,\d{2})/);
  var vu    = m ? parseFloat(m[1].replace(/\./g,"").replace(",",".")) : _toNum(vals[COL.VU-1]);
  var qtd   = parseInt(vals[COL.QTD-1]) || 1;
  var total = vu * qtd;
  aba.getRange(row, COL.VU).setValue(vu).setNumberFormat("R$ #,##0.00");
  aba.getRange(row, COL.TOTAL).setValue(total).setNumberFormat("R$ #,##0.00");
  _atualizarLinha(aba, row);
}

// Aplica cor na célula de status
function _colorirStatus(cell, val) {
  val = val || "";
  if      (val.indexOf("Parcial")   > -1) cell.setBackground("#FFF3CD").setFontColor("#8A6D00").setFontWeight("bold");
  else if (val.indexOf("Pago")      > -1) cell.setBackground("#C8E6C9").setFontColor("#1B5E20").setFontWeight("bold");
  else if (val.indexOf("Cancelado") > -1) cell.setBackground("#FFCDD2").setFontColor("#B71C1C").setFontWeight("bold");
  else if (val.indexOf("Enviado")   > -1) cell.setBackground("#BBDEFB").setFontColor("#0D47A1").setFontWeight("bold");
  else                                    cell.setBackground("#FFF9C4").setFontColor("#8A6D00").setFontWeight("bold");
}

// Retorna [bg, fc] para um status
function _bgStatus(val) {
  val = val || "";
  if      (val.indexOf("Parcial")   > -1) return ["#FFF3CD", "#8A6D00"];
  else if (val.indexOf("Pago")      > -1) return ["#C8E6C9", "#1B5E20"];
  else if (val.indexOf("Cancelado") > -1) return ["#FFCDD2", "#B71C1C"];
  else if (val.indexOf("Enviado")   > -1) return ["#BBDEFB", "#0D47A1"];
  else                                    return ["#FFF9C4", "#8A6D00"];
}

// Formata aba unificada (cabeçalho, dropdowns, larguras, zebra)
function _formatarAbaUnificada(aba, nLinhas) {
  var n = nLinhas - 1;
  if (n < 1) return;

  // Cabeçalho
  aba.getRange(1, 1, 1, N_COLS)
    .setBackground("#1A1410").setFontColor("#C9A84C")
    .setFontWeight("bold").setFontSize(11);

  // Números
  aba.getRange(2, COL.VU,    n, 1).setNumberFormat("R$ #,##0.00");
  aba.getRange(2, COL.TOTAL, n, 1).setNumberFormat("R$ #,##0.00").setFontWeight("bold");
  aba.getRange(2, COL.PAGO,  n, 1).setNumberFormat("R$ #,##0.00");
  aba.getRange(2, COL.PEND,  n, 1).setNumberFormat("R$ #,##0.00");

  // Dropdown Status
  aba.getRange(2, COL.STATUS, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(["🟡 Pendente","✅ Pago","⚠️ Pago Parcial","❌ Cancelado","📦 Enviado"], true)
      .setAllowInvalid(false).build()
  );

  // Dropdown Forma de Pagamento
  aba.getRange(2, COL.FORMA, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(["","Pix","Cartão","Dinheiro","Outro"], true)
      .setAllowInvalid(true).build()
  );

  // Zebra de fundo
  var bgMatrix = [];
  for (var i = 0; i < n; i++) {
    var rowBg = [];
    for (var j = 0; j < N_COLS; j++) rowBg.push(i%2===0 ? "#FFFFFF" : "#F5EFE6");
    bgMatrix.push(rowBg);
  }
  aba.getRange(2, 1, n, N_COLS).setBackgrounds(bgMatrix);

  // Colorir Status
  var statuses = aba.getRange(2, COL.STATUS, n, 1).getValues();
  for (var i = 0; i < statuses.length; i++) {
    _colorirStatus(aba.getRange(i+2, COL.STATUS), statuses[i][0].toString());
  }

  // Larguras
  aba.setColumnWidth(COL.DATA,    140);
  aba.setColumnWidth(COL.PRODUTO, 350);
  aba.setColumnWidth(COL.NOME,    180);
  aba.setColumnWidth(COL.WPP,     130);
  aba.setColumnWidth(COL.QTD,      60);
  aba.setColumnWidth(COL.OBS_PED, 160);
  aba.setColumnWidth(COL.VU,      110);
  aba.setColumnWidth(COL.TOTAL,   110);
  aba.setColumnWidth(COL.PAGO,    110);
  aba.setColumnWidth(COL.PEND,    110);
  aba.setColumnWidth(COL.FORMA,   120);
  aba.setColumnWidth(COL.STATUS,  140);
  aba.setColumnWidth(COL.OBS_PG,  200);

  aba.setFrozenRows(1);
  aba.setFrozenColumns(3);
}

// Normaliza texto de status para emoji padrão
function _normalizarStatus(st) {
  st = st.toString().trim();
  if (st.indexOf("Pago") > -1 && st.indexOf("Parcial") === -1) return "✅ Pago";
  if (st.indexOf("✅") > -1)   return "✅ Pago";
  if (st.indexOf("Parcial") > -1) return "⚠️ Pago Parcial";
  if (st.indexOf("Cancelado") > -1 || st.indexOf("❌") > -1) return "❌ Cancelado";
  if (st.indexOf("Enviado") > -1 || st.indexOf("📦") > -1)   return "📦 Enviado";
  return "🟡 Pendente";
}

// Chave de matching: wpp normalizado + produto sem preço + normalização de acentos
function _chave(wpp, produto) {
  return _normWpp(wpp) + "|" + _normAcentos(_stripPreco(String(produto||"").toLowerCase()));
}

function _normWpp(wpp) {
  var d = String(wpp||"").replace(/\D/g,"");
  if (d.length >= 12 && d.substring(0,2) === "55") d = d.substring(2);
  return d.length > 8 ? d.slice(-8) : d;
}

function _normAcentos(s) {
  return String(s||"")
    .replace(/[áàãâä]/gi,"a").replace(/[éèêë]/gi,"e")
    .replace(/[íìîï]/gi,"i").replace(/[óòõôö]/gi,"o")
    .replace(/[úùûü]/gi,"u").replace(/[ç]/gi,"c").replace(/[ñ]/gi,"n");
}

function _stripPreco(s) {
  return String(s||"").replace(/\s*-?\s*r\$\s*[\d.,]+/gi,"").replace(/\s+/g," ").trim();
}

function _toNum(v) {
  if (typeof v === "number") return v;
  return parseFloat(String(v||"").replace(/[^\d,]/g,"").replace(",",".")) || 0;
}

function _formatarWpp(raw) {
  if (!raw || raw.length < 7) return raw;
  var d = raw.replace(/\D/g,"");
  if (d.length >= 12 && d.substring(0,2) === "55") d = d.substring(2);
  if (d.length === 11) return d.substring(0,2)+" "+d.substring(2,7)+"-"+d.substring(7);
  if (d.length === 10) return d.substring(0,2)+" "+d.substring(2,6)+"-"+d.substring(6);
  return raw;
}

function _col(cab, termos) {
  for (var i = 0; i < cab.length; i++) {
    var h = cab[i].toString().toLowerCase().trim();
    for (var t = 0; t < termos.length; t++) {
      if (h.indexOf(termos[t]) !== -1) return i;
    }
  }
  return -1;
}
