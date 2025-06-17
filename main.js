let enchantments = [];
let selectedMap = {};
let chosenCategory = null;
let chosenSlot = null;
const lang = "ko";

// Prior Work Penalty: 2^uses - 1
function prior(uses) {
  return (1 << uses) - 1;
}

// 노드 트리에서 모든 인챈트 (id, level) 목록으로 펼치기
function flattenEnchants(node) {
  if (!node.left && !node.right) {
    return [{ id: node.id, level: node.level || 1 }];
  }
  let arr = [];
  if (node.left) arr = arr.concat(flattenEnchants(node.left));
  if (node.right) arr = arr.concat(flattenEnchants(node.right));
  return arr;
}

// 인챈트 병합 비용 계산 (책+책, 아이템+책 공용)
function mergeCost(left, right, type = "책+책") {
  let target, sac;
  if (type === "아이템+책") {
    if (left.id === "item") {
      target = left;
      sac = right;
    } else if (right.id === "item") {
      target = right;
      sac = left;
    } else return Infinity;
  } else {
    target = left;
    sac = right;
  }

  const targetEnchants = flattenEnchants(target);
  const sacEnchants = flattenEnchants(sac);

  let enchantCost = 0;
  let incompatPenalty = 0;

  for (const e of sacEnchants) {
    const data = enchantments.find((x) => x.id === e.id);
    if (!data) continue;

    // 아이템+책 합칠 땐 슬롯 검사
    if (type === "아이템+책") {
      const ok = data.applicable_slots || [];
      if (
        !ok.includes(chosenSlot) &&
        !ok.includes("any") &&
        !ok.includes("all")
      ) {
        continue;
      }
    }

    // 충돌 검사
    const conflict = targetEnchants.some((te) => {
      const td = enchantments.find((x) => x.id === te.id);
      return (
        (Array.isArray(data.exclusive_with) &&
          data.exclusive_with.includes(te.id)) ||
        (td &&
          Array.isArray(td.exclusive_with) &&
          td.exclusive_with.includes(e.id))
      );
    });
    if (conflict) {
      incompatPenalty += 1;
      continue;
    }

    // 최종 레벨 계산
    const exist = targetEnchants.find((te) => te.id === e.id);
    let finalLevel = e.level;
    if (exist) {
      if (e.level > exist.level) finalLevel = e.level;
      else if (e.level === exist.level && e.level < data.max_level)
        finalLevel = exist.level + 1;
      else finalLevel = exist.level;
    }

    // 책이 희생이므로 book_multiplier 사용
    enchantCost += finalLevel * data.book_multiplier;
  }

  // prior work penalty 합산
  const pw = prior(left.uses || 0) + prior(right.uses || 0);

  const total = enchantCost + incompatPenalty + pw;
  return total >= 40 ? Infinity : total;
}

// UI용 간단 충돌 검사
function isCompatible(a, b) {
  if (!a || !b) return true;
  if (Array.isArray(a.exclusive_with) && a.exclusive_with.includes(b.id))
    return false;
  if (Array.isArray(b.exclusive_with) && b.exclusive_with.includes(a.id))
    return false;
  return true;
}

// 병합 노드 생성
function makeNode(left, right, type, cost) {
  return {
    left,
    right,
    type,
    cost,
    uses: Math.max(left.uses || 0, right.uses || 0) + 1,
  };
}

// 최적 병합 트리 탐색 (모든 순서를 고려하되, 동일 상태 중복 계산 방지)
function computeOptimalMergeTree(leaves) {
  const memo = new Map();

  // 각 노드가 가진 인챈트 목록을 키로 만드는 함수
  function signature(nodes) {
    return nodes
      .map((n) =>
        flattenEnchants(n)
          .map((e) => `${e.id}:${e.level}`)
          .sort()
          .join(",")
      )
      .sort()
      .join("|");
  }

  function dp(nodes) {
    if (nodes.length === 1) {
      const node = nodes[0];
      const itemBase = { id: "item", uses: 0 };
      const cost = mergeCost(itemBase, node, "아이템+책");
      if (cost === Infinity) return null;
      return {
        cost,
        steps: [{ left: itemBase, right: node, type: "아이템+책", cost }],
      };
    }

    const key = signature(nodes);
    if (memo.has(key)) return memo.get(key);

    let min = Infinity,
      best = null;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const L = nodes[i],
          R = nodes[j];
        const cost = mergeCost(L, R, "책+책");
        if (cost === Infinity) continue;

        const rest = nodes.filter((_, k) => k !== i && k !== j);
        const merged = makeNode(L, R, "책+책", cost);
        const sub = dp([...rest, merged]);
        if (!sub) continue;

        const total = cost + sub.cost;
        if (total < min) {
          min = total;
          best = {
            cost: total,
            steps: [...sub.steps, { left: L, right: R, type: "책+책", cost }],
          };
        }
      }
    }

    memo.set(key, best);
    return best;
  }

  const init = leaves.map((e) => ({ ...e, uses: 0 }));
  const tree = dp(init);
  return tree
  ? { cost: tree.cost, steps: tree.steps.reverse() }
  : null;
}

function optimizeEnchants(books) {
  if (books.length === 0) return { cost: 0, steps: [] };
  const tree = computeOptimalMergeTree(books);
  if (!tree || tree.cost === Infinity) return { tooExpensive: true };
  return tree;
}

function showToast(msg) {
  const c = document.getElementById("toast-container");
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  c.append(t);
  setTimeout(() => t.remove(), 3000);
}

async function init() {
  enchantments = await (await fetch("data/enchantments.json")).json();
  document.querySelectorAll("#category-buttons .cat-btn").forEach((btn) => {
    btn.onclick = () => {
      document
        .querySelectorAll("#category-buttons .cat-btn")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      chosenCategory = btn.dataset.cat || null;
      chosenSlot = null;
      selectedMap = {};
      renderItemButtons(chosenCategory);
      renderEnchantTable();
      renderResult();
    };
  });
  renderEnchantTable();
  renderResult();
}

function renderItemButtons(category) {
  const container = document.getElementById("item-buttons");
  container.innerHTML = "";
  const items = ITEM_CATEGORIES[category] || [];
  if (items.length === 0) {
    container.innerHTML = "<p>선택 가능한 아이템이 없습니다.</p>";
    return;
  }
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "item-btn";
    btn.textContent = item.names?.[lang] || item.slot;
    btn.onclick = () => {
      chosenSlot = item.slot;
      selectedMap = {};
      document
        .querySelectorAll(".item-btn")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      renderEnchantTable();
      renderResult();
    };
    container.appendChild(btn);
  });
}

function renderEnchantTable() {
  const tb = document.querySelector("#enchant-table tbody");
  tb.innerHTML = "";
  if (!chosenSlot) return;
  const rows = enchantments.filter((e) => {
    const slots = e.applicable_slots || [];
    return (
      slots.includes(chosenSlot) ||
      slots.includes("any") ||
      slots.includes("all")
    );
  });
  rows.forEach((e) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${e.name?.[lang] || e.id}</td>
      <td class="desc-cell">${e.description?.[lang] || ""}</td>
      <td><div class="level-buttons"></div></td>
    `;
    const btnCell = tr.querySelector(".level-buttons");
    for (let lvl = 1; lvl <= e.max_level; lvl++) {
      const btn = document.createElement("button");
      btn.className = "level-button";
      btn.textContent = toRoman(lvl);
      if (selectedMap[e.id] === lvl) btn.classList.add("selected");
      btn.onclick = () => {
        if (selectedMap[e.id] === lvl) delete selectedMap[e.id];
        else {
          const others = Object.keys(selectedMap).map((id) =>
            enchantments.find((x) => x.id === id)
          );
          for (const o of others) {
            if (!isCompatible(o, e)) {
              showToast("해당 인챈트는 호환되지 않습니다.");
              return;
            }
          }
          selectedMap[e.id] = lvl;
        }
        renderEnchantTable();
        renderResult();
      };
      btnCell.append(btn);
    }
    tb.append(tr);
  });
}

function getLeafNames(node) {
  if (!node.left && !node.right) return [node.name?.[lang] || node.id];
  return [
    ...(node.left ? getLeafNames(node.left) : []),
    ...(node.right ? getLeafNames(node.right) : []),
  ];
}

function renderResult() {
  const costEl = document.getElementById("total-cost");
  const seqEl = document.getElementById("detail-seq");
  const ids = Object.keys(selectedMap);
  if (!chosenSlot || ids.length === 0) {
    costEl.textContent = "0";
    seqEl.innerHTML = "";
    return;
  }
  const books = ids.map((id) => {
    const e = enchantments.find((x) => x.id === id);
    return { ...e, level: selectedMap[id], uses: 0 };
  });
  const opt = optimizeEnchants(books);
  if (!opt || opt.tooExpensive) {
    costEl.textContent = "너무 비쌉니다!";
    seqEl.innerHTML = "";
    return;
  }
  costEl.textContent = `${opt.cost}`;
  const flow = document.createElement("div");
  flow.className = "merge-flow";
  opt.steps.forEach((step, idx) => {
    const card = document.createElement("div");
    card.className = "merge-step";
    const leftNames = getLeafNames(step.left).join(", ");
    const rightNames = getLeafNames(step.right).join(", ");
    card.innerHTML = `<strong>${step.type}</strong><br>
      <span>${leftNames} + ${rightNames}</span><br>
      <span style="color:#FFD700"><b>레벨 ${step.cost}</b></span>`;
    flow.append(card);
    if (idx < opt.steps.length - 1) {
      const arrow = document.createElement("span");
      arrow.innerHTML = "→";
      arrow.style =
        "padding:0 8px;color:#888;font-size:1.5em;vertical-align:middle;";
      flow.append(arrow);
    }
  });
  seqEl.innerHTML = "";
  seqEl.append(flow);
}

function toRoman(n) {
  const r = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  return r[n - 1] || n;
}

const ITEM_CATEGORIES = {
  weapon: [
    { slot: "sword", names: { ko: "검" } },
    { slot: "axe", names: { ko: "도끼" } },
    { slot: "trident", names: { ko: "삼지창" } },
    { slot: "bow", names: { ko: "활" } },
    { slot: "crossbow", names: { ko: "석궁" } },
  ],
  tool: [
    { slot: "pickaxe", names: { ko: "곡괭이" } },
    { slot: "shovel", names: { ko: "삽" } },
    { slot: "hoe", names: { ko: "괭이" } },
    { slot: "shears", names: { ko: "가위" } },
    { slot: "fishing_rod", names: { ko: "낚싯대" } },
  ],
  armor: [
    { slot: "helmet", names: { ko: "헬멧" } },
    { slot: "chestplate", names: { ko: "가슴보호구" } },
    { slot: "leggings", names: { ko: "바지" } },
    { slot: "boots", names: { ko: "신발" } },
  ],
};

window.addEventListener("DOMContentLoaded", init);
