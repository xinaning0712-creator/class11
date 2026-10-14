// ============================================================
// 讀 Excel（.xlsx）或 CSV 檔，回傳每一列的文字：[['題目','A','B',...], ...]
// 全部在瀏覽器裡完成，不用上傳到任何地方、也不用外部套件
// ============================================================

export async function readSheetFile(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.xls')) throw new Error('這是舊版 Excel（.xls）檔：請在 Excel 按「另存新檔」選「Excel 活頁簿（.xlsx）」再匯入');
  if (name.endsWith('.csv') || file.type === 'text/csv') return readCsv(await file.arrayBuffer());
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) return readXlsx(await file.arrayBuffer());
  throw new Error('請選擇 Excel（.xlsx）或 CSV 檔');
}

/* ---------- CSV：自動判斷 UTF-8 或 Big5（台灣版 Excel 存 CSV 常是 Big5） ---------- */
function decodeText(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch (e) { return new TextDecoder('big5').decode(buf); }
}
function readCsv(buf) {
  const text = decodeText(buf);
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/* ---------- XLSX：xlsx 其實是 zip，裡面是 XML ---------- */
async function unzip(buf) {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('這個檔案打不開，請確認是 Excel（.xlsx）檔');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const csize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true), extraLen = view.getUint16(p + 30, true), commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    files.set(name, { method, csize, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return async function read(name) {
    const f = files.get(name);
    if (!f) return null;
    const lnLen = view.getUint16(f.local + 26, true), lxLen = view.getUint16(f.local + 28, true);
    const start = f.local + 30 + lnLen + lxLen;
    const data = bytes.subarray(start, start + f.csize);
    if (f.method === 0) return dec.decode(data);
    if (f.method !== 8) throw new Error('這個 Excel 檔的壓縮方式不支援，請另存新檔後再試');
    if (typeof DecompressionStream === 'undefined') throw new Error('這個瀏覽器太舊、讀不了 Excel 檔，請改用 Chrome，或把題目複製貼上');
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(stream).text();
  };
}

const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const tags = (node, name) => Array.from(node.getElementsByTagName(name));

async function readXlsx(buf) {
  const read = await unzip(buf);
  // 共用字串（Excel 把文字集中存在這裡）
  const shared = [];
  const ss = await read('xl/sharedStrings.xml');
  if (ss) for (const si of tags(xml(ss), 'si')) shared.push(tags(si, 't').map((t) => t.textContent).join(''));

  // 找第一個工作表
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wbXml = await read('xl/workbook.xml'), relXml = await read('xl/_rels/workbook.xml.rels');
  if (wbXml && relXml) {
    const first = tags(xml(wbXml), 'sheet')[0];
    const rid = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
    const rel = tags(xml(relXml), 'Relationship').find((r) => r.getAttribute('Id') === rid);
    if (rel) {
      const target = rel.getAttribute('Target');
      sheetPath = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    }
  }
  const sheet = await read(sheetPath);
  if (!sheet) throw new Error('Excel 檔裡找不到工作表');

  const colIndex = (ref) => {
    const letters = (ref.match(/^[A-Z]+/) || ['A'])[0];
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };
  const rows = [];
  for (const rowEl of tags(xml(sheet), 'row')) {
    const r = Number(rowEl.getAttribute('r')) - 1;
    const row = [];
    for (const c of tags(rowEl, 'c')) {
      const t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0];
      let val = '';
      if (t === 's') val = shared[Number(v?.textContent)] ?? '';
      else if (t === 'inlineStr') val = tags(c, 't').map((x) => x.textContent).join('');
      else if (t === 'b') val = v?.textContent === '1' ? 'TRUE' : 'FALSE';
      else val = v?.textContent ?? '';
      row[colIndex(c.getAttribute('r') || 'A')] = val;
    }
    rows[r] = Array.from(row, (x) => x ?? '');
  }
  return Array.from(rows, (x) => x ?? []);
}
