let enchantments = [];
let selectedMap = {};
let chosenCategory = null;
let chosenSlot = null;
let idList = {};
let enchantmentWeight = [];
let itemName;
let results = {};

const LANG = "ko";
const MAXIMUM_MERGE_LEVELS = 39;
const TRANSLATIONS = {
  ko: {
    enchanted_book: "마법이 부여된 책"
  },
  en: {
    enchanted_book: "Enchanted Book"
  }
};

function process(item, enchants, mode = 'levels') {
    itemName = item
    Object.freeze(itemName);

    let enchant_objs = []
    enchants.forEach(enchant => {
        let id = idList[enchant[0]]
        let e_obj = new item_obj('book', enchant[1] * enchantmentWeight[id], [id])
        e_obj.c = {I: enchant[0], l: e_obj.l, w: e_obj.w}
        enchant_objs.push(e_obj)
    });

    let mostExpensive = enchant_objs.reduce((maxIndex, item, currentIndex, array) => {
        return item.l > array[maxIndex].l ? currentIndex : maxIndex;
    }, 0);

    let id;
    if (itemName === 'book') {
        id = enchant_objs[mostExpensive].e[0]
        item = new item_obj(id, enchant_objs[mostExpensive].l)
        item.e.push(id)
        item.c = {I: id, l: item.l, w: item.w}
        enchant_objs.splice(mostExpensive, 1)
        mostExpensive = enchant_objs.reduce((maxIndex, item, currentIndex, array) => {
            return item.l > array[maxIndex].l ? currentIndex : maxIndex;
        }, 0);
    } else {
        item = new item_obj('item')
        item.c = {I: itemName, l: 0, w: 0}
    }
    let merged_item = new MergeEnchants(item, enchant_objs[mostExpensive])
    enchant_objs.splice(mostExpensive, 1)

    let all_objs = enchant_objs.concat(merged_item)
    let cheapest_items = cheapestItemsFromList(all_objs);

    let cheapest_cost = Infinity;
    let cheapest_key;
    for (const key in cheapest_items) {
        const item = cheapest_items[key];
        let item_cost;

        if (mode === 'levels') {
            item_cost = item.x;
        } else {
            item_cost = item.w;
        }
        if (item_cost < cheapest_cost) {
            cheapest_cost = item_cost;
            cheapest_key = key;
        }
    }
    const cheapest_item = cheapest_items[cheapest_key]

    let instructions = getInstructions(cheapest_item.c);

    let max_levels = 0
    instructions.forEach(key => {
        max_levels += key[2]
    });
    let max_xp = experience(max_levels)

    return {
        item_obj: cheapest_item,
        instructions: instructions,
        extra: [max_levels, max_xp],
        enchants: enchants
    };
}

async function optimizeEnchants(books) {
  if (!books.length) return { cost: 0, steps: [] };

  const arr = books.map((b) => [b.id, b.level]);
  console.log("📤 최적화 요청:", arr);

  const data = process(chosenSlot, arr, "levels");
  const cost = data.extra[0];

  const steps = data.instructions.map(([L, R, c]) => {
    const result = {
      left: L,
      right: R,
      cost: c,
      type: L.I === chosenSlot || R.I === chosenSlot ? "아이템+책" : "책+책",
    };
    console.log("💡 Step 확인:", JSON.stringify(result, null, 2));
    return result;
  });

  return { cost, steps };
}

async function init() {
  enchantments = await (await fetch("data/enchantments.json")).json();

  const enchantsById = {};
  enchantments.forEach((e) => {
    enchantsById[e.id] = e;
    idList[e.id] = Object.keys(idList).length;
    enchantmentWeight[idList[e.id]] = e.weight || 1;
  });
  Object.freeze(enchantmentWeight);
  Object.freeze(idList);

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
  if (!items.length) {
    container.innerHTML = "<p>선택 가능한 아이템이 없습니다.</p>";
    return;
  }
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "item-btn";
    btn.innerHTML = `
      <img src="resources/images/${item.slot}.gif" alt="${item.names[LANG] || item.slot}" />
      <span>${item.names[LANG] || item.slot}</span>
    `;
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
  const table = document.querySelector("#enchant-table");
  const results = document.querySelector("#results");
  tb.innerHTML = "";
  
  if (!chosenSlot) {
    table.style.display = "none";
    results.style.display = "none";
    return;
  }
  
  table.style.display = "table";
  results.style.display = "block";

  // 현재 선택된 인챈트들의 ID 목록
  const selectedEnchantIds = Object.keys(selectedMap);
  
  enchantments
    .filter((e) => {
      const s = e.applicable_slots || [];
      return s.includes(chosenSlot) || s.includes("any") || s.includes("all");
    })
    .forEach((e) => {
      const tr = document.createElement("tr");
      
      // 현재 인챈트가 선택된 다른 인챈트들과 호환되는지 확인
      const isIncompatible = selectedEnchantIds.some(selectedId => {
        const selectedEnchant = enchantments.find(x => x.id === selectedId);
        return !isCompatible(selectedEnchant, e);
      });
      
      if (isIncompatible) {
        tr.classList.add("incompatible");
      }
      
      tr.innerHTML = `
        <td>${e.name?.[LANG] || e.id}</td>
        <td class="desc-cell">${e.description?.[LANG] || ""}</td>
        <td><div class="level-buttons"></div></td>
      `;
      
      const cell = tr.querySelector(".level-buttons");
      for (let lvl = 1; lvl <= e.max_level; lvl++) {
        const btn = document.createElement("button");
        btn.className = "level-button";
        btn.setAttribute("data-level", lvl);
        btn.textContent = toRoman(lvl);
        
        // 현재 선택된 레벨인 경우
        if (selectedMap[e.id] === lvl) {
          btn.classList.add("selected");
        }
        
        // 호환되지 않는 인챈트의 버튼은 비활성화
        if (isIncompatible && !selectedMap[e.id]) {
          btn.disabled = true;
        }
        
        btn.onclick = () => {
          const others = Object.keys(selectedMap).map((id) =>
            enchantments.find((x) => x.id === id)
          );
          
          if (selectedMap[e.id] === lvl) {
            delete selectedMap[e.id];
          } else {
            for (const o of others) {
              if (!isCompatible(o, e)) {
                showToast(`${o.name[LANG]}과(와) ${e.name[LANG]}는 호환되지 않습니다`);
                return;
              }
            }
            selectedMap[e.id] = lvl;
          }
          renderEnchantTable();
          renderResult();
        };
        
        cell.append(btn);
      }
      tb.append(tr);
    });
}

async function renderResult() {
  const costEl = document.getElementById("total-cost");
  const seqEl = document.getElementById("detail-seq");
  const ids = Object.keys(selectedMap);
  if (!chosenCategory || !chosenSlot || !ids.length) {
    costEl.textContent = "0";
    seqEl.innerHTML = "";
    return;
  }

  const books = ids.map((id) => ({
    ...enchantments.find((x) => x.id === id),
    level: selectedMap[id],
  }));

  console.log("🔍 선택 인챈트 목록:", books);

  const opt = await optimizeEnchants(books);
  if (opt.tooExpensive) {
    costEl.textContent = "너무 비쌉니다!";
    seqEl.innerHTML = "";
    return;
  }

  costEl.textContent = `${opt.cost}`;
  const flow = document.createElement("div");
  flow.className = "merge-flow";

  function formatEnchantName(data) {
    if (!data) {
      console.warn("⚠️ formatEnchantName: null 또는 undefined 입력", data);
      return { name: "???", image: null, isItem: false, description: "", level: 1 };
    }

    if (typeof data === "string") {
      if (data === chosenSlot) {
        const catArr = ITEM_CATEGORIES[chosenCategory] || [];
        const found = catArr.find((it) => it.slot === chosenSlot);
        return {
          name: found?.names?.[LANG] || data,
          image: `resources/images/${data}.gif`,
          isItem: true,
          description: "",
          level: 1
        };
      }
      const meta = enchantments.find((x) => x.id === data);
      const level = selectedMap?.[meta?.id] || 1;
      const enchantName = `<span class=\"enchant-name level-${level}\">${meta?.name?.[LANG] || data}${level > 1 ? " " + toRoman(level) : ""}</span>`;
      return {
        name: TRANSLATIONS[LANG].enchanted_book,
        image: "resources/images/book.gif",
        isItem: false,
        description: `${enchantName}<span class=\"enchant-desc\">${meta?.description?.[LANG] || ""}</span>`,
        level: level
      };
    }

    if (typeof data === "object") {
      if (data.I) {
        if (typeof data.I === "string") {
          if (data.I === chosenSlot) {
            const catArr = ITEM_CATEGORIES[chosenCategory] || [];
            const found = catArr.find((it) => it.slot === chosenSlot);
            return {
              name: found?.names?.[LANG] || data.I,
              image: `resources/images/${data.I}.gif`,
              isItem: true,
              description: "",
              level: 1
            };
          }
          const meta = enchantments.find((x) => x.id === data.I);
          const level = selectedMap?.[meta?.id] || Math.min(data.l || 1, meta?.max_level || 1);
          const enchantName = `<span class=\"enchant-name level-${level}\">${meta?.name?.[LANG] || data.I}${level > 1 ? " " + toRoman(level) : ""}</span>`;
          return {
            name: TRANSLATIONS[LANG].enchanted_book,
            image: "resources/images/book.gif",
            isItem: false,
            description: `${enchantName}<span class=\"enchant-desc\">${meta?.description?.[LANG] || ""}</span>`,
            level: level
          };
        }
        if (typeof data.I === "object") {
          const entries = Object.entries(data.I);
          const names = entries.map(([id, lvl]) => {
            const ench = enchantments.find((e) => e.id === id);
            const name = ench?.name?.[LANG] || id;
            const level = selectedMap?.[id] || Math.min(lvl, ench?.max_level || 1);
            return `<span class=\"enchant-name level-${level}\">${name}${level > 1 ? " " + toRoman(level) : ""}</span>`;
          });
          const descriptions = entries.map(([id, lvl]) => {
            const ench = enchantments.find((e) => e.id === id);
            return ench?.description?.[LANG] || "";
          });
          return {
            name: TRANSLATIONS[LANG].enchanted_book,
            image: "resources/images/book.gif",
            isItem: false,
            description: names.map((name, i) => 
              `${name}<span class=\"enchant-desc\">${descriptions[i]}</span>`
            ).join("\n"),
            level: Math.max(...entries.map(([id, lvl]) => selectedMap?.[id] || Math.min(lvl, (enchantments.find((e) => e.id === id)?.max_level || 1))))
          };
        }
      }
      if (data.L && data.R) {
        const left = formatEnchantName(data.L);
        const right = formatEnchantName(data.R);
        if (!left.isItem && !right.isItem) {
          return {
            name: TRANSLATIONS[LANG].enchanted_book,
            image: "resources/images/book.gif",
            isItem: false,
            description: left.description + "\n" + right.description,
            level: Math.max(left.level, right.level)
          };
        }
        let combinedName, combinedDescription;
        if (left.isItem) {
          combinedName = left.name;
          const leftLines = left.description ? left.description.split("\n") : [];
          const rightLines = right.description ? right.description.split("\n") : [];
          combinedDescription = [...leftLines, ...rightLines].filter(Boolean).join("\n");
        } else {
          combinedName = `${left.name} + ${right.name}`;
          const leftEnchants = left.description ? left.description.split("\n") : [];
          const rightEnchants = right.description ? right.description.split("\n") : [];
          combinedDescription = [...leftEnchants, ...rightEnchants].filter(Boolean).join("\n");
        }
        return {
          name: combinedName,
          image: left.isItem ? left.image : right.image,
          isItem: left.isItem || right.isItem,
          description: combinedDescription,
          level: Math.max(left.level, right.level)
        };
      }
    }
    console.warn("⚠️ formatEnchantName: 알 수 없는 형식", data);
    return { name: "???", image: null, isItem: false, description: "", level: 1 };
  }

  opt.steps.forEach((step, idx) => {
    console.log("📦 렌더링 단계:", step);
    const card = document.createElement("div");
    card.className = "merge-step";
    card.style.opacity = "0";
    card.style.transform = "translateY(20px)";

    const left = formatEnchantName(step.left);
    const right = formatEnchantName(step.right);
    const result = formatEnchantName(step.result || { L: step.left, R: step.right });

    card.innerHTML = `
      <div class="merge-header">
        <span class="merge-step-number">${idx + 1}</span>
        <span class="merge-step-title">${(() => {
          if (step.type === "아이템+책" || step.type === "아이템+결과물") {
            if (right.name === TRANSLATIONS[LANG].enchanted_book) {
              const match = right.description.match(/<span class=\"enchant-name(?: [^\"]*)?\">([^<]+)<\/span>/);
              return `아이템에 ${match ? match[1] : right.name} 인챈트 적용`;
            } else {
              return `아이템에 ${right.name} 인챈트 적용`;
            }
          }
          let leftName = left.name === TRANSLATIONS[LANG].enchanted_book
            ? (left.description.match(/<span class=\"enchant-name(?: [^\"]*)?\">([^<]+)<\/span>/) || [left.name,left.name])[1]
            : left.name;
          let rightName = right.name === TRANSLATIONS[LANG].enchanted_book
            ? (right.description.match(/<span class=\"enchant-name(?: [^\"]*)?\">([^<]+)<\/span>/) || [right.name,right.name])[1]
            : right.name;
          return `${leftName}과(와) ${rightName} 합성`;
        })()}</span>
      </div>
      <div class="merge-group">
        <div class="enchant-info ${left.isItem ? 'is-item' : ''}">
          <img src="${left.image}" alt="${left.name}" />
          <div class="enchant-tooltip">
            <div class="tooltip-header ${!left.isItem ? 'book' : ''}">${left.name}</div>
            <div class="tooltip-description">${left.description}</div>
          </div>
        </div>
        <div class="merge-plus">+</div>
        <div class="enchant-info ${right.isItem ? 'is-item' : ''}">
          <img src="${right.image}" alt="${right.name}" />
          <div class="enchant-tooltip">
            <div class="tooltip-header ${!right.isItem ? 'book' : ''}">${right.name}</div>
            <div class="tooltip-description">${right.description}</div>
          </div>
        </div>
        <div class="merge-equal">=</div>
        <div class="enchant-info ${result.isItem ? 'is-item' : ''}">
          <img src="${result.image}" alt="${result.name}" />
          <div class="enchant-tooltip">
            <div class="tooltip-header ${!result.isItem ? 'book' : ''}">${result.name}</div>
            <div class="tooltip-description">${result.description}</div>
          </div>
        </div>
      </div>
      <span class="enchant-level level-${step.cost}"> 레벨 ${step.cost}</span>
    `;

    requestAnimationFrame(() => {
      card.style.transition = "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)";
      card.style.opacity = "1";
      card.style.transform = "translateY(0)";
    });

    flow.append(card);
  });

  seqEl.innerHTML = "";
  seqEl.append(flow);
  
  // 터치 이벤트 핸들러 추가
  addTouchHandlers();
}

function toRoman(n) {
  const r = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  return r[n - 1] || n;
}

function isCompatible(a, b) {
  if (!a || !b) return true;
  if (Array.isArray(a.exclusive_with) && a.exclusive_with.includes(b.id))
    return false;
  if (Array.isArray(b.exclusive_with) && b.exclusive_with.includes(a.id))
    return false;
  return true;
}

const ITEM_CATEGORIES = {
  weapon: [
    { slot: "sword", names: { ko: "검" } },
    { slot: "axe", names: { ko: "도끼" } },
    { slot: "trident", names: { ko: "삼지창" } },
    { slot: "bow", names: { ko: "활" } },
    { slot: "crossbow", names: { ko: "석궁" } },
    { slot: "mace", names: { ko: "철퇴" } },
    { slot: "carrot_on_a_stick", names: { ko: "당근 낚싯대" } },
    { slot: "warped_fungus_on_a_stick", names: { ko: "워프드 낚싯대" } },
  ],
  tool: [
    { slot: "pickaxe", names: { ko: "곡괭이" } },
    { slot: "shovel", names: { ko: "삽" } },
    { slot: "hoe", names: { ko: "괭이" } },
    { slot: "shears", names: { ko: "가위" } },
    { slot: "fishing_rod", names: { ko: "낚싯대" } },
    { slot: "flint_and_steel", names: { ko: "부싯돌과 부시" } },
    { slot: "shield", names: { ko: "방패" } },
    { slot: "compass", names: { ko: "나침반" } },
    { slot: "brush", names: { ko: "브러쉬" } },
  ],
  armor: [
    { slot: "helmet", names: { ko: "헬멧" } },
    { slot: "chestplate", names: { ko: "가슴보호구" } },
    { slot: "leggings", names: { ko: "바지" } },
    { slot: "boots", names: { ko: "신발" } },
    { slot: "elytra", names: { ko: "겉날개" } },
    { slot: "turtle_shell", names: { ko: "거북이 등껍질" } },
    { slot: "pumpkin", names: { ko: "호박" } },
  ],
};

window.addEventListener("DOMContentLoaded", init);

function getInstructions(comb) {
    let instructions = [];
    let child_instructions;
    for (const key in comb) {
        if (key === 'L' || key === 'R') {
            if (typeof (comb[key].I) === 'undefined') {
                child_instructions = getInstructions(comb[key])
                child_instructions.forEach(single_instruction => {
                    instructions.push(single_instruction);
                })
            }
            let id;
            if (Number.isInteger(comb[key].I)) {
                id = comb[key].I
                comb[key].I = Object.keys(idList).find(key => idList[key] === id);
            } else if (typeof (comb[key].I) === 'string' && !Object.keys(idList).includes(comb[key].I)) {
                comb[key].I = itemName
            }
        }
    }
    let merge_cost = Number.isInteger(comb.R.v)
      ? comb.R.v + 2 ** comb.L.w - 1 + 2 ** comb.R.w - 1
      : comb.R.l + 2 ** comb.L.w - 1 + 2 ** comb.R.w - 1;
    let work = Math.max(comb.L.w, comb.R.w) + 1
    const single_instruction = [comb.L, comb.R, merge_cost, experience(merge_cost), 2 ** work - 1];
    instructions.push(single_instruction);
    return instructions;
}

function combinations(set, k) {
    let i, j, combs, head, tailcombs;

    if (k > set.length || k <= 0) {
        return [];
    }

    if (k === set.length) {
        return [set];
    }

    if (k === 1) {
        combs = [];
        for (i = 0; i < set.length; i++) {
            combs.push([set[i]]);
        }
        return combs;
    }

    combs = [];
    for (i = 0; i < set.length - k + 1; i++) {
        head = set.slice(i, i + 1);
        tailcombs = combinations(set.slice(i + 1), k - 1);
        for (j = 0; j < tailcombs.length; j++) {
            combs.push(head.concat(tailcombs[j]));
        }
    }
    return combs;
}

function hashFromItem(item_obj) {
    const enchants = item_obj.e;
    const sorted_ids = enchants.sort();
    const item_namespace = item_obj.i[0];
    const work = item_obj.w;
    return [item_namespace, sorted_ids, work];
}

function memoizeHashFromArguments(arguments) {
    let items = arguments[0];
    let hashes = new Array(items.length);

    items.forEach((item, index) => {
        hashes[index] = hashFromItem(item);
    });
    return hashes;
}

const memoizeCheapest = func => {
    return (...arguments) => {
        const args_key = memoizeHashFromArguments(arguments);
        if (!results[args_key]) {
            results[args_key] = func(...arguments);
        }
        return results[args_key];
    };
};

const cheapestItemsFromList = memoizeCheapest(items => {
    let work2item = {};
    const item_count = items.length;

    switch (item_count) {
        case 1: {
            const item = items[0];
            const work = item.w;
            work2item[work] = item;
            return work2item;
        }
        case 2: {
            const left_item = items[0],
                right_item = items[1];
            const cheapest_item = cheapestItemFromItems2(left_item, right_item);
            const cheapest_work = cheapest_item.w;
            work2item[cheapest_work] = cheapest_item;
            return work2item;
        }
        default: {
            return cheapestItemsFromListN(items, Math.floor(item_count / 2));
        }
    }
});

function cheapestItemFromItems2(left_item, right_item) {
    if (right_item.i === 'item') {
        return new MergeEnchants(right_item, left_item);
    } else if (left_item.i === 'item') {
        return new MergeEnchants(left_item, right_item);
    }

    let normal_item_obj;
    try {
        normal_item_obj = new MergeEnchants(left_item, right_item);
    } catch {
        return new MergeEnchants(right_item, left_item);
    }

    let reversed_item_obj;
    try {
        reversed_item_obj = new MergeEnchants(right_item, left_item);
    } catch {
        return normal_item_obj;
    }

    const cheapest_work2item = compareCheapest(normal_item_obj, reversed_item_obj);
    const prior_works = Object.keys(cheapest_work2item);
    const prior_work = prior_works[0];
    return cheapest_work2item[prior_work];
}

function cheapestItemsFromListN(items, max_subcount) {
    const cheapest_work2item = {};
    const cheapest_prior_works = [];

    for (let subcount = 1; subcount <= max_subcount; subcount++) {
        combinations(items, subcount).forEach(left_item => {
            const right_item = items.filter(item_obj => !left_item.includes(item_obj));

            const left_work2item = cheapestItemsFromList(left_item);
            const right_work2item = cheapestItemsFromList(right_item);
            const new_work2item = cheapestItemsFromDictionaries([left_work2item, right_work2item]);

            for (let work in new_work2item) {
                const new_item = new_work2item[work];
                const prior_work_exists = cheapest_prior_works.includes(work);

                if (prior_work_exists) {
                    const cheapest_item = cheapest_work2item[work];
                    const new_cheapest_work2item = compareCheapest(cheapest_item, new_item);
                    cheapest_work2item[work] = new_cheapest_work2item[work];
                } else {
                    cheapest_work2item[work] = new_item;
                    cheapest_prior_works.push(work);
                }
            }
        });
    }
    return cheapest_work2item;
}

function compareCheapest(item1, item2) {
    let work2item = {};

    const work1 = item1.w
    const work2 = item2.w

    if (work1 === work2) {
        const value1 = item1.l,
            value2 = item2.l;
        if (value1 === value2) {
            const min_xp_cost1 = item1.x,
                min_xp_cost2 = item2.x;
            if (min_xp_cost1 <= min_xp_cost2) {
                work2item[work1] = item1;
            } else {
                work2item[work2] = item2;
            }
        } else if (value1 < value2) {
            work2item[work1] = item1;
        } else {
            work2item[work2] = item2;
        }
    } else {
        work2item[work1] = item1;
        work2item[work2] = item2;
    }

    return work2item;
}

function cheapestItemsFromDictionaries(work2items) {
    const work2item_count = work2items.length;
    switch (work2item_count) {
        case 1:
            return work2items[0];
        case 2:
            const left_work2item = work2items[0],
                right_work2item = work2items[1];
            return cheapestItemsFromDictionaries2(left_work2item, right_work2item);
    }
}

function cheapestItemsFromDictionaries2(left_work2item, right_work2item) {
    let cheapest_work2item = {};
    const cheapest_prior_works = [];

    for (let left_work in left_work2item) {
        const left_item = left_work2item[left_work];

        for (let right_work in right_work2item) {
            const right_item = right_work2item[right_work];

            let new_work2item;
            try {
                new_work2item = cheapestItemsFromList([left_item, right_item]);
            } catch (error) {
                const merge_levels_too_expensive = error instanceof MergeLevelsTooExpensiveError;
                if (!merge_levels_too_expensive) {
                    throw error;
                }
            }

            for (let work in new_work2item) {
                const new_item = new_work2item[work];
                const prior_work_exists = cheapest_prior_works.includes(work);

                if (prior_work_exists) {
                    const cheapest_item = cheapest_work2item[work];
                    const new_cheapest_work2item = compareCheapest(cheapest_item, new_item);
                    cheapest_work2item[work] = new_cheapest_work2item[work];
                } else {
                    cheapest_work2item[work] = new_item;
                    cheapest_prior_works.push(work);
                }
            }
        }
    }
    cheapest_work2item = removeExpensiveCandidatesFromDictionary(cheapest_work2item);
    return cheapest_work2item;
}

class item_obj {
    constructor(name, value = 0, id = []) {
        this.i = name;
        this.e = id;
        this.c = {};
        this.w = 0;
        this.l = value;
        this.x = 0;
    }
}

class MergeEnchants extends item_obj {
    constructor(left, right) {
        const merge_cost = right.l + 2 ** left.w - 1 + 2 ** right.w - 1;
        if (merge_cost > MAXIMUM_MERGE_LEVELS) {
            throw new MergeLevelsTooExpensiveError();
        }
        let new_value = left.l + right.l;
        super(left.i, new_value);
        this.e = left.e.concat(right.e);
        this.w = Math.max(left.w, right.w) + 1;
        this.x = left.x + right.x + experience(merge_cost);
        this.c = {
            L: left.c,
            R: right.c,
            l: merge_cost,
            w: this.w,
            v: this.l
        };
    }
}

const experience = level => {
    if (level === 0) {
        return 0;
    } else if (level <= 16) {
        return level ** 2 + 6 * level
    } else if (level <= 31) {
        return 2.5 * level ** 2 - 40.5 * level + 360;
    } else {
        return 4.5 * level ** 2 - 162.5 * level + 2220;
    }
}

function removeExpensiveCandidatesFromDictionary(work2item) {
    const cheapest_work2item = {};
    let cheapest_value;

    for (let work in work2item) {
        const item = work2item[work];
        const value = item.l;

        if (!(value >= cheapest_value)) {
            cheapest_work2item[work] = item;
            cheapest_value = value;
        }
    }
    return cheapest_work2item;
}

class MergeLevelsTooExpensiveError extends Error {
    constructor(message = 'merge levels is above maximum allowed') {
        super(message);
        this.name = 'MergeLevelsTooExpensiveError';
    }
}

function showToast(message, duration = 3000) {
  console.log('showToast called with message:', message);

  // 기존 토스트 제거
  const existingContainer = document.getElementById("toast-container");
  if (existingContainer) {
    const existingToasts = existingContainer.querySelectorAll('.toast');
    existingToasts.forEach(toast => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    });
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  
  let container = document.getElementById("toast-container");
  console.log('Toast container found:', !!container);
  
  if (!container) {
    console.log('Creating new toast container');
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  
  container.appendChild(toast);
  console.log('Toast element created and added to container');
  
  // Force reflow
  toast.offsetHeight;
  
  requestAnimationFrame(() => {
    toast.classList.add("show");
    console.log('Toast show class added');
  });
  
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
      console.log('Toast removed');
    }, 300);
  }, duration);
}

// 터치 이벤트 핸들러 추가
function addTouchHandlers() {
  document.querySelectorAll('.enchant-info').forEach(info => {
    let touchTimeout;
    
    info.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const tooltip = info.querySelector('.enchant-tooltip');
      if (tooltip) {
        tooltip.style.opacity = '1';
        tooltip.style.visibility = 'visible';
      }
    }, { passive: false });
    
    info.addEventListener('touchend', (e) => {
      e.preventDefault();
      const tooltip = info.querySelector('.enchant-tooltip');
      if (tooltip) {
        tooltip.style.opacity = '0';
        tooltip.style.visibility = 'hidden';
      }
    }, { passive: false });
    
    // 다른 곳을 터치했을 때 툴팁 닫기
    document.addEventListener('touchstart', (e) => {
      if (!info.contains(e.target)) {
        const tooltip = info.querySelector('.enchant-tooltip');
        if (tooltip) {
          tooltip.style.opacity = '0';
          tooltip.style.visibility = 'hidden';
        }
      }
    });
  });
}