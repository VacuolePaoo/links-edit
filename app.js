const state = {
  groups: [],
  selectedGroup: 0,
  prefix: '',
  suffix: ' satisfies FeedGroup[]',
};

const el = {
  sourceInput: document.getElementById('sourceInput'),
  output: document.getElementById('output'),
  fileInput: document.getElementById('fileInput'),
  parseBtn: document.getElementById('parseBtn'),
  sampleBtn: document.getElementById('sampleBtn'),
  exportBtn: document.getElementById('exportBtn'),
  copyBtn: document.getElementById('copyBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  status: document.getElementById('status'),
  groupList: document.getElementById('groupList'),
  addGroupBtn: document.getElementById('addGroupBtn'),
  editorContent: document.getElementById('editorContent'),
};

const RAW = '__raw_expr__';

function setStatus(msg, isError = false) {
  el.status.textContent = msg;
  el.status.style.color = isError ? '#c81e1e' : '#5b6476';
}

function toRaw(code) {
  return { [RAW]: code };
}

function isRaw(v) {
  return typeof v === 'object' && v && RAW in v;
}

function parseTs() {
  const text = el.sourceInput.value;
  if (!text.trim()) {
    setStatus('请输入 TS 内容后再解析。', true);
    return;
  }

  try {
    const sf = ts.createSourceFile('feeds.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const exportNode = sf.statements.find((n) => n.kind === ts.SyntaxKind.ExportAssignment);
    if (!exportNode) throw new Error('没有找到 export default。');

    let expr = exportNode.expression;
    let arrayNode = expr;
    let suffix = '';

    if (expr.kind === ts.SyntaxKind.SatisfiesExpression) {
      arrayNode = expr.expression;
      suffix = text.slice(arrayNode.end, expr.end);
    }

    if (arrayNode.kind !== ts.SyntaxKind.ArrayLiteralExpression) {
      throw new Error('export default 后不是数组字面量。');
    }

    const groups = arrayNode.elements.map((groupNode) => nodeToValue(groupNode, text));

    if (!groups.every((g) => g && typeof g === 'object' && !Array.isArray(g))) {
      throw new Error('数组元素必须是对象。');
    }

    state.groups = groups;
    state.selectedGroup = 0;
    state.prefix = text.slice(0, exportNode.getStart(sf));
    state.suffix = suffix || ' satisfies FeedGroup[]';

    render();
    setStatus(`解析成功：${groups.length} 个分组。`);
  } catch (error) {
    console.error(error);
    setStatus(`解析失败：${error.message}`, true);
  }
}

function nodeToValue(node, src) {
  switch (node.kind) {
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      return node.text;
    case ts.SyntaxKind.NumericLiteral:
      return Number(node.text);
    case ts.SyntaxKind.TrueKeyword:
      return true;
    case ts.SyntaxKind.FalseKeyword:
      return false;
    case ts.SyntaxKind.NullKeyword:
      return null;
    case ts.SyntaxKind.ArrayLiteralExpression:
      return node.elements.map((item) => nodeToValue(item, src));
    case ts.SyntaxKind.ObjectLiteralExpression: {
      const obj = {};
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = getPropName(prop.name, src);
        obj[key] = nodeToValue(prop.initializer, src);
      }
      return obj;
    }
    default:
      return toRaw(src.slice(node.getStart(), node.end));
  }
}

function getPropName(nameNode, src) {
  if (ts.isIdentifier(nameNode)) return nameNode.text;
  if (ts.isStringLiteral(nameNode) || ts.isNumericLiteral(nameNode)) return nameNode.text;
  return src.slice(nameNode.getStart(), nameNode.end);
}

function render() {
  renderGroupList();
  renderEditor();
}

function renderGroupList() {
  el.groupList.innerHTML = '';
  state.groups.forEach((g, idx) => {
    const li = document.createElement('li');
    li.className = idx === state.selectedGroup ? 'active' : '';
    const name = asDisplay(g.name) || `Group ${idx + 1}`;
    const count = Array.isArray(g.entries) ? g.entries.length : 0;
    li.textContent = `${name} (${count})`;
    li.onclick = () => {
      state.selectedGroup = idx;
      render();
    };
    el.groupList.appendChild(li);
  });
}

function asDisplay(value) {
  if (isRaw(value)) return value[RAW];
  if (value == null) return '';
  return String(value);
}

function renderEditor() {
  const group = state.groups[state.selectedGroup];
  if (!group) {
    el.editorContent.innerHTML = '<div class="empty">请先解析 TS 内容。</div>';
    return;
  }

  const entries = Array.isArray(group.entries) ? group.entries : [];

  el.editorContent.innerHTML = '';

  const groupBox = document.createElement('div');
  groupBox.innerHTML = `
    <div class="entry-head">
      <strong>Group 信息</strong>
      <div>
        <button class="tiny-btn" id="delGroupBtn">删除 Group</button>
      </div>
    </div>
  `;

  el.editorContent.appendChild(groupBox);

  renderFields(group, ['name', 'desc'], groupBox);

  const customGroup = document.createElement('div');
  customGroup.innerHTML = '<div class="mono" style="font-size:12px;margin-top:6px;">其他 Group 字段</div>';
  groupBox.appendChild(customGroup);
  renderExtraFields(group, ['name', 'desc', 'entries'], customGroup);

  const entryHead = document.createElement('div');
  entryHead.className = 'entry-head';
  entryHead.innerHTML = '<strong>Entries</strong>';
  const addEntry = document.createElement('button');
  addEntry.className = 'tiny-btn';
  addEntry.textContent = '+ Entry';
  addEntry.onclick = () => {
    entries.push({ author: '', link: '', desc: '' });
    group.entries = entries;
    render();
  };
  entryHead.appendChild(addEntry);
  el.editorContent.appendChild(entryHead);

  entries.forEach((entry, idx) => {
    const card = document.createElement('div');
    card.className = 'entry-card';
    card.innerHTML = `
      <div class="entry-head">
        <strong>Entry #${idx + 1}</strong>
        <button class="tiny-btn" data-del="${idx}">删除</button>
      </div>
    `;
    renderFields(entry, ['author', 'title', 'desc', 'link', 'avatar', 'icon', 'feed', 'date', 'comment', 'sitenick'], card);
    const ext = document.createElement('div');
    ext.innerHTML = '<div class="mono" style="font-size:12px;margin-top:6px;">其他 Entry 字段</div>';
    card.appendChild(ext);
    renderExtraFields(entry, ['author', 'title', 'desc', 'link', 'avatar', 'icon', 'feed', 'date', 'comment', 'sitenick'], ext);
    const delBtn = card.querySelector('[data-del]');
    delBtn.onclick = () => {
      entries.splice(idx, 1);
      render();
    };
    el.editorContent.appendChild(card);
  });

  document.getElementById('delGroupBtn').onclick = () => {
    state.groups.splice(state.selectedGroup, 1);
    state.selectedGroup = Math.max(0, state.selectedGroup - 1);
    render();
  };
}

function renderFields(target, keys, mount) {
  keys.forEach((key) => {
    const row = document.createElement('div');
    row.className = 'field-grid';
    const label = document.createElement('label');
    label.textContent = key;
    const input = document.createElement('input');
    input.value = stringifyInput(target[key]);
    input.placeholder = `填写 ${key}`;
    input.oninput = () => {
      target[key] = parseInput(input.value);
    };
    row.appendChild(label);
    row.appendChild(input);
    mount.appendChild(row);
  });
}

function renderExtraFields(target, omit, mount) {
  Object.keys(target)
    .filter((k) => !omit.includes(k))
    .forEach((k) => {
      const row = document.createElement('div');
      row.className = 'field-grid';
      const label = document.createElement('label');
      label.textContent = k;
      const input = document.createElement('input');
      input.value = stringifyInput(target[k]);
      input.oninput = () => {
        target[k] = parseInput(input.value);
      };
      row.appendChild(label);
      row.appendChild(input);
      mount.appendChild(row);
    });
}

function stringifyInput(value) {
  if (value === undefined) return '';
  if (isRaw(value)) return `@raw:${value[RAW]}`;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

function parseInput(v) {
  const text = v.trim();
  if (text.startsWith('@raw:')) return toRaw(text.slice(5));
  if (!text) return '';
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null') return null;
  if (!Number.isNaN(Number(text)) && /^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function toTsValue(value, indent) {
  const pad = '\t'.repeat(indent);
  if (isRaw(value)) return value[RAW];
  if (value === null) return 'null';
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[` + value.map((v) => `\n${pad}\t${toTsValue(v, indent + 1)}`).join(',') + `\n${pad}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return '{}';
    return `{
${keys
  .map((k) => `${pad}\t${safeKey(k)}: ${toTsValue(value[k], indent + 1)}`)
  .join(',\n')}
${pad}}`;
  }
  return `''`;
}

function safeKey(k) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : `'${k.replace(/'/g, "\\'")}'`;
}

function generateTs() {
  const body = toTsValue(state.groups, 0);
  const prefix = state.prefix?.trimEnd() ? `${state.prefix.trimEnd()}\n\n` : '';
  const code = `${prefix}export default ${body}${state.suffix || ''};\n`;
  el.output.value = code;
  return code;
}

el.parseBtn.onclick = parseTs;

el.sampleBtn.onclick = () => {
  el.sourceInput.value = '';
  el.output.value = '';
  state.groups = [];
  render();
  setStatus('已清空。');
};

el.addGroupBtn.onclick = () => {
  state.groups.push({ name: '', desc: '', entries: [] });
  state.selectedGroup = state.groups.length - 1;
  render();
};

el.exportBtn.onclick = () => {
  const code = generateTs();
  setStatus(`导出成功，长度 ${code.length} 字符。`);
};

el.copyBtn.onclick = async () => {
  try {
    const code = generateTs();
    await navigator.clipboard.writeText(code);
    setStatus('已复制到剪贴板。');
  } catch {
    setStatus('复制失败，请手动复制。', true);
  }
};

el.downloadBtn.onclick = () => {
  const code = generateTs();
  const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'feeds.edited.ts';
  a.click();
  URL.revokeObjectURL(a.href);
};

el.fileInput.onchange = async (evt) => {
  const file = evt.target.files[0];
  if (!file) return;
  const content = await file.text();
  el.sourceInput.value = content;
  setStatus(`已导入：${file.name}`);
};

render();
