if (window.__CC_CLIENT_CONSOLE_INIT__) {
  // already inited
} else {
  window.__CC_CLIENT_CONSOLE_INIT__ = true;
/* ======================
 * CONFIG
 * ====================== */
const USE_JSONP = true; // Вариант A: false (WebApp UI). Вариант B (Tilda): true
const API_BASE = "https://script.google.com/macros/s/AKfycbzXBhHR6yTG-dSduF4L7l61Pbs-L4OmJXs2-T2t-ylQ6PtB4yyLMyn3KL4udQ6YjswF/exec";
const API_PROXY_BASE = "";

const STORE_KEY = "profid_client_console_v1";
const S = {
  get(){ try{ return JSON.parse(sessionStorage.getItem(STORE_KEY)||"{}"); }catch(_){ return {}; } },
  set(o){ sessionStorage.setItem(STORE_KEY, JSON.stringify(o||{})); },
  clear(){ sessionStorage.removeItem(STORE_KEY); }
};

function baseUrl_(){
  if (API_BASE && API_BASE.trim()) return API_BASE.trim();
  return location.href.split("?")[0];
}

function qs_(obj){
  const p = new URLSearchParams();
  Object.keys(obj||{}).forEach(k=>{
    const v = obj[k];
    if (v === undefined || v === null || v === "") return;
    p.set(k, String(v));
  });
  return p.toString();
}

function nowLocal_(){
  const d=new Date();
  return d.toLocaleString("ru-RU",{hour12:false});
}

const DEBUG = /[?&]debug=1\b/.test(location.search);
const DBG = [];
let SKILLS_CACHE = null;
function dbg_(msg){
  if(!DEBUG) return;
  const line = "[" + nowLocal_() + "] " + String(msg||"");
  DBG.push(line);
  if(DBG.length > 220) DBG.shift();

  let el = document.getElementById("ccDebug");
  if(!el){
    el = document.createElement("pre");
    el.id = "ccDebug";
    el.className = "cc-debug";
    (document.body || document.documentElement).appendChild(el);
  }
  el.textContent = DBG.join("\n");
}
window.addEventListener("error", (e)=> dbg_("ERROR: " + (e && e.message ? e.message : String(e))));
window.addEventListener("unhandledrejection", (e)=> dbg_("PROMISE: " + (e && e.reason ? (e.reason.message || String(e.reason)) : "unhandled")));

function b64u_(s){
  // unicode-safe base64
  const u = encodeURIComponent(s).replace(/%([0-9A-F]{2})/g, (_,p)=>String.fromCharCode(parseInt(p,16)));
  return btoa(u);
}

function jsonp_(url, timeoutMs){
  const tm = Number(timeoutMs || 12000);
  return new Promise((resolve,reject)=>{
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const s = document.createElement("script");
    s.referrerPolicy = "no-referrer";
    s.crossOrigin = "anonymous";

    const sep = url.includes("?") ? "&" : "?";
    let done = false;

    const cleanup = ()=>{
      if(done) return;
      done = true;
      try{ delete window[cb]; }catch(_){}
      try{ s.remove(); }catch(_){}
    };

    const timer = setTimeout(()=>{
      cleanup();
      reject(new Error("JSONP_TIMEOUT"));
    }, tm);

    window[cb] = (data)=>{
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    s.onerror = ()=>{
      clearTimeout(timer);
      cleanup();
      reject(new Error("JSONP_LOAD_ERROR"));
    };

    s.async = true;
    s.src = url + sep + "callback=" + cb + "&_=" + Date.now();
    document.head.appendChild(s);
  });
}

async function fetchJson_(url){
  const r = await fetch(url, { method:"GET", credentials:"omit" });
  const t = await r.text();
  try{ return JSON.parse(t); }catch(_){ return { ok:false, error:"bad_json", raw:t }; }
}

async function api_(action, params){
  const q = qs_(Object.assign({ action }, (params || {})));
  const url = baseUrl_() + "?" + q;

  const px = (API_PROXY_BASE && API_PROXY_BASE.trim()) ? API_PROXY_BASE.trim().replace(/\?$/,"") : "";
  const purl = px ? (px + "?" + q) : "";

  const getJson_ = async (u) => {
    const r = await fetch(u, { method: "GET", credentials: "omit" });
    const t = await r.text();
    try { return JSON.parse(t); }
    catch(_) { return { ok:false, error:"bad_json", raw:t }; }
  };

  dbg_("API " + action);

  let out;
  try{
    out = USE_JSONP ? await jsonp_(url) : await getJson_(url);
  }catch(e){
    const msg = (e && e.message) ? e.message : String(e);
    dbg_("API_FAIL " + action + " " + msg);

    // fallback: если JSONP упал и задан proxy — повторяем через fetch (CORS-safe)
    if (USE_JSONP && purl){
      try{
        dbg_("API_RETRY_PROXY " + action);
        out = await getJson_(purl);
      }catch(e2){
        const msg2 = (e2 && e2.message) ? e2.message : String(e2);
        dbg_("API_FAIL_PROXY " + action + " " + msg2);
        return { ok:false, error: msg };
      }
    } else {
      return { ok:false, error: msg };
    }
  }

if (DEBUG){
  try{
    const s = JSON.stringify(out);
    dbg_("API_OK " + action + " " + s.slice(0, 2200));
  }catch(e){
    dbg_("API_OK " + action + " (non-json)");
  }
}

  if (out && out.session_invalid){
    dbg_("SESSION_INVALID");
    localStorage.removeItem(LSK);
    showAuth_();
    return { ok:false, error:"session_invalid" };
  }

  return out;
}

function normClientId_(v){
  return String(v||"").replace(/\D/g,"").slice(0,8);
}

function setAuthMsg_(txt){
  const el=document.getElementById("authMsg");
  if(!txt){ el.classList.add("hidden"); el.textContent=""; return; }
  el.textContent=txt;
  el.classList.remove("hidden");
}

function setPlanErr_(txt){
  const el=document.getElementById("planErr");
  if(!txt){ el.classList.add("hidden"); el.textContent=""; return; }
  el.textContent=txt;
  el.classList.remove("hidden");
}

function showSaved_(whenStr){
  const box=document.getElementById("planSaved");
  const at=document.getElementById("planSavedAt");
  at.textContent = whenStr ? ("Обновлено: " + whenStr) : ("Обновлено: " + nowLocal_());
  box.classList.remove("hidden");
  setTimeout(()=>box.classList.add("hidden"), 3500);
}

/* ======================
 * UI wiring
 * ====================== */
document.querySelectorAll(".cc-tab").forEach(b=>{
b.addEventListener("click", async ()=>{
if (b.classList.contains("disabled")) return;
const tab = b.dataset.tab;
activateTab_(tab);


if (tab === "identity") return await loadIdentity_();
if (tab === "experience") return await loadExperience_();
if (tab === "skills") return await loadSkills_();
if (tab === "plan") return await loadPlan_();
return await loadDashboard_();
});
});

function activateTab_(tab){
  document.querySelectorAll(".cc-tab").forEach(b=>{
    b.classList.toggle("active", b.dataset.tab === tab);
  });


const map = { dashboard:"pageDashboard", identity:"pageIdentity", experience:"pageExperience", skills:"pageSkills", plan:"pagePlan" };

  Object.keys(map).forEach(k=>{
    document.getElementById(map[k]).classList.toggle("hidden", k!==tab);
  });
}

const PLAN_MAX_STEPS = 6;
const PLAN_DURATION_OPTS = ["3 месяца","6 месяцев","1 год","2 года"];
const PLAN_STATUS_OPTS = ["Завершено","В процессе","Нужна помощь"];
let PLAN_BASELINE_STR = "";
let PLAN_SAVING = false;

function planFirstLine_(txt){
  const s = String(txt||"").trim();
  if(!s) return "";
  const i = s.search(/[\r\n]/);
  return (i>=0 ? s.slice(0,i) : s).trim();
}
function planMonthLabel_(ym){
  const m = String(ym||"").match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[2]}/${m[1]}` : String(ym||"");
}
function planPillsHtml_(dl, st){
  const a = dl ? `<span class="cc-pill cc-mini cc-planPill cc-planPill--date">${escapeHtml(planMonthLabel_(dl))}</span>` : ``;
  const b = st ? `<span class="cc-pill cc-mini cc-planPill cc-planPill--status">${escapeHtml(st)}</span>` : ``;
  return a + b;
}
function planStatusBadgeClass_(st){
  const s = String(st||"").trim().toLowerCase();
  if(!s) return "cc-planBadge--empty";
  if(s.includes("помощ") || s.includes("help")) return "cc-planBadge--pause";
  if(s.includes("заверш")) return "cc-planBadge--done";
  if(s.includes("пауз")) return "cc-planBadge--pause";
  if(s.includes("работ") || s.includes("процесс")) return "cc-planBadge--work";
  return "cc-planBadge--work";
}

function planStepMeta_(stepTxt, dl, st){
  const a = String(stepTxt||"").trim() ? 1 : 0;
  const b = String(dl||"").trim() ? 1 : 0;
  const c = String(st||"").trim() ? 1 : 0;

  const filled = a + b + c;
  const cls = filled === 0 ? "cc-planStepDot--empty" : (filled === 3 ? "cc-planStepDot--done" : "cc-planStepDot--partial");
  return { filled, total: 3, cls };
}
function planStepDotClass_(stepTxt, dl, st){
  return planStepMeta_(stepTxt, dl, st).cls;
}

function planUpdateProgress_(plan){
  const p = plan || collectPlan_();

  const baseTotal = 2; // Название проекта + Цель
  const baseFilled =
    (String(p.project_name||"").trim() ? 1 : 0) +
    (String(p.goal||"").trim() ? 1 : 0);

    const stepsArr = Array.isArray(p.steps) ? p.steps : [];
  const stepsTotal = stepsArr.length; // считаем каждый шаг
  let stepsDone = 0;

  for (let i = 0; i < stepsArr.length; i++) {
    const s = stepsArr[i] || {};
    const st = String(s.status || "").trim();
    const meta = planStepMeta_(s.step || "", normMonth_(s.deadline || ""), st);
    if (meta.filled === meta.total) stepsDone += 1;
  }

  const total = baseTotal + stepsTotal;
  const filled = baseFilled + stepsDone;
  const pct = total ? Math.round((filled / total) * 100) : 0;

  const fill = document.getElementById("planProgressFill");
  const tx = document.getElementById("planProgressText");
  if(fill) fill.style.width = pct + "%";
  if(tx) tx.textContent = pct + "%";

  const k1 = document.getElementById("planKpiFilled");
  if(k1) k1.textContent = `${filled}/${total}`;

  const k2 = document.getElementById("planKpiSteps");
  if(k2) k2.textContent = `${stepsDone}/${stepsTotal}`;

const hint = document.getElementById("planActionHint");
if (hint) {
  const idx = (typeof PLAN_OPEN_STEP_IDX === "number" && PLAN_OPEN_STEP_IDX >= 0) ? PLAN_OPEN_STEP_IDX : (() => {
    for (let i = 0; i < stepsArr.length; i++) {
      const s = stepsArr[i] || {};
      const st = String(s.status || "").trim();
      const meta = planStepMeta_(s.step || "", normMonth_(s.deadline || ""), st);
      if (meta.filled !== meta.total) return i;
    }
    return 0;
  })();

  const s = stepsArr[idx] || {};
  const miss = [];
  if (!String(s.step || "").trim()) miss.push("заполните достижение");
  if (!String(normMonth_(s.deadline || "")).trim()) miss.push("выберите срок");
  if (!String(s.status || "").trim()) miss.push("выберите статус");

  hint.textContent = miss.length
    ? ("Чтобы завершить шаг " + (idx + 1) + ": " + miss.join(", ") + ".")
    : ("Отлично: шаг " + (idx + 1) + " заполнен по ядру.");
}
}

function planNormalizeLayout_(){
  const page = document.getElementById("pagePlan");
  if(!page || page.dataset.planNorm === "1") return;
  page.dataset.planNorm = "1";

  // 1) Убираем дубль заголовка "Профессиональный план" внутри формы (оставляем только topbar)
  const bar = document.getElementById("planTopbar");
  const heads = page.querySelectorAll("h1,h2,h3,h4,.cc-h1,.cc-h2,.cc-h3,.cc-title,.cc-pageTitle");
  for(const el of heads){
    const t = (el.textContent || "").replace(/\s+/g," ").trim();
    if(t === "Профессиональный план" && !(bar && bar.contains(el))){
      el.remove();
      break;
    }
  }

  // 2) Сплющиваем лишний вложенный контейнер вокруг шагов (если он реально вложен "карточкой в карточке")
  const acc = document.getElementById("plStepsAcc");
  if(!acc) return;

  const inner = acc.closest(".cc-card,.cc-panel,.cc-box");
  if(!inner) return;

  // Если внутри другой оболочки такого же типа — считаем это "лишним контейнером"
  const outer = inner.parentElement && inner.parentElement.closest(".cc-card,.cc-panel,.cc-box");
  if(outer && outer !== inner){
    inner.classList.add("cc-planFlatCard");
  }
  // 3) Убираем лишний "Шаги" и inline margin-top у блока шагов (legacy разметка Tilda)
  const tbody = document.getElementById("plStepsBody");
  if(tbody){
    const wrap = tbody.closest(".plan-table-wrap");
    const block = wrap ? wrap.parentElement : null; // это div style="margin-top:14px;"
    if(block){
      if(block.style && block.style.marginTop) block.style.marginTop = "0px";
      const lbls = block.querySelectorAll(".cc-label");
      for(const el of lbls){
        const t = (el.textContent||"").replace(/\s+/g," ").trim();
        if(t === "Шаги"){ el.remove(); break; }
      }
    }
  }
}

function planSetUpdatedAt_(whenStr){
  const el = document.getElementById("planUpdatedInline");
  if(el) el.textContent = whenStr ? ("Обновлено: " + whenStr) : "";
}
function planSetDirty_(dirty){
  const btn = document.getElementById("btnSavePlan");
  if(btn) btn.disabled = PLAN_SAVING || !dirty;
}
function planRecalcDirty_(){
  let dirty = false;
  let plan = null;

  try{
    plan = collectPlan_();
    const s = JSON.stringify(plan);
    dirty = (s !== PLAN_BASELINE_STR);
  }catch(_){
    dirty = true;
  }
  planSetDirty_(dirty);
  planUpdateProgress_(plan);
  return dirty;
}
function planSetBaselineFromDom_(){
  try{ PLAN_BASELINE_STR = JSON.stringify(collectPlan_()); }catch(_){ PLAN_BASELINE_STR = ""; }
  planSetDirty_(false);
}
function planSyncStepSummary_(target){
  const t = target;
  if(!t || !t.dataset || !t.dataset.k) return;
  const card = t.closest && t.closest(".cc-planStep");
  if(!card) return;

  const i = t.dataset.i;
  const stepEl = card.querySelector(`[data-k="step"][data-i="${i}"]`);
  const dlEl   = card.querySelector(`[data-k="deadline"][data-i="${i}"]`);
  const stEl   = card.querySelector(`[data-k="status"][data-i="${i}"]`);

  const stepTxt = stepEl ? String(stepEl.value||"") : "";
  const dl = normMonth_(dlEl ? dlEl.value : "");
  const st = stEl ? String(stEl.value||"").trim() : "";

const achEl = card.querySelector("[data-cc-plan-ach]");
if(achEl){
  const line = planFirstLine_(stepTxt);
  achEl.innerHTML = line ? escapeHtml(line) : `<span class="cc-planEmpty">Заполните достижение</span>`;
}

const dlEl2 = card.querySelector("[data-cc-plan-deadline]");
if(dlEl2){
  dlEl2.innerHTML = dl ? escapeHtml(planMonthLabel_(dl)) : `<span class="cc-planEmpty">Срок не выбран</span>`;
}

const stEl2 = card.querySelector("[data-cc-plan-status]");
if(stEl2){
  stEl2.textContent = st ? st : "Статус не выбран";
  stEl2.className = "cc-planBadge " + planStatusBadgeClass_(st);
}

  const meta = planStepMeta_(stepTxt, dl, st);
  const dot = card.querySelector(".cc-planStepDot");
  if(dot){
    dot.classList.remove("cc-planStepDot--empty","cc-planStepDot--partial","cc-planStepDot--done");
    dot.classList.add(meta.cls);
  }
  const cnt = card.querySelector(".cc-planStepCount");
  if(cnt) cnt.textContent = `${meta.filled}/${meta.total}`;
}
function ensurePlanUi_(){
  // duration -> select (без правки HTML)
  const d = document.getElementById("plDuration");
  if(d && d.tagName !== "SELECT"){
    const sel = document.createElement("select");
    sel.id = d.id;
    sel.className = d.className || "cc-input";
    sel.name = d.name || "";
    sel.setAttribute("aria-label", d.getAttribute("aria-label") || "Длительность");
    sel.innerHTML =
      `<option value=""></option>` +
      PLAN_DURATION_OPTS.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");
    d.parentNode.replaceChild(sel, d);
  }

  // прячем старую таблицу и создаём контейнер под аккордеоны
  const tbody = document.getElementById("plStepsBody");
  if(tbody){
    const table = tbody.closest("table");
    const wrap  = table ? table.closest(".plan-table-wrap") : null;

    // Куда вставлять новый аккордеон (до legacy-контейнера)
    const host   = (wrap && wrap.parentNode) ? wrap.parentNode : (table && table.parentNode) ? table.parentNode : tbody.parentNode;
    const anchor = wrap || table || tbody;

    let acc = document.getElementById("plStepsAcc");
    if(!acc){
      acc = document.createElement("div");
      acc.id = "plStepsAcc";
      acc.className = "cc-planSteps";
      host.insertBefore(acc, anchor);
    }

    // legacy UI больше не нужен: убираем контейнер целиком (это и есть "лишний контейнер")
    if(wrap) wrap.remove();
    else if(table) table.remove();

    let add = document.getElementById("btnAddPlanStep");
    if(!add){
      add = document.createElement("button");
      add.type = "button";
      add.id = "btnAddPlanStep";
      add.className = "cc-btn cc-planAdd";
      add.textContent = "Добавить шаг";
      acc.insertAdjacentElement("afterend", add);
    }

    let hint = document.getElementById("planStepLimitHint");
    if(!hint){
      hint = document.createElement("div");
      hint.id = "planStepLimitHint";
      hint.className = "cc-planHint hidden";
      hint.textContent = "Максимум 6 шагов";
      add.insertAdjacentElement("afterend", hint);
    }

    if(add && add.dataset.bound !== "1"){
      add.dataset.bound = "1";
      add.addEventListener("click", ()=>{
        const plan = collectPlan_();
        plan.steps = Array.isArray(plan.steps) ? plan.steps : [];
        if(plan.steps.length >= PLAN_MAX_STEPS) return;
        plan.steps.push({});
        renderStepsRows_(plan.steps, plan.steps.length - 1);
        planRecalcDirty_();
      });
    }
  }

    // SAVE sticky bar inside pagePlan + inline updated_at + progress
  const page = document.getElementById("planShell") || document.getElementById("pagePlan");
  const btn = document.getElementById("btnSavePlan");

  if(btn && !btn.querySelector(".cc-btn-spinner")){
    const sp = document.createElement("span");
    sp.className = "cc-btn-spinner hidden";
    btn.appendChild(sp);
  }
  if(page) page.classList.add("cc-planPage");

  if(page && btn && page.contains(btn)){
    let bar = document.getElementById("planTopbar");
    if(!bar){
      bar = document.createElement("div");
      bar.id = "planTopbar";
      bar.className = "cc-planTopbar";

      const row = document.createElement("div");
      row.className = "cc-planTopbarRow";

      const left = document.createElement("div");
      left.className = "cc-planTopbarLeft";
      left.innerHTML = `
        <div class="cc-planTopbarTitle">Профессиональный план</div>
        <div class="cc-planTopbarSub">Заполните поля и шаги — прогресс отразится ниже.</div>
      `;

      const right = document.createElement("div");
      right.className = "cc-planTopbarRight";

      const upd = document.createElement("div");
      upd.id = "planUpdatedInline";
      upd.className = "cc-planUpdated";

          right.appendChild(upd);

      // move "Добавить шаг" into topbar рядом с "Сохранить"
      const addTop = document.getElementById("btnAddPlanStep");
      if(addTop){
        addTop.classList.add("cc-planAddTop");
        right.appendChild(addTop);
      }

      right.appendChild(btn);
      row.appendChild(left);
      row.appendChild(right);

      const prog = document.createElement("div");
      prog.className = "cc-planProgress";
            prog.innerHTML = `
        <div class="cc-planProgressBar"><div id="planProgressFill" class="cc-planProgressFill" style="width:0%"></div></div>
        <div class="cc-planKpis">
          <span class="cc-planKpi"><span class="cc-planKpiLbl">Заполнено</span> <span id="planKpiFilled" class="cc-planKpiVal">0/0</span></span>
          <span class="cc-planKpiSep"></span>
          <span class="cc-planKpi"><span class="cc-planKpiLbl">Шаги</span> <span id="planKpiSteps" class="cc-planKpiVal">0/0</span></span>
        </div>
        <div id="planActionHint" class="cc-planActionHint"></div>
        <div id="planProgressText" class="cc-planProgressText">0%</div>
      `;


      bar.appendChild(row);
      bar.appendChild(prog);

      page.insertBefore(bar, page.firstChild);
      planNormalizeLayout_();
    }
  }
  planNormalizeLayout_();

  // dirty binding (anti-spam: save кнопка уже блокируется через PLAN_SAVING)
  if(page && page.dataset.planBound !== "1"){
    page.dataset.planBound = "1";
    page.addEventListener("input",(e)=>{ planSyncStepSummary_(e.target); planRecalcDirty_(); });
    page.addEventListener("change",(e)=>{ planSyncStepSummary_(e.target); planRecalcDirty_(); });
  }
}

function normMonth_(v){
  const s = String(v||"").trim();
  if(!s) return "";
  if(/^\d{4}-\d{2}$/.test(s)) return s;        // input[type=month]
  const m = s.match(/^(\d{2})\.(\d{4})$/);     // на случай старых значений "MM.YYYY"
  if(m) return `${m[2]}-${m[1]}`;
  return s;
}
function planNeedMonthPickerFallback_(){
  return /firefox/i.test(navigator.userAgent || "");
}

function planEnhanceMonthPickers_(root){
  if(!root || !planNeedMonthPickerFallback_()) return;

  const months = [
    ["01","январь"],["02","февраль"],["03","март"],["04","апрель"],
    ["05","май"],["06","июнь"],["07","июль"],["08","август"],
    ["09","сентябрь"],["10","октябрь"],["11","ноябрь"],["12","декабрь"]
  ];

  const nowY = (new Date()).getFullYear();
  const yMin = nowY - 1;
  const yMax = nowY + 10;

  root.querySelectorAll('input[type="month"][data-k="deadline"]').forEach((inp)=>{
    if(inp.dataset.ccMonthPick === "1") return;
    inp.dataset.ccMonthPick = "1";

    const v = normMonth_(inp.value);
    const y0 = v ? v.slice(0,4) : "";
    const m0 = v ? v.slice(5,7) : "";

    const wrap = document.createElement("div");
    wrap.className = "cc-monthPick";

    const selM = document.createElement("select");
    selM.className = "cc-input";
    selM.setAttribute("aria-label","Месяц");
    selM.innerHTML = `<option value=""></option>` + months.map(([mm,lab]) =>
      `<option value="${mm}">${lab}</option>`
    ).join("");

    const selY = document.createElement("select");
    selY.className = "cc-input";
    selY.setAttribute("aria-label","Год");
    let yHtml = `<option value=""></option>`;
    for(let y=yMin; y<=yMax; y++) yHtml += `<option value="${y}">${y}</option>`;
    selY.innerHTML = yHtml;

    if(m0) selM.value = m0;
    if(y0) selY.value = y0;

    const commit = ()=>{
      const yy = selY.value;
      const mm = selM.value;
      const next = (yy && mm) ? `${yy}-${mm}` : "";
      if(inp.value === next) return;
      inp.value = next;
      inp.dispatchEvent(new Event("change",{bubbles:true}));
    };

    selM.addEventListener("change", commit);
    selY.addEventListener("change", commit);

    const field = inp.parentNode;
    field.insertBefore(wrap, inp);
    wrap.appendChild(selM);
    wrap.appendChild(selY);

    inp.type = "hidden";
    wrap.appendChild(inp);
  });
}

function planStepItemHtml_(s,i){
  const stepTxt = String(s.step||"").trim();
  const dl = normMonth_(s.deadline||"");
  const st = String(s.status||"").trim();
  const meta = planStepMeta_(stepTxt, dl, st);
  const dot = `<span class="cc-planStepDot ${meta.cls}" aria-hidden="true"></span>`;
  const count = `<span class="cc-planStepCount">${meta.filled}/${meta.total}</span>`;

  const line = planFirstLine_(stepTxt);
  const ach = line ? escapeHtml(line) : `<span class="cc-planEmpty">Заполните достижение</span>`;
  const dlLbl = dl ? escapeHtml(planMonthLabel_(dl)) : `<span class="cc-planEmpty">Срок не выбран</span>`;
  const stLbl = st ? escapeHtml(st) : `<span class="cc-planEmpty">Статус не выбран</span>`;
  const stCls = planStatusBadgeClass_(st);

  const stOptions =
    `<option value=""></option>` +
    PLAN_STATUS_OPTS.map(x=>`<option value="${escapeHtml(x)}"${x===st ? " selected" : ""}>${escapeHtml(x)}</option>`).join("");

  return `
    <div class="cc-card cc-planStep" data-cc-acc>
      <div class="cc-planStepHead" data-cc-acc-preview>
        <div class="cc-planStepLeft">
          ${dot}
          <div class="cc-planStepTitle">Шаг ${i+1} ${count}</div>
        </div>

        <div class="cc-planSummary" aria-label="Резюме шага">
          <div class="cc-planSumAch" data-cc-plan-ach>${ach}</div>
          <div class="cc-planSumDl" data-cc-plan-deadline>${dlLbl}</div>
          <div class="cc-planSumSt">
            <span class="cc-planBadge ${stCls}" data-cc-plan-status>${stLbl}</span>
          </div>
        </div>

        <div class="cc-planStepRight">
          <button class="cc-planStepChevron" data-cc-acc-btn aria-expanded="false" aria-label="Открыть/закрыть шаг">
          <span class="cc-visuallyHidden">Открыть/закрыть шаг</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </div>
      </div>

      <div class="cc-planFull" data-cc-acc-full style="display:none;">
   <div class="cc-planReqHead">
  <div class="cc-planReqTitle">Обязательное (ядро шага)</div>
  <div class="cc-planReqHint">Чтобы шаг считался заполненным: укажите достижение, сроки и статус</div>
</div>

<div class="cc-planGrid cc-planGrid--top">
  <div class="cc-planField cc-planField--wide">
    <div class="cc-planLabel">Достижение</div>
    <textarea class="cc-input" data-k="step" data-i="${i}" maxlength="800">${escapeHtml(stepTxt)}</textarea>
  </div>

<div class="cc-planField cc-planField--deadline">
  <div class="cc-planLabel">Сроки (месяц/год)</div>
  <input ... data-k="deadline" ...>
</div>

<div class="cc-planField cc-planField--status">
  <div class="cc-planLabel">Статус</div>
  <select ... data-k="status" ...></select>
</div>

<div class="cc-planField cc-planField--comments">
  <div class="cc-planLabel">Комментарий (опционально)</div>
  <textarea ... data-k="comments" ...></textarea>
</div>

</div>

<button type="button" class="cc-planOptToggle" data-cc-plan-opt-toggle="1" aria-expanded="false">
  Уточнить планирование (ресурсы, риски, поддержка)
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
</button>

<div class="cc-planOptBox" data-cc-plan-opt-box style="display:none;">

        <div class="cc-planGrid cc-planGrid--bottom">
          <div class="cc-planField">
            <div class="cc-planLabel">Ресурсы</div>
            <textarea class="cc-input" data-k="resources" data-i="${i}" maxlength="800">${escapeHtml(String(s.resources||"").trim())}</textarea>
          </div>
          <div class="cc-planField">
            <div class="cc-planLabel">Поддержка и контроль</div>
            <textarea class="cc-input" data-k="support" data-i="${i}" maxlength="800">${escapeHtml(String(s.support||"").trim())}</textarea>
          </div>
          <div class="cc-planField">
            <div class="cc-planLabel">Препятствия</div>
            <textarea class="cc-input" data-k="obstacles" data-i="${i}" maxlength="800">${escapeHtml(String(s.obstacles||"").trim())}</textarea>
          </div>
          <div class="cc-planField">
            <div class="cc-planLabel">Запасные варианты</div>
            <textarea class="cc-input" data-k="fallback" data-i="${i}" maxlength="800">${escapeHtml(String(s.fallback||"").trim())}</textarea>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderStepsRows_(steps, openIndex){
  ensurePlanUi_();

  const acc = document.getElementById("plStepsAcc");
  if(!acc) return;

  let arr = Array.isArray(steps) ? steps.slice(0, PLAN_MAX_STEPS) : [];
  if(!arr.length) arr = [{}];

  acc.innerHTML = arr.map((s,i)=> planStepItemHtml_(s||{}, i)).join("");
  planEnhanceMonthPickers_(acc);

  const add = document.getElementById("btnAddPlanStep");
  if(add) add.disabled = arr.length >= PLAN_MAX_STEPS;

  const hint = document.getElementById("planStepLimitHint");
  if(hint) hint.classList.toggle("hidden", !(add && add.disabled));

  // биндим аккордеон как в других блоках
  bindMiniAccordion_(acc);
  bindPlanOptToggles_(acc);

  // авто-раскрыть новый шаг
  if(openIndex != null){
    const btn = acc.querySelectorAll("[data-cc-acc-btn]")[openIndex];
    if(btn){
      btn.click();
      const ta = acc.querySelector(`[data-i="${openIndex}"][data-k="step"]`);
      if(ta && ta.focus) ta.focus();
    }
  }
}

function collectPlan_(){
  const plan = {
    project_name: (document.getElementById("plProject").value || "").trim(),
    duration: (document.getElementById("plDuration").value || "").trim(),
    goal: (document.getElementById("plGoal").value || "").trim(),
    steps: []
  };

  const acc = document.getElementById("plStepsAcc");
  const cards = acc ? acc.querySelectorAll(".cc-planStep") : [];
  const n = cards && cards.length ? Math.min(cards.length, PLAN_MAX_STEPS) : 1;

  for(let i=0;i<n;i++){
    const get = (k)=>{
      const el = acc ? acc.querySelector(`[data-k="${k}"][data-i="${i}"]`) : null;
      return el ? String(el.value||"").trim() : "";
    };
    plan.steps.push({
      step: get("step"),
      deadline: normMonth_(get("deadline")),
      status: get("status"),
      comments: get("comments"),
      resources: get("resources"),
      support: get("support"),
      obstacles: get("obstacles"),
      fallback: get("fallback")
    });
  }

  return plan;
}

function fillPlan_(plan, updatedAt){
  ensurePlanUi_();
  const p = plan || {};
  document.getElementById("plProject").value = p.project_name || "";
  document.getElementById("plDuration").value = p.duration || "";
  document.getElementById("plGoal").value = p.goal || "";
  renderStepsRows_(p.steps || []);
  planSetUpdatedAt_(updatedAt || p.updated_at || "");
  planSetBaselineFromDom_();
  planUpdateProgress_();
}

/* ======================
 * App logic
 * ====================== */
async function bootstrap_(){
  // steps rows сразу
  renderStepsRows_([]);
  ensurePlanUi_();
  planSetBaselineFromDom_();

  document.getElementById("btnLogout").addEventListener("click", ()=>{
    S.clear();
    document.getElementById("appPane").classList.add("hidden");
    document.getElementById("authPane").classList.remove("hidden");
    setAuthMsg_("");
  });

document.getElementById("btnReload").addEventListener("click", async ()=>{
  const st=S.get();
  if(!st.client_id || !st.session_token) return;

  const ab = document.querySelector(".cc-tab.active");
  const tab = ab ? ab.dataset.tab : "dashboard";

  if (tab === "identity") return await loadIdentity_();
  if (tab === "experience") return await loadExperience_();
  if (tab === "skills") return await loadSkills_();
  if (tab === "plan") return await loadPlan_();
  return await loadDashboard_();
});

  document.getElementById("btnLogin").addEventListener("click", login_);
  document.getElementById("btnSavePlan").addEventListener("click", savePlan_);

  // авто-вход по сессии
  const st=S.get();
  if(st && st.verified && st.client_id && st.session_token){
    const ok = await sessionPing_();
    if(ok){
      showApp_();
      await loadDashboard_();
      await loadPlan_();
      return;
    }
    S.clear();
  }
}

async function login_(){
  setAuthMsg_("");
  const btn = document.getElementById("btnLogin");
  const tx = btn ? btn.querySelector(".cc-btn-text") : null;
  const sp = btn ? btn.querySelector(".cc-btn-spinner") : null;

  const client_id = normClientId_(document.getElementById("inClientId").value);
  const contact = String(document.getElementById("inContact").value||"").trim();

  if(!client_id) return setAuthMsg_("Введите client_id.");
  if(!contact) return setAuthMsg_("Введите телефон или email.");

  try{
    if(btn){ btn.disabled = true; }
    if(tx){ tx.textContent = "Проверяем..."; }
    if(sp){ sp.classList.remove("hidden"); }

    const out = await api_("verify",{client_id, contact});
    if(!out || !out.ok) return setAuthMsg_("Ошибка верификации: " + (out && out.error ? out.error : "unknown"));

    const st = {
      verified: 1,
      client_id: out.client_id || client_id,
      session_token: out.session_token || "",
      display_name: out.display_name || "",
      phase: out.phase || ""
    };
    S.set(st);

    showApp_();
    const access = await loadDashboard_();
    if(access && access.canPlan) await loadPlan_();
  }finally{
    if(sp){ sp.classList.add("hidden"); }
    if(tx){ tx.textContent = "Войти"; }
    if(btn){ btn.disabled = false; }
  }
}

async function sessionPing_(){
  const st=S.get();
  const out = await api_("session_ping",{client_id: st.client_id, session_token: st.session_token});
  return !!(out && out.ok);
}

function showApp_(){
  const st=S.get();
  document.getElementById("authPane").classList.add("hidden");
  document.getElementById("appPane").classList.remove("hidden");
  document.getElementById("hdrMeta").textContent =
    [st.display_name || "Клиент", "ID: " + (st.client_id||"")].filter(Boolean).join(" • ");
  activateTab_("dashboard");
  setTabsAccess_(null); // по умолчанию все вкладки закрыты до загрузки статусов
}

function pill_(label, state){
  // state: completed | progress | locked | empty
  const cls =
    state === "completed" ? "cc-pill cc-done" :
    state === "progress" ? "cc-pill cc-prog" :
    state === "locked" ? "cc-pill cc-lock" :
    "cc-pill";
  return `<span class="${cls}">${label}</span>`;
}

async function loadDashboard_(){
  const st = S.get();
  const box = document.getElementById("dashStatuses");

  box.innerHTML = skelDashboard_();

  const out = await api_("get_dashboard",{client_id: st.client_id, session_token: st.session_token});
if(!out || !out.ok){
  const err = (out && out.error) ? String(out.error) : "unknown";
  if(err === "rate_limited"){
    box.innerHTML = `<div class="cc-card">
      <div style="font-weight:700;margin-bottom:6px;">Слишком много запросов</div>
      <div class="cc-muted">Мы защищаем систему от спама. Подождите 10–15 секунд и нажмите «Обновить».</div>
    </div>`;
  } else {
    box.innerHTML = `<div class="cc-card">Ошибка: ${err}</div>`;
  }
  return;
}


  // поддерживаем оба формата: либо статусы на верхнем уровне, либо внутри out.dash
  const dash = (out.dash && typeof out.dash === "object") ? out.dash : out;

  const entries = normalizeStatuses_(dash.statuses || dash.status_map || dash.status || {});
  const mini = (dash.mini && typeof dash.mini === "object") ? dash.mini : null;

  const access = computeAccess_(entries);

  box.innerHTML = renderDashboardHome_(entries, mini, access);
  bindMiniAccordion_(box);
  initProgressRings_();
  setTabsAccess_(access);

  return access;
}

function normalizeStatuses_(statuses){
  if (Array.isArray(statuses)){
    return statuses.map(x => ({
      key: x.key || x.id || "",
      label: x.label || x.name || x.key || "",
      status: x.status || x.val || x.value || ""
    })).filter(x => x.key);
  }
  return Object.keys(statuses || {}).map(k => ({ key:k, label:k, status: statuses[k] }));
}

function isDoneStatus_(v){
  const s = String(v || "").trim().toLowerCase();
  return s === "completed" || s === "complete";
}

function statusMap_(entries){
  const map = {};
  (entries || []).forEach(e => { if(e && e.key) map[e.key] = e.status; });
  return map;
}

function canOpenExperience_(entries, map){
  map = map || statusMap_(entries);
  return isDoneStatus_(map.status_EXP_1) && isDoneStatus_(map.status_EXP_2);
}

function computeAccess_(entries){
  const map = statusMap_(entries);

  const canIdentity =
    isDoneStatus_(map.status_1_via) &&
    isDoneStatus_(map.status_2_big5) &&
    isDoneStatus_(map.status_3_drivers) &&
    isDoneStatus_(map.status_4_intelligences) &&
    isDoneStatus_(map.status_5_selfesteem) &&
    isDoneStatus_(map.status_6_job_content) &&
    isDoneStatus_(map.status_7_burnout);

  const canExpTab = canOpenExperience_(entries, map);
  const canSigExpBlock = isDoneStatus_(map.status_EXP_3) && isDoneStatus_(map.status_EXP_4);
  const canSkills = isDoneStatus_(map.status_chest_skills_client_rated) && isDoneStatus_(map.status_quality);
  const canPlan = canSkills;

  return { canIdentity, canExpTab, canSigExpBlock, canSkills, canPlan };
}

function setTabsAccess_(access){
  access = access || {};
  const set = (tab, allow) => {
    const btn = document.querySelector(`.cc-tab[data-tab="${tab}"]`);
    if (!btn) return;
    btn.classList.toggle("disabled", !allow);
  };

  set("identity", !!access.canIdentity);
  set("experience", !!access.canExpTab);
  set("skills", !!access.canSkills);
  set("plan", !!access.canPlan);

  const active = document.querySelector(".cc-tab.active");
  if (!active || !active.dataset) return;

  const t = active.dataset.tab;
  const allowed =
    t === "dashboard" ? true :
    t === "identity" ? !!access.canIdentity :
    t === "experience" ? !!access.canExpTab :
    t === "skills" ? !!access.canSkills :
    t === "plan" ? !!access.canPlan : true;

  if (!allowed) activateTab_("dashboard");
}

function bindMiniAccordion_(root){
  if(!root || root.dataset.miniAccBound === "1") return;
  root.dataset.miniAccBound = "1";

  root.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest ? e.target.closest("[data-cc-acc-btn]") : null;
    if(!btn) return;

    const wrap = btn.closest("[data-cc-acc]");
    if(!wrap) return;

    const preview = wrap.querySelector("[data-cc-acc-preview]");
    const full    = wrap.querySelector("[data-cc-acc-full]");
    if(!full || !preview) return;

    const isOpen = btn.getAttribute("aria-expanded") === "true";
    const nextOpen = !isOpen;
    const isPlanStep = wrap.classList.contains("cc-planStep");
    
    if(isPlanStep){
      const acc = wrap.closest("#plStepsAcc");
      if(acc){
        const btns = acc.querySelectorAll(".cc-planStep [data-cc-acc-btn]");
        PLAN_OPEN_STEP_IDX = Array.prototype.indexOf.call(btns, btn);
      }
      if(!nextOpen) PLAN_OPEN_STEP_IDX = -1;
      planUpdateProgress_();
    }

    btn.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    wrap.classList.toggle("cc-acc-open", nextOpen);

      // toggle blocks (plan step: preview не скрываем)
    if(!isPlanStep) preview.style.display = nextOpen ? "none" : "";
    full.style.display = nextOpen ? "block" : "none";


    const t = (!isPlanStep) ? btn.querySelector("[data-cc-acc-text]") : null;
    if(t) t.textContent = nextOpen ? "Скрыть" : "Показать";
    else if(!isPlanStep) btn.textContent = nextOpen ? "Скрыть" : "Показать";
  });
}
function bindPlanOptToggles_(root){
  if(!root || root.dataset.planOptBound === "1") return;
  root.dataset.planOptBound = "1";

  root.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest ? e.target.closest("[data-cc-plan-opt-toggle]") : null;
    if(!btn) return;

    const card = btn.closest(".cc-planStep");
    if(!card) return;

    const box = card.querySelector("[data-cc-plan-opt-box]");
    if(!box) return;

    const isOpen = btn.getAttribute("aria-expanded") === "true";
    const next = !isOpen;

    btn.setAttribute("aria-expanded", next ? "true" : "false");
    box.style.display = next ? "block" : "none";
    card.classList.toggle("cc-planOptOpen", next);
  });
}

function dashboardPhases_(){
  return [
    { title:"Идентичность", keys:[
      "status_1_via","status_2_big5","status_3_drivers","status_4_intelligences","status_5_selfesteem","status_6_job_content","status_7_burnout"
    ]},
    { title:"Самоанализ", keys:[
      "status_8_sam_drive","status_9_sam_intelligences","status_10_sam_big5"
    ]},
    { title:"Опыт", keys:[
      "status_EXP_1","status_EXP_2","status_EXP_3","status_EXP_4"
    ]},
    { title:"Навыки", keys:[
      "status_chest_skills_client_rated",
      "status_quality"
    ]}
  ];
}

function dashboardLabelOverrides_(){
  return {
    // Идентичность
    "status_1_via": "Тест VIA",
    "status_2_big5": "Тест Big5",
    "status_3_drivers": "Тест Двигатели жизни",
    "status_4_intelligences": "Тест Интеллекты",
    "status_5_selfesteem": "Тест Самооценка",
    "status_6_job_content": "Тест Содержание работы",
    "status_7_burnout": "Тест Выгорание",

    // Самоанализ
    "status_8_sam_drive": "Самоанализ: Двигатели жизни",
    "status_9_sam_intelligences": "Самоанализ: Интеллекты",
    "status_10_sam_big5": "Самоанализ: Big5",

    // Опыт
    "status_EXP_1": "Проф.Опыт: Заполнение",
    "status_EXP_2": "Проф.Опыт: Оценка",
    "status_EXP_3": "Значимый опыт: Заполнение",
    "status_EXP_4": "Значимый опыт: Оценка",

    // Навыки
    "status_chest_skills_client_rated": "Навыки и Знания",
    "status_quality": "Знач опыт: Качества"
  };
}

function dashboardLabel_(key, fallbackLabel){
  const ovr = dashboardLabelOverrides_();
  return ovr[key] || fallbackLabel || key;
}
function renderStatusesByPhase_(entries){
  const map = {};
  (entries || []).forEach(e => { if(e && e.key) map[e.key] = e; });

  const PHASES = dashboardPhases_();

  return PHASES.map(ph => {
    const pills = ph.keys.map(k => {
      const e = map[k];
      if(!e) return "";
      const cls = isDoneStatus_(e.status) ? "cc-pill cc-done" : "cc-pill cc-todo";
      return `<span class="${cls}">${escapeHtml(dashboardLabel_(k, e.label))}</span>`;
    }).filter(Boolean).join(" ");

    return `
      <div class="cc-phase-row">
        <div class="cc-phase-title">${escapeHtml(ph.title)}</div>
        <div class="cc-phase-pills">${pills || "—"}</div>
      </div>
    `;
  }).join("");
}

function renderDashboardHome_(entries, mini, access){
  const map = {};
  (entries || []).forEach(e => { if(e && e.key) map[e.key] = e; });

  const PHASES = dashboardPhases_();

  const doneOrdered = [];
  let nextTodo = null;

  const perPhase = PHASES.map(ph => {
    let total = 0;
    let done = 0;

    ph.keys.forEach(k => {
      const e = map[k];
      if(!e) return;
      total += 1;
      if(isDoneStatus_(e.status)){
        done += 1;
        doneOrdered.push(e);
      }else if(!nextTodo){
        nextTodo = e;
      }
    });

    return { title: ph.title, done, total };
  });

  const sumDone  = perPhase.reduce((a,p)=>a + (Number(p.done)||0), 0);
  const sumTotal = perPhase.reduce((a,p)=>a + (Number(p.total)||0), 0);

  const safePct = (done, total) => {
    const d = Number(done)||0;
    const t = Number(total)||0;
    if (!t || t <= 0) return 0;
    const v = d / t;
    if (!isFinite(v) || isNaN(v)) return 0;
    return Math.max(0, Math.min(1, v));
  };

  const coursePct = safePct(sumDone, sumTotal);
  const coursePctLabel = Math.round(coursePct * 100);

  const ringsMini = perPhase.map((p, i) => {
    const pct = safePct(p.done, p.total);
    return ringBlockHtml_({
      id: "ph" + i,
      size: 42,
      stroke: 6,
      pct,
      title: p.title,
      sub: `${Number(p.done)||0}/${Number(p.total)||0}`
    });
  }).join("");

  const lastDone = doneOrdered.length ? doneOrdered[doneOrdered.length - 1] : null;

const sessionByLastDoneKey = {
  "status_10_sam_big5": "Сессия: Результаты тестов",
  "status_EXP_2": "Сессия: Заключение",
  "status_EXP_4": "Сессия: Заключение",
  "status_quality": "Сессия: Сундук: Сокровищ"
};

  const sessionLabel =
    !lastDone ? "Сессия: Жизнеописание"
    : (sessionByLastDoneKey[lastDone.key] || "");

  const showSession = !!sessionLabel;

  const nextLabel = showSession
    ? escapeHtml(sessionLabel)
    : (nextTodo ? escapeHtml(String(nextTodo.label || nextTodo.key)) : "Все этапы завершены");

  const nextHtml = `
  <div class="cc-nextMain">Следующий шаг: <b>${nextLabel}</b></div>
`;
  const a = access || {};
  const tabIcoHtml_ = (tab) => {
    const el = document.querySelector(`.cc-tab[data-tab="${tab}"] .cc-btnIco`);
    return el ? el.innerHTML : "";
  };

  const nextIconSvg_ = (key) => {
    if (key === "identity") return tabIcoHtml_("identity");
    if (key === "exp")      return tabIcoHtml_("experience");
    if (key === "skills")   return tabIcoHtml_("skills");
    if (key === "plan")     return tabIcoHtml_("plan");
    return "";
  };

  const gateRow = (key, label, ok) => `
      <div class="cc-nextRow ${ok ? "ok" : "no"}">
      <span class="cc-nextLeft">
        <span class="cc-nextIco" aria-hidden="true">${nextIconSvg_(key)}</span>
        <span class="cc-nextName">${escapeHtml(label)}</span>
      </span>

      <span class="cc-nextRight">
        <span class="cc-nextStatus ${ok ? "ok" : "no"}">${ok ? "Доступно" : "Недоступно"}</span>
        <span class="cc-nextIcon ${ok ? "ok" : "no"}" aria-hidden="true">
          ${ok
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`
          }
        </span>
      </span>
    </div>
  `;

  const gatesHtml = `
    <div class="cc-nextAccess">
     ${gateRow("identity", "Моя идентичность", !!a.canIdentity)}
      ${gateRow("exp", "Мой опыт", !!a.canExpTab)}
      ${gateRow("skills", "Мои навыки", !!a.canSkills)}
      ${gateRow("plan", "Мой план", !!a.canPlan)}
    </div>
  `;

  const summary = `
    <div class="cc-dashGrid">
    
<div class="cc-dashTile">
  <div class="cc-dashTitle">
    <span class="cc-dashTitleIco" aria-hidden="true">${dashTitleIconSvg_("done")}</span>
    <span>Что завершено</span>
  </div>

  <div class="cc-progressWrap" data-cc-rings>
    <div class="cc-progressMain">
      ${ringCourseHtml_({
        id: "course",
        size: 78,
        stroke: 8,
        pct: coursePct,
        centerText: `${coursePctLabel}%`
      })}
    </div>

    <div class="cc-progressSide">
      <div class="cc-progressTitle">Прогресс программы Prof ID</div>
      <div class="cc-progressMeta">${sumDone} из ${sumTotal} шагов</div>

      <div class="cc-progressMiniGrid">
        ${ringsMini}
      </div>
    </div>
  </div>
</div>

      <div class="cc-dashTile">
        <div class="cc-dashTitle">
<span class="cc-dashTitleIco" aria-hidden="true">${dashTitleIconSvg_("next")}</span>
<span>Что дальше</span>
</div>
        ${nextHtml}
        ${gatesHtml}
      </div>
    </div>
  `;

  return summary + renderMiniCards_(mini) + `<div class="cc-dashDivider"></div>` + renderStatusesByPhase_(entries);
}


function dashTitleIconSvg_(kind){
  if(kind === "done"){
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100.353 100.353">
        <path fill="currentColor" d="M96.747,39.242c-0.186-0.782-0.97-1.265-1.755-1.079c-0.782,0.187-1.265,0.972-1.078,1.754
          c0.766,3.212,1.155,6.604,1.155,10.083c0,24.85-20.67,45.067-46.078,45.067S2.913,74.85,2.913,50
          c0-24.852,20.67-45.07,46.078-45.07c10.119,0,19.785,3.202,27.952,9.26c0.644,0.479,1.558,0.344,2.037-0.302
          s0.344-1.558-0.302-2.037C70.006,5.417,59.74,2.018,48.991,2.018C21.977,2.018,0,23.542,0,50c0,26.456,21.977,47.98,48.991,47.98
          c27.014,0,48.991-21.524,48.991-47.98C97.982,46.295,97.566,42.676,96.747,39.242z"/>
        <path fill="currentColor" d="M47.98,71.683c-0.386,0-0.756-0.153-1.03-0.426L19.637,43.948c-0.569-0.569-0.569-1.491,0-2.06
          c0.568-0.569,1.49-0.569,2.059,0l26.223,26.219l49.538-55.486c0.536-0.6,1.456-0.652,2.056-0.116s0.652,1.456,0.117,2.056
          L49.066,71.197c-0.267,0.299-0.645,0.475-1.045,0.486C48.007,71.683,47.994,71.683,47.98,71.683z"/>
      </svg>
    `;
  }

  // next
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 101 101">
      <path fill="currentColor" d="M52.5,82h-24c-7.13,0-12.93-6.06-12.93-13.5S21.34,55,28.47,55h41.1c8.78,0,15.93-7.4,15.93-16.5S78.35,22,69.56,22H38.5a1.5,1.5,0,0,0,0,3H69.56c7.13,0,12.93,6.06,12.93,13.5S76.69,52,69.56,52H28.47c-8.78,0-15.93,7.4-15.93,16.5S19.68,85,28.47,85h24a1.5,1.5,0,0,0,0-3Z"/>
      <path fill="currentColor" d="M20.5,32A8.5,8.5,0,1,0,12,23.5,8.51,8.51,0,0,0,20.5,32Zm0-14A5.5,5.5,0,1,1,15,23.5,5.51,5.51,0,0,1,20.5,18Z"/>
      <path fill="currentColor" d="M80.59,72.48a1.5,1.5,0,0,0-2.12,0l-5.79,5.79-5.79-5.79a1.5,1.5,0,0,0-2.12,2.12l5.79,5.79-5.79,5.79a1.5,1.5,0,1,0,2.12,2.12l5.79-5.79,5.79,5.79a1.5,1.5,0,0,0,2.12-2.12L74.8,80.39l5.79-5.79A1.5,1.5,0,0,0,80.59,72.48Z"/>
    </svg>
  `;
}

function ringSvgHtml_({ id, size, stroke, pct, centerText, showCenter }) {
  const s = Number(size)||42;
  const sw = Number(stroke)||6;
  const p = Math.max(0, Math.min(1, Number(pct)||0));

  const r = (s - sw) / 2;
  const c = 2 * Math.PI * r;

  const targetOffset = c * (1 - p);

  return `
    <svg class="cc-ringSvg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true">
      <circle class="cc-ringTrack" cx="${s/2}" cy="${s/2}" r="${r}" stroke-width="${sw}" />
      <circle
        class="cc-ringProg"
        data-cc-ring="1"
        data-cc-ring-target="${targetOffset}"
        cx="${s/2}" cy="${s/2}" r="${r}" stroke-width="${sw}"
        style="stroke-dasharray:${c};stroke-dashoffset:${c};"
      />
      ${showCenter ? `<text class="cc-ringText" x="50%" y="50%" dominant-baseline="middle" text-anchor="middle">${escapeHtml(centerText||"")}</text>` : ``}
    </svg>
  `;
}

function ringCourseHtml_({ id, size, stroke, pct, centerText }) {
  return `
    <div class="cc-ringCourse" data-cc-ring-wrap="${escapeHtml(id||'course')}">
      ${ringSvgHtmlHtmlSafe_({ size, stroke, pct, centerText, showCenter:true })}
    </div>
  `;
}

/* helper чтобы не дублировать escape/валидации */
function ringSvgHtmlHtmlSafe_({ size, stroke, pct, centerText, showCenter }) {
  return ringSvgHtml_({ size, stroke, pct, centerText, showCenter });
}

function ringBlockHtml_({ id, size, stroke, pct, title, sub }) {
  return `
    <div class="cc-ringMini" data-cc-ring-wrap="${escapeHtml(id||'ph')}">
      <div class="cc-ringMiniIco">
        ${ringSvgHtmlHtmlSafe_({ size, stroke, pct, centerText:"", showCenter:false })}
      </div>
      <div class="cc-ringMiniTxt">
        <div class="cc-ringMiniTitle">${escapeHtml(title||"")}</div>
        <div class="cc-ringMiniSub">${escapeHtml(sub||"0/0")}</div>
      </div>
    </div>
  `;
}

function initProgressRings_(){
  const root = document.querySelector("[data-cc-rings]");
  if (!root) return;

  if (root.dataset.ccRingsInited === "1") return;
  root.dataset.ccRingsInited = "1";

  const circles = root.querySelectorAll("[data-cc-ring='1']");
  if (!circles || !circles.length) return;

  requestAnimationFrame(()=> {
    circles.forEach(el => {
      const t = Number(el.getAttribute("data-cc-ring-target"));
      if (!isFinite(t) || isNaN(t)) return;
      el.style.strokeDashoffset = String(t);
    });
  });
}

function renderMiniCards_(mini){
  const m = mini || {};
  const drv = (m.drivers || {});
  const intel = (m.intellect || {});

   // --- Drivers card ---
  const driversTop = Array.isArray(drv.top) ? drv.top.filter(Boolean) : [];
  const mainDriver = driversTop.length ? String(driversTop[0]) : "";
  const driversDesc = String(drv.desc || "").trim();
  const driversHas = !!mainDriver;
  const driversImgUrl = String(drv.image_url || "").trim();

  const driversHtml = driversHas
    ? `
      <div class="cc-miniRow">
        <div class="cc-miniImgWrap">
          ${driversImgUrl
            ? `<img class="cc-miniImg" src="${escapeHtml(driversImgUrl)}" alt="">`
            : `<div class="cc-miniImgPh">?</div>`
          }
        </div>

        <div class="cc-miniBody">
          <div class="cc-miniLine"><span class="cc-miniK">Ведущий двигатель жизни:</span> ${escapeHtml(mainDriver)}</div>

          ${driversDesc ? `
            <div class="cc-miniDesc" data-cc-acc>
              <div class="cc-miniDescShort" data-cc-acc-preview>${escapeHtml(driversDesc)}</div>
              <div class="cc-miniDescFull" data-cc-acc-full style="display:none;">${escapeHtml(driversDesc)}</div>

              <button class="cc-miniToggle" type="button" data-cc-acc-btn aria-expanded="false">
                <span data-cc-acc-text>Показать</span>
                <span class="cc-acc-chev">▾</span>
              </button>
            </div>
          ` : ``}
        </div>
      </div>
    `
    : `
      <div class="cc-miniRow">
        <div class="cc-miniBody">
          <div class="cc-miniEmpty">Пройдите тест, чтобы увидеть результат</div>
        </div>
      </div>
    `;

  // --- Intellect card ---
  const intelValue = String(intel.value || '').trim();
  const intelDesc  = String(intel.desc || '').trim();
  const intelHas   = !!intelValue;

  const imgUrl = String(intel.image_url || '').trim();

  const intelHtml = intelHas
  ? `
      <div class="cc-miniRow">
        <div class="cc-miniImgWrap">
          ${imgUrl
            ? `<img class="cc-miniImg" src="${escapeHtml(imgUrl)}" alt="">`
            : `<div class="cc-miniImgPh">?</div>`
          }
        </div>

        <div class="cc-miniBody">
          <div class="cc-miniLine"><span class="cc-miniK">Ведущий интеллект:</span> ${escapeHtml(intelValue)}</div>

          ${intelDesc ? `
            <div class="cc-miniDesc" data-cc-acc>
              <div class="cc-miniDescShort" data-cc-acc-preview>${escapeHtml(intelDesc)}</div>
              <div class="cc-miniDescFull" data-cc-acc-full style="display:none;">${escapeHtml(intelDesc)}</div>

              <button class="cc-miniToggle" type="button" data-cc-acc-btn aria-expanded="false">
                <span data-cc-acc-text>Показать</span>
                <span class="cc-acc-chev">▾</span>
              </button>
            </div>
          ` : ``}
        </div>
      </div>
    `
  : `
      <div class="cc-miniRow">
        <div class="cc-miniBody">
          <div class="cc-miniEmpty">Пройдите тест, чтобы увидеть результат</div>
        </div>
      </div>
    `;

  return `
    <div class="cc-miniGrid">
      <div class="cc-dashTile cc-miniCard">
                <div class="cc-miniTitle cc-miniTitleRow">
          <span class="cc-miniTitleIco" aria-hidden="true">${SVG_HDR_DRIVERS}</span>
          <span>Двигатели жизни</span>
        </div>
        ${driversHtml}
      </div>

      <div class="cc-dashTile cc-miniCard">
                <div class="cc-miniTitle cc-miniTitleRow">
          <span class="cc-miniTitleIco" aria-hidden="true">${SVG_HDR_INTEL}</span>
          <span>Интеллекты</span>
        </div>
        ${intelHtml}
      </div>
    </div>
  `;
}

function skelDashboard_(){
  const row = () => `
    <div class="cc-phase-row">
      <div class="cc-skel cc-skel-phase"></div>
      <div class="cc-phase-pills">
        <span class="cc-skel-pill"></span><span class="cc-skel-pill"></span><span class="cc-skel-pill"></span><span class="cc-skel-pill"></span><span class="cc-skel-pill"></span>
      </div>
    </div>
  `;
  return row() + row() + row();
}
function skelIdentity_(){
  return `
    <div class="cc-skel" style="width:42%"></div>
    <div class="cc-skel" style="width:78%"></div>
    <div class="cc-skel" style="width:64%"></div>
    <div class="cc-skel" style="width:88%"></div>
    <div class="cc-skel" style="width:55%"></div>
  `;
}

async function loadPlan_(){
  setPlanErr_("");
  const st=S.get();
  const out = await api_("get_plan",{client_id: st.client_id, session_token: st.session_token});
  if(!out || !out.ok){
    setPlanErr_("Ошибка загрузки плана: " + ((out && out.error) || "unknown"));
        fillPlan_(null, "");
    return;
  }
  let plan = null;
  try{
    if(out.plan_json && typeof out.plan_json === "string") plan = JSON.parse(out.plan_json);
    else if(out.plan && typeof out.plan === "object") plan = out.plan;
    else if(out.plan_json && typeof out.plan_json === "object") plan = out.plan_json;
  }catch(_){}
   fillPlan_(plan || null, out.updated_at || out.plan_updated_at || "");
}

async function loadIdentity_(){
  const box = document.getElementById("identityBox");
  const st = S.get();
  if(!st.client_id || !st.session_token){
    box.innerHTML = `<div class="cc-card">Нет активной сессии.</div>`;
    return;
  }

   box.innerHTML = `<div class="cc-card">${skelIdentity_()}</div>`;
  const out = await api_("get_identity",{client_id: st.client_id, session_token: st.session_token});

  if(!out || !out.ok){
    box.innerHTML = `<div class="cc-card">Ошибка: ${(out&&out.error)||"unknown"}</div>`;
    return;
  }

  box.innerHTML = renderProfileHtml(out.profile || {}, out.name || "");
}

async function loadExperience_(){
  const box = document.getElementById("experienceBox");
  const st = S.get();

  if(!st.client_id || !st.session_token){
    box.innerHTML = `<div class="cc-card">Нет активной сессии.</div>`;
    return;
  }

  box.innerHTML = `<div class="cc-card">${skelIdentity_()}</div>`;

  const out = await api_("get_experience",{client_id: st.client_id, session_token: st.session_token});
  if(!out || !out.ok){
    const err = (out && out.error) ? String(out.error) : "unknown";
    if (err === "experience_locked"){
      box.innerHTML = `<div class="cc-card">Завершите этап: Проф.Опыт, Оценка проф., Значимый опыт, Оценка знач.</div>`;
      return;
    }
    box.innerHTML = `<div class="cc-card">Ошибка: ${escapeHtml(err)}</div>`;
    return;
  }

  box.innerHTML = renderExperienceHtml_(out.experience || {}, !!out.sig_locked);
}
async function loadSkills_(){
  const st = S.get();
  const box = document.getElementById("skillsBox");
  if(!box) return;

  if(SKILLS_CACHE && (Date.now() - SKILLS_CACHE.ts) < 60000){
    box.innerHTML = renderSkillsPage_(SKILLS_CACHE.skills || {});
    return;
  }

  box.innerHTML = skelSkills_();

  const out = await api_("get_skills",{client_id: st.client_id, session_token: st.session_token});
  if(!out || !out.ok){
    box.innerHTML = `<div class="cc-card">Ошибка: ${(out&&out.error)||"unknown"}</div>`;
    return;
  }

  SKILLS_CACHE = { ts: Date.now(), skills: out.skills || {} };
  box.innerHTML = renderSkillsPage_(SKILLS_CACHE.skills);
}

function skelSkills_(){
  const card = `<div class="cc-card">${skelIdentity_()}</div>`;
  return `<div class="cc-skillsGrid">${card}${card}${card}${card}</div>`;
}

function renderSkillsPage_(skills){
  const prof = [
    { title: 'Профессиональные навыки и знания', items: (skills.prof_prof || []) },
    { title: 'Надпрофессиональные навыки и знания', items: (skills.prof_meta || []) }
  ];
  const sig = [
    { title: 'Профессиональные навыки и знания', items: (skills.sig_prof || []) },
    { title: 'Надпрофессиональные навыки и знания', items: (skills.sig_meta || []) }
  ];

  return `
    <div class="cc-skillsPage">
      ${renderSkillsLegend_()}
      ${renderSkillsSection_('Профессиональный опыт', 'briefcase', prof)}
      ${renderSkillsSection_('Значимый опыт', 'star', sig)}
    </div>
  `;
}

function renderSkillsSection_(title, icon, blocks){
  const isSig = (icon === 'star');
  const ico = isSig ? svgStar_() : svgBriefcase_();
  const headCls = `cc-skillsSectionHead ${isSig ? 'cc-exp-sig' : 'cc-exp-prof'}`;
  const icoCls  = `cc-exp-ico ${isSig ? 'cc-exp-ico-sig' : 'cc-exp-ico-prof'}`;
  return `
    <section class="cc-skillsSection">
      <div class="${headCls}">
        <span class="${icoCls}" aria-hidden="true">${ico}</span>
        <div class="cc-skillsSectionTitle">${escapeHtml(title)}</div>
      </div>
      <div class="cc-skillsGrid">
        ${blocks.map(b => renderSkillsCard_(b.title, b.items)).join('')}
      </div>
    </section>
  `;
}

function svgBriefcase_(){
 return `<svg fill="currentColor" width="18" height="18" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g><path d="M26,9h-2.6c-1.2-3-4.1-5-7.4-5c-3.3,0-6.2,2-7.4,5H6c-1.7,0-3,1.3-3,3v0.6C3,16.1,5.9,19,9.4,19h13.3c3.5,0,6.4-2.9,6.4-6.4V12C29,10.3,27.7,9,26,9z M16,6c2.2,0,4.1,1.2,5.2,3H10.8C11.9,7.2,13.8,6,16,6z"/><path d="M23,21C23,21,23,21,23,21l0,2c0,0.6-0.4,1-1,1s-1-0.4-1-1v-2H11v2c0,0.6-0.4,1-1,1s-1-0.4-1-1v-2c0,0,0,0,0,0c-2.4-0.1-4.5-1.2-6-2.9V25c0,1.7,1.3,3,3,3h20c1.7,0,3-1.3,3-3v-6.9C27.5,19.8,25.4,20.9,23,21z"/></g></svg>`;
}

function svgStar_(){
 return `<svg fill="currentColor" width="18" height="18" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M62.799,23.737c-0.47-1.399-1.681-2.419-3.139-2.642l-16.969-2.593L35.069,2.265C34.419,0.881,33.03,0,31.504,0c-1.527,0-2.915,0.881-3.565,2.265l-7.623,16.238L3.347,21.096c-1.458,0.223-2.669,1.242-3.138,2.642c-0.469,1.4-0.115,2.942,0.916,4l12.392,12.707l-2.935,17.977c-0.242,1.488,0.389,2.984,1.62,3.854c1.23,0.87,2.854,0.958,4.177,0.228l15.126-8.365l15.126,8.365c0.597,0.33,1.254,0.492,1.908,0.492c0.796,0,1.592-0.242,2.269-0.72c1.231-0.869,1.861-2.365,1.619-3.854l-2.935-17.977l12.393-12.707C62.914,26.68,63.268,25.138,62.799,23.737z"/></svg>`;
}

function renderSkillsLegend_(){
  const rows = [
    { lvl: 1, text: '1 — Общее представление' },
    { lvl: 2, text: '2 — Знание: понимание различных целей, методов, проблем и их отношений' },
    { lvl: 3, text: '3 — Практика: опыт реализации теоретических принципов' },
    { lvl: 4, text: '4 — Опыт: проектирование, инновации, внедрение знаний в новом контексте' }
  ];

  return `
    <details class="cc-card cc-skillsLegend cc-skillsLegendDetails">
      <summary class="cc-skillsLegendSummary">
        <div class="cc-skillsLegendHead">
          <div class="cc-skillsLegendTitle">Компетентность</div>
          <div class="cc-skillsLegendHint">Как читать уровни 1–4</div>
        </div>
        <span class="cc-skillsLegendChevron" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
        </span>
      </summary>

      <div class="cc-skillsLegendBody">
        ${rows.map(r => `
          <div class="cc-skillsLegendRow">
            ${skillLevelPill_(r.lvl)}
            <div>${escapeHtml(r.text)}</div>
          </div>
        `).join('')}
      </div>
    </details>
  `;
}

function renderSkillsCard_(subtitle, items){
  const rows = (items || []).filter(Boolean);
  const body = rows.length
    ? renderSkillsTable_(rows)
    : `<div class="cc-empty">Навыки пока не добавлены</div>`;

  return `
    <details class="cc-card cc-skillsBlock">
      <summary class="cc-skillsBlockSummary">
        <div class="cc-skillsBlockTitle">${escapeHtml(subtitle)}</div>
        <span class="cc-skillsBlockChevron" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
        </span>
      </summary>
      <div class="cc-skillsBlockBody">${body}</div>
    </details>
  `;
}

function renderSkillsTable_(items){
  const rows = (items||[]).map(it=>{
    const skill = escapeHtml(it.skill || "");
    const cat   = escapeHtml(it.category || "");
    const pill  = skillLevelPill_(it.level);
    return `<tr>
      <td data-label="Навык">${skill}</td>
      <td data-label="Категория">${cat}</td>
      <td data-label="Компетентность" class="cc-skillLevel">${pill}</td>
    </tr>`;
  }).join("");

  return `<div class="cc-skillsTableWrap">
    <table class="cc-table cc-skillsTable">
      <thead><tr>
        <th>Навык</th>
        <th>Категория</th>
        <th class="cc-skillLevel">Компетентность</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function skillLevelPill_(v){
  const n = normSkillLevel_(v);
  const cls = (n===1) ? "score-red" : (n===2) ? "score-orange" : (n===3) ? "score-yellow" : "score-green";
  const lbl = (n===1) ? "Общее представление" : (n===2) ? "Знание" : (n===3) ? "Практика" : "Опыт";

  let segs = "";
  for(let i=1;i<=4;i++){
    segs += `<span class="cc-competSeg${i<=n ? (" on "+cls) : ""}"></span>`;
  }

  return `<span class="cc-compet cc-skillPill" title="${lbl} (${n}/4)" aria-label="Компетентность ${n} из 4: ${lbl}">${segs}</span>`;
}

function normSkillLevel_(v){
  const n = parseInt(v, 10);
  if(!isFinite(n)) return 1;
  return (n < 1) ? 1 : (n > 4) ? 4 : n;
}

function renderExperienceHtml_(exp, sigLocked){
  const prof = Array.isArray(exp.prof) ? exp.prof : [];
  const sigAll = Array.isArray(exp.sig) ? exp.sig : [];
  const sig = sigAll.slice(0,3);
  const sigNote = (sigAll.length > 3) ? `<div class="cc-exp-note">Показаны 3 из ${sigAll.length}</div>` : "";
  const SVG_BRIEFCASE = `<svg fill="currentColor" width="18" height="18" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g><path d="M26,9h-2.6c-1.2-3-4.1-5-7.4-5c-3.3,0-6.2,2-7.4,5H6c-1.7,0-3,1.3-3,3v0.6C3,16.1,5.9,19,9.4,19h13.3c3.5,0,6.4-2.9,6.4-6.4V12C29,10.3,27.7,9,26,9z M16,6c2.2,0,4.1,1.2,5.2,3H10.8C11.9,7.2,13.8,6,16,6z"/><path d="M23,21C23,21,23,21,23,21l0,2c0,0.6-0.4,1-1,1s-1-0.4-1-1v-2H11v2c0,0.6-0.4,1-1,1s-1-0.4-1-1v-2c0,0,0,0,0,0c-2.4-0.1-4.5-1.2-6-2.9V25c0,1.7,1.3,3,3,3h20c1.7,0,3-1.3,3-3v-6.9C27.5,19.8,25.4,20.9,23,21z"/></g></svg>`;
  const SVG_STAR = `<svg fill="currentColor" width="18" height="18" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M62.799,23.737c-0.47-1.399-1.681-2.419-3.139-2.642l-16.969-2.593L35.069,2.265C34.419,0.881,33.03,0,31.504,0c-1.527,0-2.915,0.881-3.565,2.265l-7.623,16.238L3.347,21.096c-1.458,0.223-2.669,1.242-3.138,2.642c-0.469,1.4-0.115,2.942,0.916,4l12.392,12.707l-2.935,17.977c-0.242,1.488,0.389,2.984,1.62,3.854c1.23,0.87,2.854,0.958,4.177,0.228l15.126-8.365l15.126,8.365c0.597,0.33,1.254,0.492,1.908,0.492c0.796,0,1.592-0.242,2.269-0.72c1.231-0.869,1.861-2.365,1.619-3.854l-2.935-17.977l12.393-12.707C62.914,26.68,63.268,25.138,62.799,23.737z"/></svg>`;

  const safe = (s) => escapeHtml(String(s||""));
  const safeBr = (s) => safe(s).replace(/\n/g,"<br>");
  const fmtMonths = (v) => {
    const s = String(v || "").trim();
    if(!s) return "";
    const n = Number(String(s).replace(",", "."));
    if(Number.isFinite(n) && n > 0) return safe(`${n} мес.`);
    return safe(s); // если уже строка вида "7 мес." или "полгода" — не ломаем
  };

   const profItems = prof.length ? prof.map(r=>{
    const periodMain = safe(r.date);
    const periodSub  = fmtMonths(r.period);
    const position   = safe(r.role);

    const resultRaw     = String(r.result || "").trim();
    const resultPreview = safe(resultRaw.replace(/\s+/g," "));
    const resultFull    = safeBr(resultRaw);

    return `
      <details class="cc-exp-details">
        <summary class="cc-exp-sum">
          <div class="cc-exp-grid cc-exp-grid-3">
            <div class="cc-exp-when">
              <div class="cc-exp-main">${periodMain || "—"}</div>
              <div class="cc-exp-sub">${periodSub || ""}</div>
            </div>

            <div class="cc-exp-role">${position || "—"}</div>

            <div class="cc-exp-res">
              <div class="cc-exp-resrow">
                <div class="cc-exp-text">
                  <span class="cc-exp-preview">${resultPreview || "—"}</span>
                  <div class="cc-exp-full">${resultFull || "—"}</div>
                </div>
                <span class="cc-exp-caret" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
                </span>
              </div>
            </div>
          </div>
        </summary>
      </details>
    `;
  }).join("") : `<div class="cc-exp-empty">Нет данных.</div>`;

    const sigItems = sig.length ? sig.map(r=>{
    const periodMain      = safe(r.period);
    const experienceTitle = safe(r.experience);

    const resultRaw     = String(r.result || "").trim();
    const resultPreview = safe(resultRaw.replace(/\s+/g," "));
    const resultFull    = safeBr(resultRaw);

    return `
      <details class="cc-exp-details">
        <summary class="cc-exp-sum">
          <div class="cc-exp-grid cc-exp-grid-3">
            <div class="cc-exp-when">
              <div class="cc-exp-main">${periodMain || "—"}</div>
              <div class="cc-exp-sub"></div>
            </div>

            <div class="cc-exp-role">${experienceTitle || "—"}</div>

            <div class="cc-exp-res">
              <div class="cc-exp-resrow">
                <div class="cc-exp-text">
                  <span class="cc-exp-preview">${resultPreview || "—"}</span>
                  <div class="cc-exp-full">${resultFull || "—"}</div>
                </div>
                <span class="cc-exp-caret" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
                </span>
              </div>
            </div>
          </div>
        </summary>
      </details>
    `;
  }).join("") : `<div class="cc-exp-empty">Нет данных.</div>`;

  return `
    <div class="cc-exp-section cc-exp-prof">
      <div class="cc-exp-head">
        <span class="cc-exp-ico cc-exp-ico-prof">${SVG_BRIEFCASE}</span>
        <div class="cc-exp-title">Профессиональный опыт</div>
      </div>
      <div class="cc-exp-cols">
        <div class="cc-exp-col">Период</div>
        <div class="cc-exp-col">Должность</div>
        <div class="cc-exp-col">Результат</div>
      </div>
      ${profItems}
    </div>

    <div class="cc-sectionLock ${sigLocked ? "is-locked" : ""}" style="margin-top:12px;">
  <div class="cc-sectionLockBody">
    <div class="cc-exp-section cc-exp-sig" style="margin-top:0;">
      <div class="cc-exp-head">
        <span class="cc-exp-ico cc-exp-ico-sig">${SVG_STAR}</span>
        <div class="cc-exp-title">Значимый опыт</div>
      </div>
      <div class="cc-exp-cols">
        <div class="cc-exp-col">Период</div>
        <div class="cc-exp-col">Опыт</div>
        <div class="cc-exp-col">Результат</div>
      </div>
      ${sigItems}
      ${sigNote}
    </div>
  </div>

  ${sigLocked ? `
    <div class="cc-lockOverlay" aria-hidden="true">
      <div class="cc-lockInner">
        <span class="cc-lockIco">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </span>
        <div>
          <div class="cc-lockTitle">Блок недоступен</div>
          <div class="cc-lockSub">
            Блок откроется после прохождения этапов: “Значимый опыт: Заполнение” и “Значимый опыт: Оценка”
          </div>
        </div>
      </div>
    </div>
  ` : ``}
</div>
  `;
}

async function savePlan_(){
  setPlanErr_("");
  if(PLAN_SAVING) return;

  if(!planRecalcDirty_()) return;

  PLAN_SAVING = true;
  const btn = document.getElementById("btnSavePlan");
  const sp = btn ? btn.querySelector(".cc-btn-spinner") : null;
  if(btn) btn.disabled = true;
  if(sp) sp.classList.remove("hidden");

  try{
    const st=S.get();
    const plan = collectPlan_();
    const planStr = JSON.stringify(plan);

    const params = {
      client_id: st.client_id,
      session_token: st.session_token,
      plan_json_b64: b64u_(planStr)
    };

    const out = await api_("save_plan", params);
    if(!out || !out.ok){
      setPlanErr_("Ошибка сохранения: " + ((out && out.error) || "unknown"));
      return;
    }

    const when = out.updated_at || out.plan_updated_at || "";
    planSetUpdatedAt_(when);
    showSaved_(when);

    PLAN_BASELINE_STR = JSON.stringify(plan);
    planSetDirty_(false);
  } finally {
    PLAN_SAVING = false;
    if(sp) sp.classList.add("hidden");
    planRecalcDirty_();
  }
}

const SVG_HDR_VIA = `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 100.353 100.352" style="enable-background:new 0 0 100.353 100.352;" xml:space="preserve">
<g>
	<path d="M54.333,9.322c-0.463-0.292-1.047-0.308-1.524-0.044c-0.479,0.264-0.775,0.767-0.775,1.313v8.316h-5.784
		c-0.338,0-0.667,0.115-0.932,0.325L27.612,33.28c-0.359,0.285-0.568,0.717-0.568,1.175v7.187c0,0.399,0.159,0.782,0.443,1.064
		c0.283,0.281,0.649,0.421,1.066,0.436l18.498-0.116c-1.976,1.35-4.364,3.295-7.084,6.091c-5.312,5.461-8.082,13.464-9.47,19.217
		c-0.108,0.446-0.005,0.918,0.28,1.279c0.284,0.361,0.719,0.572,1.179,0.572l31.868-0.007c0.462,0,0.898-0.213,1.183-0.577
		s0.385-0.84,0.272-1.288c-1.019-4.058-1.509-7.435-1.419-9.765c0.063-1.634,1.094-2.922,2.52-4.706
		c2.618-3.275,6.204-7.76,6.166-17.736C72.482,20.939,55.074,9.789,54.333,9.322z M64.036,51.97
		c-1.58,1.977-3.073,3.843-3.175,6.463c-0.087,2.264,0.271,5.199,1.063,8.746l-28.034,0.007c1.416-5.152,3.921-11.551,8.227-15.977
		c7.174-7.375,11.616-8.236,11.642-8.241c0.777-0.118,1.331-0.816,1.27-1.601c-0.062-0.781-0.713-1.382-1.495-1.382
		c-0.003,0-0.006,0-0.01,0l-23.479,0.148V35.18l16.728-13.272h6.761c0.828,0,1.5-0.671,1.5-1.5v-6.912
		c4.595,3.491,14.469,12.203,14.512,22.623C69.579,45.036,66.506,48.88,64.036,51.97z"/>
	<path d="M66.04,74.648H30.585c-0.829,0-1.5,0.672-1.5,1.5c0,0.046,0.009,0.089,0.013,0.133c-0.004,0.045-0.013,0.088-0.013,0.133
		l-0.049,10.526c-0.002,0.398,0.155,0.782,0.437,1.065c0.281,0.282,0.664,0.441,1.063,0.441H66.04c0.828,0,1.5-0.672,1.5-1.5V76.202
		c0-0.009-0.003-0.018-0.003-0.027c0-0.009,0.003-0.018,0.003-0.027C67.54,75.32,66.868,74.648,66.04,74.648z M32.043,85.448
		l0.036-7.8H64.54v7.8H32.043z"/>
	<path d="M16.481,61.061c-0.585-0.586-1.535-0.586-2.121,0l-5.378,5.377l-5.378-5.377c-0.586-0.586-1.536-0.586-2.121,0
		c-0.586,0.586-0.586,1.535,0,2.121l5.378,5.376l-5.378,5.376c-0.586,0.586-0.586,1.535,0,2.121
		c0.292,0.293,0.677,0.439,1.061,0.439s0.768-0.146,1.061-0.439l5.378-5.377l5.378,5.377c0.293,0.293,0.677,0.439,1.061,0.439
		s0.768-0.146,1.061-0.439c0.586-0.586,0.586-1.535,0-2.121l-5.378-5.376l5.378-5.376C17.067,62.596,17.067,61.646,16.481,61.061z"
		/>
	<path d="M89.373,43.853c-5.284,0-9.584,4.299-9.584,9.583c0,5.285,4.3,9.585,9.584,9.585s9.584-4.3,9.584-9.585
		C98.957,48.152,94.657,43.853,89.373,43.853z M89.373,60.021c-3.631,0-6.584-2.954-6.584-6.585c0-3.63,2.953-6.583,6.584-6.583
		s6.584,2.953,6.584,6.583C95.957,57.067,93.004,60.021,89.373,60.021z"/>
</g>
</svg>`;

const SVG_HDR_BIG5_MAIN = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 101.767 100.353" aria-hidden="true">
<g>
  <path d="M60.493,51.338c0.737-0.537,1.098-1.429,0.94-2.323l-1.292-7.549l5.482-5.35c0.651-0.634,0.882-1.565,0.602-2.431c-0.281-0.867-1.016-1.487-1.918-1.619l-7.584-1.102l-3.39-6.877c-0.407-0.813-1.223-1.317-2.13-1.317c-0.003,0-0.007,0-0.01,0c-0.908,0.004-1.72,0.512-2.119,1.326l-3.386,6.868l-7.581,1.102c-0.904,0.132-1.64,0.754-1.92,1.624c-0.279,0.866-0.047,1.797,0.602,2.424l5.485,5.352l-1.296,7.581c-0.154,0.891,0.201,1.778,0.928,2.314c0.418,0.309,0.911,0.466,1.406,0.466c0.366,0,0.733-0.085,1.073-0.258l6.979-3.532l6.62,3.481C58.793,51.945,59.755,51.876,60.493,51.338z M50.709,45.042l-6.604,3.342l1.228-7.187c0.083-0.481-0.077-0.972-0.426-1.312l-5.181-5.055l7.163-1.041c0.483-0.07,0.901-0.375,1.117-0.813l3.2-6.49l3.199,6.49c0.216,0.438,0.634,0.743,1.117,0.813l7.166,1.041l-5.18,5.055c-0.349,0.341-0.509,0.832-0.426,1.313l1.221,7.133l-6.235-3.279C51.646,44.829,51.137,44.826,50.709,45.042z"/>
  <path d="M100.299,33.749c-0.28-0.869-1.016-1.49-1.919-1.622l-7.585-1.102l-3.391-6.872c-0.404-0.816-1.22-1.322-2.129-1.322c-0.002,0-0.004,0-0.006,0c-0.909,0.002-1.723,0.51-2.123,1.326l-3.386,6.868l-7.584,1.103c-0.908,0.132-1.645,0.757-1.923,1.63c-0.276,0.869-0.038,1.798,0.608,2.414l5.484,5.356l-1.301,7.59c-0.15,0.894,0.211,1.781,0.941,2.315c0.417,0.305,0.906,0.459,1.397,0.459c0.366,0,0.734-0.086,1.073-0.26l6.979-3.528l6.625,3.486c0.812,0.42,1.772,0.347,2.509-0.193c0.733-0.538,1.091-1.429,0.935-2.319l-1.296-7.549l5.482-5.351C100.346,35.544,100.578,34.615,100.299,33.749z M91.578,39.946c-0.35,0.341-0.509,0.833-0.426,1.313l1.226,7.139l-6.235-3.281c-0.426-0.224-0.932-0.228-1.361-0.011l-6.608,3.341l1.231-7.188c0.083-0.481-0.076-0.972-0.426-1.313l-5.178-5.056l7.16-1.04c0.483-0.07,0.901-0.375,1.117-0.813l3.198-6.488l3.202,6.488c0.216,0.438,0.634,0.742,1.117,0.812l7.163,1.041L91.578,39.946z"/>
  <path d="M26.422,51.337c0.738-0.538,1.098-1.43,0.939-2.322l-1.292-7.549l5.482-5.35c0.652-0.635,0.884-1.567,0.603-2.434c-0.28-0.866-1.014-1.485-1.914-1.617l-7.586-1.102l-3.393-6.877c-0.407-0.812-1.222-1.317-2.129-1.317c-0.002,0-0.004,0-0.006,0c-0.907,0.002-1.721,0.509-2.123,1.323v0.001l-3.387,6.87l-7.581,1.102c-0.906,0.132-1.642,0.755-1.921,1.626c-0.277,0.868-0.042,1.799,0.606,2.421l5.485,5.352l-1.3,7.581c-0.154,0.89,0.201,1.776,0.929,2.313c0.419,0.31,0.912,0.467,1.409,0.467c0.365,0,0.733-0.085,1.073-0.258l6.979-3.532l6.616,3.481C24.724,51.946,25.685,51.876,26.422,51.337z M16.641,45.042l-6.607,3.344l1.231-7.188c0.083-0.481-0.077-0.973-0.426-1.313L5.657,34.83l7.16-1.041c0.483-0.07,0.901-0.375,1.117-0.813l3.2-6.491l3.203,6.491c0.216,0.438,0.634,0.742,1.117,0.812l7.163,1.041l-5.181,5.055c-0.349,0.341-0.509,0.832-0.426,1.313l1.221,7.133l-6.23-3.278C17.577,44.829,17.069,44.826,16.641,45.042z"/>
  <path d="M47.274,66.162l-7.584-1.098l-3.392-6.879c-0.407-0.81-1.222-1.312-2.127-1.312c-0.002,0-0.004,0-0.006,0c-0.906,0.002-1.719,0.507-2.121,1.318c-0.001,0.001-0.002,0.002-0.002,0.004l-3.387,6.869l-7.59,1.1c-0.904,0.137-1.639,0.764-1.915,1.636c-0.274,0.865-0.039,1.792,0.606,2.412l5.487,5.352l-1.299,7.583c-0.153,0.89,0.2,1.775,0.925,2.312c0.418,0.31,0.911,0.468,1.409,0.468c0.365,0,0.732-0.085,1.074-0.257l6.979-3.535l6.62,3.481c0.81,0.424,1.768,0.357,2.507-0.18c0.736-0.535,1.099-1.425,0.944-2.321l-1.296-7.553l5.479-5.346c0.652-0.63,0.886-1.558,0.609-2.423C48.918,66.925,48.186,66.3,47.274,66.162z M40.476,73.982c-0.35,0.341-0.509,0.832-0.426,1.313l1.224,7.135l-6.238-3.28c-0.424-0.224-0.932-0.228-1.361-0.01l-6.604,3.344l1.231-7.189c0.083-0.481-0.077-0.972-0.427-1.313l-5.183-5.055l7.162-1.038c0.484-0.07,0.902-0.374,1.118-0.813l3.199-6.49l3.2,6.49c0.216,0.439,0.634,0.743,1.118,0.813l7.165,1.038L40.476,73.982z"/>
  <path d="M81.346,66.223l-7.584-1.102l-3.393-6.881c-0.407-0.809-1.222-1.311-2.126-1.311c-0.002,0-0.004,0-0.006,0c-0.905,0.002-1.718,0.507-2.122,1.316c-0.001,0.002-0.001,0.004-0.002,0.006l-3.387,6.869l-7.582,1.102c-0.902,0.132-1.639,0.752-1.919,1.62c-0.28,0.866-0.049,1.799,0.604,2.432l5.483,5.345l-1.296,7.582c-0.153,0.888,0.199,1.773,0.922,2.311c0.418,0.312,0.913,0.471,1.414,0.471c0.363,0,0.729-0.084,1.072-0.254l6.979-3.535l6.619,3.477c0.808,0.427,1.771,0.358,2.509-0.181c0.737-0.537,1.097-1.428,0.939-2.318l-1.293-7.552l5.486-5.347c0.651-0.637,0.88-1.57,0.599-2.436C82.982,66.973,82.247,66.354,81.346,66.223z M74.548,74.039c-0.35,0.341-0.51,0.832-0.427,1.313l1.222,7.134l-6.235-3.275c-0.424-0.224-0.932-0.228-1.361-0.01l-6.605,3.345l1.229-7.194c0.083-0.481-0.077-0.972-0.427-1.313l-5.182-5.051l7.165-1.041c0.483-0.07,0.901-0.375,1.117-0.813l3.2-6.491l3.2,6.491c0.216,0.438,0.634,0.743,1.117,0.813l7.169,1.041L74.548,74.039z"/>
</g>
</svg>`;

const SVG_HDR_BIG5_ASPECTS = `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 100.353 100.353" style="enable-background:new 0 0 100.353 100.353;" xml:space="preserve">
<path d="M87.351,45.955c0.489-0.669,0.343-1.607-0.326-2.096L71.531,32.533l-0.065-0.049c-0.809-1.39-1.059-2.635-0.632-3.217
	c0.396-0.541,1.564-0.702,3.022-0.424c0.152,0.068,0.319,0.111,0.495,0.124c1.995,0.15,3.59-0.443,4.494-1.672
	c1.071-1.463,0.986-3.521-0.238-5.795c-1.039-1.928-2.827-3.879-5.035-5.493c-3.269-2.39-6.905-3.62-9.495-3.219
	c-1.236,0.193-2.225,0.754-2.853,1.616c-0.769,1.044-0.942,2.447-0.508,3.997c-0.017,0.303,0.059,0.607,0.222,0.872
	c0.917,1.485,1.22,2.84,0.769,3.455c-0.396,0.542-1.56,0.7-3.006,0.424L42.954,11.642c-0.321-0.235-0.722-0.334-1.116-0.271
	c-0.393,0.061-0.746,0.276-0.98,0.597L29.162,27.973c-0.121,0.166-0.207,0.354-0.252,0.554c-0.651,2.875-0.099,5.202,1.52,6.386
	c1.622,1.18,3.988,1,6.526-0.483c0.002-0.001,0.004-0.001,0.006-0.002c0.8-0.304,1.475-0.341,1.809-0.093
	c0.452,0.33,0.591,1.358,0.354,2.619c-0.318,1.696-1.268,3.718-2.606,5.547c-2.167,2.967-4.627,4.527-6.104,4.757
	c-0.303,0.047-0.72,0.062-0.985-0.132c-0.322-0.236-0.49-0.818-0.469-1.613c0.638-2.886,0.095-5.128-1.535-6.321
	c-1.683-1.224-4.162-0.987-6.801,0.646c-0.165,0.102-0.309,0.234-0.423,0.391L8.646,56.044c-0.488,0.669-0.342,1.607,0.326,2.096
	l16.008,11.7c0.166,0.121,0.355,0.207,0.556,0.253c2.918,0.653,5.186,0.116,6.381-1.519c1.16-1.582,1.013-3.885-0.389-6.369
	c-0.015-0.065-0.034-0.131-0.057-0.195c-0.283-0.77-0.308-1.4-0.067-1.729c0.705-0.966,4.322-0.559,8.167,2.25
	c3.84,2.81,5.322,6.131,4.62,7.091c-0.223,0.303-0.746,0.469-1.462,0.472c-0.05-0.018-0.102-0.032-0.154-0.044
	c-2.87-0.644-5.199-0.09-6.383,1.527c-1.235,1.699-1.006,4.113,0.647,6.799c0.102,0.166,0.235,0.311,0.393,0.425l15.813,11.555
	c0.267,0.195,0.576,0.289,0.884,0.289c0.462,0,0.918-0.213,1.212-0.615l11.431-15.636c1.389-0.806,2.633-1.055,3.211-0.631
	c0.489,0.358,0.972,1.857,0.6,3.66c-0.036,0.119-0.059,0.243-0.063,0.37c-0.11,2.433,0.854,3.667,1.688,4.278
	c2.766,2.014,7.616-0.252,11.282-5.273c3.675-5.027,4.364-10.34,1.598-12.362c-0.806-0.582-2.223-1.12-4.394-0.373
	c-0.104,0.036-0.205,0.083-0.3,0.142c-1.648,1.019-3.285,0.862-3.868,0.438c-0.542-0.397-0.703-1.562-0.43-3.013L87.351,45.955z
	 M74.555,67.066c1.772,1.291,4.65,1.199,7.054-0.213c0.446-0.137,1.123-0.271,1.514,0.01c0.964,0.704,0.555,4.32-2.256,8.166
	c-2.805,3.838-6.122,5.326-7.091,4.62c-0.312-0.229-0.479-0.798-0.465-1.574c0.588-2.781-0.126-5.538-1.755-6.731
	c-1.677-1.228-4.158-0.994-6.807,0.646c-0.164,0.102-0.307,0.234-0.421,0.391l-10.725,14.67l-14.355-10.49
	c-0.803-1.393-1.051-2.638-0.633-3.213c0.39-0.534,1.522-0.699,2.937-0.442c0.181,0.096,0.384,0.155,0.6,0.17
	c1.975,0.135,3.562-0.459,4.459-1.677c2.018-2.76-0.247-7.612-5.27-11.288c-5.028-3.67-10.341-4.359-12.36-1.598
	c-0.776,1.062-0.943,2.487-0.485,4.053c0,0.274,0.077,0.547,0.224,0.785c0.918,1.487,1.224,2.843,0.776,3.453
	c-0.396,0.541-1.56,0.699-3.007,0.425L11.953,56.603l10.491-14.36c1.387-0.803,2.631-1.051,3.213-0.628
	c0.559,0.409,0.71,1.634,0.396,3.145c-0.045,0.13-0.073,0.267-0.081,0.407c-0.144,2.494,0.836,3.757,1.684,4.379
	c0.868,0.635,1.981,0.87,3.219,0.676c2.589-0.402,5.68-2.683,8.066-5.951c1.616-2.209,2.729-4.61,3.133-6.763
	c0.477-2.538-0.068-4.525-1.525-5.589c-1.114-0.825-2.64-0.967-4.326-0.411c-0.2,0.029-0.396,0.098-0.575,0.209
	c-1.483,0.916-2.838,1.217-3.449,0.773c-0.542-0.397-0.701-1.56-0.423-3.007l10.62-14.533l14.797,10.815
	c0.165,0.121,0.354,0.207,0.554,0.252c2.916,0.661,5.187,0.12,6.383-1.518c1.149-1.568,1.021-3.837-0.337-6.289
	c-0.016-0.091-0.04-0.182-0.072-0.271c-0.292-0.788-0.32-1.428-0.075-1.762c0.194-0.266,0.594-0.377,0.896-0.424
	c1.477-0.229,4.294,0.508,7.263,2.677c1.827,1.335,3.345,2.974,4.163,4.494c0.609,1.129,0.789,2.15,0.462,2.597
	c-0.236,0.321-0.82,0.485-1.571,0.47c-0.021-0.006-0.044-0.011-0.065-0.016c-2.922-0.651-5.187-0.109-6.379,1.523
	c-1.23,1.678-0.995,4.158,0.646,6.804c0.099,0.16,0.227,0.299,0.378,0.412l14.607,10.683L73.28,60.123
	c-0.122,0.166-0.208,0.356-0.253,0.558C72.375,63.599,72.917,65.866,74.555,67.066z"/>
</svg>`;

const SVG_HDR_DRIVERS = `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 100.25 100.25" style="enable-background:new 0 0 100.25 100.25;" xml:space="preserve">
<g>
	<path d="M50,30.5c-10.201,0-18.5,8.299-18.5,18.5S39.799,67.5,50,67.5S68.5,59.201,68.5,49S60.201,30.5,50,30.5z M50,64.5
		c-8.547,0-15.5-6.953-15.5-15.5S41.453,33.5,50,33.5S65.5,40.453,65.5,49S58.547,64.5,50,64.5z"/>
	<path d="M95.225,41.501L83.257,39.69c-0.658-2.218-1.547-4.372-2.651-6.425l7.176-9.733c0.44-0.597,0.378-1.426-0.146-1.951
		l-9.216-9.215c-0.525-0.524-1.354-0.587-1.951-0.147l-9.702,7.152c-2.062-1.12-4.23-2.022-6.466-2.691L58.5,4.776
		C58.389,4.042,57.759,3.5,57.017,3.5H43.985c-0.742,0-1.372,0.542-1.483,1.276L40.701,16.68c-2.236,0.669-4.404,1.572-6.466,2.691
		l-9.702-7.152c-0.597-0.44-1.426-0.378-1.951,0.147l-9.215,9.215c-0.524,0.524-0.587,1.354-0.147,1.951l7.176,9.733
		c-1.104,2.053-1.993,4.207-2.651,6.425L5.777,41.501c-0.734,0.111-1.276,0.741-1.276,1.483v13.032c0,0.742,0.542,1.372,1.275,1.483
		l12.027,1.82c0.665,2.194,1.552,4.319,2.647,6.341l-7.231,9.808c-0.44,0.597-0.377,1.426,0.147,1.951l9.215,9.215
		c0.524,0.525,1.354,0.587,1.951,0.147l9.84-7.254c2.012,1.08,4.124,1.954,6.3,2.607l1.829,12.09
		c0.111,0.734,0.741,1.276,1.483,1.276h13.032c0.742,0,1.372-0.542,1.483-1.276l1.829-12.09c2.176-0.653,4.288-1.527,6.3-2.607
		l9.84,7.254c0.597,0.44,1.426,0.377,1.951-0.147l9.216-9.215c0.524-0.524,0.587-1.354,0.146-1.951L80.55,65.66
		c1.096-2.022,1.983-4.147,2.647-6.341l12.027-1.82c0.733-0.111,1.275-0.741,1.275-1.483V42.984
		C96.5,42.243,95.958,41.612,95.225,41.501z M93.5,54.726l-11.703,1.771
		c-0.588,0.089-1.068,0.517-1.224,1.09c-0.704,2.595-1.748,5.095-3.103,7.432c-0.3,0.517-0.265,1.162,0.09,1.643l7.04,9.549
		l-7.391,7.391l-9.578-7.061c-0.48-0.353-1.122-0.39-1.637-0.093c-2.331,1.339-4.818,2.369-7.395,3.06
		c-0.575,0.155-1.005,0.635-1.094,1.225l-1.78,11.769H45.273l-1.78-11.769c-0.089-0.589-0.519-1.07-1.094-1.225
		c-2.577-0.691-5.064-1.721-7.395-3.06c-0.515-0.296-1.158-0.259-1.637,0.093l-9.578,7.061l-7.391-7.391l7.04-9.549
		c0.354-0.481,0.39-1.126,0.09-1.643c-1.355-2.336-2.399-4.837-3.103-7.432c-0.156-0.574-0.636-1.001-1.224-1.09L7.498,54.726V44.274
		l11.65-1.762c0.591-0.089,1.073-0.521,1.226-1.099c0.693-2.616,1.735-5.144,3.099-7.514c0.297-0.516,0.26-1.159-0.093-1.638
		l-6.982-9.471l7.391-7.391l9.443,6.961c0.481,0.354,1.126,0.39,1.644,0.089c2.375-1.38,4.916-2.437,7.55-3.142
		c0.576-0.154,1.006-0.635,1.095-1.225l1.752-11.583h10.452l1.752,11.583c0.089,0.59,0.519,1.071,1.095,1.225
		c2.634,0.705,5.174,1.762,7.55,3.142c0.517,0.302,1.162,0.265,1.644-0.089l9.443-6.961L84.6,22.79l-6.982,9.471
		c-0.353,0.479-0.39,1.122-0.093,1.638c1.363,2.37,2.406,4.898,3.099,7.514c0.153,0.578,0.635,1.009,1.226,1.099l11.65,1.762
		L93.5,54.726z"/>
</g>
</svg>`;

const SVG_HDR_INTEL = `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 100.75 100.75" style="enable-background:new 0 0 100.75 100.75;" xml:space="preserve">
<path d="M93.486,22.069L77.931,6.514c-0.586-0.586-1.535-0.586-2.121,0L48.135,34.188L31.428,17.75
	c-0.013-0.013-0.03-0.022-0.044-0.034c-0.055-0.05-0.114-0.095-0.177-0.137c-0.03-0.02-0.058-0.042-0.089-0.06
	c-0.074-0.042-0.153-0.075-0.235-0.105c-0.021-0.007-0.039-0.02-0.06-0.027L8.195,10.317c-0.53-0.165-1.113-0.023-1.508,0.371
	c-0.395,0.395-0.538,0.976-0.371,1.508l7.071,22.627c0.043,0.137,0.109,0.263,0.188,0.381c0.025,0.038,0.055,0.069,0.083,0.104
	c0.037,0.046,0.067,0.096,0.109,0.137l16.69,16.421L6.514,75.81c-0.586,0.586-0.586,1.535,0,2.121l15.556,15.557
	c0.281,0.281,0.663,0.439,1.061,0.439s0.779-0.158,1.061-0.439l24.19-24.19l19.572,19.021c0.25,0.241,0.564,0.358,0.885,0.393
	c2.27,2.105,5.198,3.27,8.312,3.27c3.272,0,6.349-1.274,8.662-3.588c4.713-4.713,4.766-12.338,0.177-17.128
	c-0.073-0.249-0.203-0.479-0.393-0.662L65.968,51.711l27.519-27.52C94.072,23.604,94.072,22.655,93.486,22.069z M28.521,19.812
	l-1.121,3.81l-5.226,1.537c-0.489,0.144-0.872,0.526-1.016,1.016L19.622,31.4l-3.811,1.121l-5.777-18.486L28.521,19.812z
	 M23.13,90.306L9.695,76.87l5.652-5.652l6.717,6.717c0.293,0.293,0.677,0.439,1.061,0.439s0.768-0.146,1.061-0.439
	c0.586-0.586,0.586-1.535,0-2.121l-6.717-6.717l5.504-5.504l6.717,6.717c0.293,0.293,0.677,0.439,1.061,0.439
	s0.768-0.146,1.061-0.439c0.586-0.586,0.586-1.535,0-2.121l-6.717-6.717l7.509-7.509l13.627,13.244L23.13,90.306z M83.689,86.272
	c-3.357,3.355-8.668,3.584-12.296,0.695l12.992-12.992C87.274,77.604,87.045,82.917,83.689,86.272z M68.983,85.136L33.541,50.691
	L17.689,35.095l3.565-1.048c0.489-0.144,0.872-0.526,1.016-1.016l1.537-5.225l5.226-1.537c0.489-0.144,0.872-0.526,1.016-1.016
	l1.062-3.609l31.646,31.136l19.659,18.924L68.983,85.136z M63.817,49.619L50.273,36.292l7.699-7.699l6.717,6.717
	c0.293,0.293,0.677,0.439,1.061,0.439s0.768-0.146,1.061-0.439c0.586-0.585,0.586-1.536,0-2.121l-6.717-6.717l6.254-6.254
	l6.717,6.717c0.293,0.293,0.677,0.439,1.061,0.439s0.768-0.146,1.061-0.439c0.586-0.585,0.586-1.536,0-2.121l-6.717-6.717
	l8.402-8.402L90.305,23.13L63.817,49.619z"/>
</svg>`;

const SVG_HDR_SELF = `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 100.25 100.25" style="enable-background:new 0 0 100.25 100.25;" xml:space="preserve">
<g>
	<path d="M50,30.5c-10.201,0-18.5,8.299-18.5,18.5S39.799,67.5,50,67.5S68.5,59.201,68.5,49S60.201,30.5,50,30.5z M50,64.5
		c-8.547,0-15.5-6.953-15.5-15.5S41.453,33.5,50,33.5S65.5,40.453,65.5,49S58.547,64.5,50,64.5z"/>
	<path d="M95.225,41.501L83.257,39.69c-0.658-2.218-1.547-4.372-2.651-6.425l7.176-9.733c0.44-0.597,0.378-1.426-0.146-1.951
		l-9.216-9.215c-0.525-0.524-1.354-0.587-1.951-0.147l-9.702,7.152c-2.062-1.12-4.23-2.022-6.466-2.691L58.5,4.776
		C58.389,4.042,57.759,3.5,57.017,3.5H43.985c-0.742,0-1.372,0.542-1.483,1.276L40.701,16.68c-2.236,0.669-4.404,1.572-6.466,2.691
		l-9.702-7.152c-0.597-0.44-1.426-0.378-1.951,0.147l-9.215,9.215c-0.524,0.524-0.587,1.354-0.147,1.951l7.176,9.733
		c-1.104,2.053-1.993,4.207-2.651,6.425L5.777,41.501c-0.734,0.111-1.276,0.741-1.276,1.483v13.032c0,0.742,0.542,1.372,1.275,1.483
		l12.027,1.82c0.665,2.194,1.552,4.319,2.647,6.341l-7.231,9.808c-0.44,0.597-0.377,1.426,0.147,1.951l9.215,9.215
		c0.524,0.525,1.354,0.587,1.951,0.147l9.84-7.254c2.012,1.08,4.124,1.954,6.3,2.607l1.829,12.09
		c0.111,0.734,0.741,1.276,1.483,1.276h13.032c0.742,0,1.372-0.542,1.483-1.276l1.829-12.09c2.176-0.653,4.288-1.527,6.3-2.607
		l9.84,7.254c0.597,0.44,1.426,0.377,1.951-0.147l9.216-9.215c0.524-0.524,0.587-1.354,0.146-1.951L80.55,65.66
		c1.096-2.022,1.983-4.147,2.647-6.341l12.027-1.82c0.733-0.111,1.275-0.741,1.275-1.483V42.984
		C96.5,42.243,95.958,41.612,95.225,41.501z M93.5,54.726l-11.703,1.771c-0.588,0.089-1.068,0.517-1.224,1.09
		c-0.704,2.595-1.748,5.095-3.103,7.432c-0.3,0.517-0.265,1.162,0.09,1.643l7.04,9.549l-7.391,7.391l-9.578-7.061
		c-0.48-0.353-1.122-0.39-1.637-0.093c-2.331,1.339-4.818,2.369-7.395,3.06c-0.575,0.155-1.005,0.635-1.094,1.225l-1.78,11.769
		H45.273l-1.78-11.769c-0.089-0.589-0.519-1.07-1.094-1.225c-2.577-0.691-5.064-1.721-7.395-3.06
		c-0.515-0.296-1.158-0.259-1.637,0.093l-9.578,7.061l-7.391-7.391l7.04-9.549c0.354-0.481,0.39-1.126,0.09-1.643
		c-1.355-2.336-2.399-4.837-3.103-7.432c-0.156-0.574-0.636-1.001-1.224-1.09L7.498,54.726V44.274l11.65-1.762
		c0.591-0.089,1.073-0.521,1.226-1.099c0.693-2.616,1.735-5.144,3.099-7.514c0.297-0.516,0.26-1.159-0.093-1.638l-6.982-9.471
		l7.391-7.391l9.443,6.961c0.481,0.354,1.126,0.39,1.644,0.089c2.375-1.38,4.916-2.437,7.55-3.142
		c0.576-0.154,1.006-0.635,1.095-1.225l1.752-11.583h10.452l1.752,11.583c0.089,0.59,0.519,1.071,1.095,1.225
		c2.634,0.705,5.174,1.762,7.55,3.142c0.517,0.302,1.162,0.265,1.644-0.089l9.443-6.961L84.6,22.79l-6.982,9.471
		c-0.353,0.479-0.39,1.122-0.093,1.638c1.363,2.37,2.406,4.898,3.099,7.514c0.153,0.578,0.635,1.009,1.226,1.099l11.65,1.762
		L93.5,54.726L93.5,54.726z"/>
</g>
</svg>`;

const SVG_HDR_SELFESTEEM = `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
  viewBox="0 0 100.354 100.352" style="enable-background:new 0 0 100.354 100.352;" xml:space="preserve">
<g>
  <path d="M49.92,5.223c-24.603,0-44.619,20.016-44.619,44.619c0,24.604,20.016,44.619,44.619,44.619
    c24.604,0,44.619-20.016,44.619-44.619C94.539,25.239,74.523,5.223,49.92,5.223z M49.92,91.461
    c-22.949,0-41.619-18.67-41.619-41.619c0-22.949,18.67-41.619,41.619-41.619c22.949,0,41.619,18.67,41.619,41.619
    C91.539,72.791,72.869,91.461,49.92,91.461z"/>
  <path d="M68.267,57.09H31.577c-0.829,0-1.5,0.672-1.5,1.5c0,10.943,8.901,19.846,19.843,19.846
    c10.943,0,19.847-8.902,19.847-19.846C69.767,57.762,69.095,57.09,68.267,57.09z M49.92,75.436
    c-8.782,0-16.015-6.757-16.776-15.346H66.7C65.938,68.679,58.703,75.436,49.92,75.436z"/>
  <path d="M39.074,36.458c0-4.045-3.292-7.337-7.337-7.337c-4.045,0-7.337,3.292-7.337,7.337s3.292,7.337,7.337,7.337
    C35.783,43.795,39.074,40.503,39.074,36.458z M27.4,36.458c0-2.392,1.945-4.337,4.337-4.337s4.337,1.945,4.337,4.337
    s-1.946,4.337-4.337,4.337S27.4,38.849,27.4,36.458z"/>
  <path d="M67.27,29.121c-4.046,0-7.337,3.292-7.337,7.337s3.291,7.337,7.337,7.337s7.338-3.292,7.338-7.337
    S71.315,29.121,67.27,29.121z M67.27,40.795c-2.392,0-4.337-1.945-4.337-4.337s1.945-4.337,4.337-4.337s4.338,1.945,4.338,4.337
    S69.661,40.795,67.27,40.795z"/>
</g>
</svg>`;

const SVG_HDR_KARASEK = `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 100.75 100.75" style="enable-background:new 0 0 100.75 100.75;" xml:space="preserve">
<path d="M88.009,28.194H71.807v-0.583c0-7.718-6.279-13.996-13.997-13.996H42.19c-7.718,0-13.996,6.278-13.996,13.996v0.583H11.991
	c-0.828,0-1.5,0.672-1.5,1.5v55.191c0,0.828,0.672,1.5,1.5,1.5H88.01c0.828,0,1.5-0.672,1.5-1.5V29.694
	C89.509,28.866,88.837,28.194,88.009,28.194z M31.194,27.611c0-6.063,4.933-10.996,10.996-10.996h15.62
	c6.063,0,10.997,4.933,10.997,10.996v0.583H31.194V27.611z M86.509,31.194v17.827h-29.74c-0.828,0-1.5,0.672-1.5,1.5v5.728
	c0,3.192-2.597,5.789-5.789,5.789s-5.79-2.597-5.79-5.789v-5.728c0-0.828-0.672-1.5-1.5-1.5H13.491V31.194H86.509z M13.491,83.386
	V52.022H40.69v4.228c0,4.847,3.943,8.789,8.79,8.789s8.789-3.942,8.789-8.789v-4.228h28.24v31.364H13.491z"/>
</svg>`;

const SVG_HDR_BURNOUT = `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 100.8 100.7" style="enable-background:new 0 0 100.8 100.7;" xml:space="preserve">
<g>
	<path d="M82.5,41.4c-6-5.1-13.8-8.2-22.3-8.2c-2.6,0-5.1,0.3-7.5,0.8c-1.3-6.7-6.4-11.6-14.9-14.1c-6.4-1.9-12.5-1.7-12.7-1.7
		c-0.8,0-1.4,0.7-1.5,1.5c0,0.8,0.6,1.5,1.4,1.5c5.3,0.3,6.7,7,7.1,9c0.8,5-0.4,8.9-1.3,9.2c-0.9,0.4-2,0.2-3.1-0.3
		c-2.4-1.2-5.6-4.7-7.4-11.1C15.6,12.5,3.7,13.6,3.5,13.6c-0.7,0.1-1.3,0.7-1.3,1.4c0,0.7,0.4,1.4,1.2,1.6c6.3,1.4,5,11.9,3.9,21.2
		c-0.4,3.5-0.8,6.8-0.8,9.5C6.9,70.3,23,73,26.2,73.3c1.5,9.2,6.7,17.5,14.6,22.9c0.2,0.2,0.5,0.3,0.8,0.3h37.2
		c0.4,0,0.8-0.2,1.1-0.5c9.2-6.5,14.7-17,14.7-28.3c0-9.4-3.8-18-10-24.3 M9.5,47.2c0-2.4,0.3-5.7,0.7-9c0.8-7,1.8-15.2-0.8-20.2
		c2.8,1.5,6,4.6,7.8,11c1.8,6.2,5.2,11,9,12.9c1.9,0.9,3.8,1.1,5.5,0.4c3.1-1.2,4-7.3,3.2-12.5c-0.5-3.3-1.7-6.1-3.2-8
		c6.7,1,16.3,4.1,18,13.1c-13.9,4.4-24,17.5-24,32.9c0,0.9,0,1.7,0.1,2.6C22.2,69.8,9.9,66.8,9.5,47.2z M78.3,93.4H42.1
		c-8.2-5.8-13.1-15.1-13.4-25.1h5.9c0.8,0,1.5-0.7,1.5-1.5s-0.7-1.5-1.5-1.5h-5.8c0.5-7,3.4-13.4,7.8-18.4l4.4,4.4
		c0.3,0.3,0.7,0.4,1.1,0.4s0.8-0.1,1.1-0.4c0.6-0.6,0.6-1.5,0-2.1l-4.5-4.5c5.3-5,12.3-8.1,20-8.5v6.4c0,0.8,0.7,1.5,1.5,1.5
		s1.5-0.7,1.5-1.5v-6.4c7.1,0.3,13.5,3,18.6,7.3L74.8,49c-0.6,0.6-0.6,1.5,0,2.1c0.3,0.3,0.7,0.4,1.1,0.4s0.8-0.1,1.1-0.4l5.6-5.6
		c4.4,4.4,7.5,10.2,8.6,16.6c0,0.1,0.3,3,0.3,3.1l-5.7,0c-0.8,0-1.5,0.7-1.5,1.5c0,0.8,0.7,1.5,1.5,1.5h5.9c0.1,0.8,0-1.3,0-0.5
		C91.7,77.9,86.7,87.5,78.3,93.4z"/>
	<path d="M80.4,65.3H67.1c-0.7-3.2-3.5-5.5-6.9-5.5c-3.9,0-7,3.2-7,7s3.2,7,7,7c3.4,0,6.2-2.4,6.9-5.5h13.4c0.8,0,1.5-0.7,1.5-1.5
		S81.2,65.3,80.4,65.3z M60.2,70.8c-2.2,0-4-1.8-4-4s1.8-4,4-4s4.1,1.8,4.1,4S62.4,70.8,60.2,70.8z"/>
	<path d="M55.8,21.8c2.7,2,5.3,3.9,6,5.8c0.2,0.6,0.8,0.9,1.4,0.9c0,0,0,0,0,0c0.6,0,1.1-0.3,1.4-0.9c1.6-3.4,2.6-11.2-4.8-16.1
		c-2-1.3-3.9-2.4-5.5-3.3c-2.7-1.5-4.9-2.7-6.5-4.6c-0.4-0.4-1-0.6-1.6-0.5c-0.6,0.2-1,0.6-1.1,1.2c0,0.3-0.9,6.8,5.2,12.9
		C51.9,19,53.9,20.4,55.8,21.8z M52.8,10.9c1.6,0.9,3.4,1.9,5.3,3.2c4.4,2.9,4.8,6.9,4.5,9.5c-1.4-1.4-3.2-2.8-5-4.1
		c-1.8-1.3-3.7-2.7-5.1-4.2c-2.5-2.5-3.6-5-4.1-7C49.7,9.2,51.2,10,52.8,10.9z"/>
</g>
</svg>`;

const SVG_BO_EX = `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 100.25 100.25" style="enable-background:new 0 0 100.25 100.25;" xml:space="preserve">
<g>
	<path d="M83.185,54.724c3.428-3.459,5.315-8.133,5.315-13.161C88.5,30.776,79.383,22,68.176,22
		c-7.834,0-14.841,4.332-18.208,10.903c-3.394-6.5-10.375-10.783-18.144-10.783c-11.207,0-20.324,8.776-20.324,19.563
		c0,5.01,1.857,9.652,5.229,13.07c7.745,7.85,32,30.612,32.245,30.841C49.262,85.864,49.631,86,50,86
		c0.371,0,0.741-0.137,1.03-0.409C51.272,85.361,75.429,62.546,83.185,54.724z M49.997,82.438
		C45.274,78,25.656,59.529,18.865,52.646C16.05,49.793,14.5,45.9,14.5,41.683c0-9.133,7.771-16.563,17.324-16.563
		c7.818,0,14.692,5.049,16.715,12.277c0.181,0.648,0.772,1.096,1.444,1.096c0.002,0,0.003,0,0.005,0
		c0.675-0.002,1.265-0.455,1.442-1.106C53.416,30.094,60.302,25,68.176,25C77.729,25,85.5,32.43,85.5,41.563
		c0,4.232-1.579,8.156-4.446,11.048C74.248,59.476,54.703,77.987,49.997,82.438z"/>
	<path d="M11.158,57.407C7.832,53.919,6,49.158,6,44c0-0.829-0.671-1.5-1.5-1.5S3,43.171,3,44c0,5.932,2.126,11.429,5.987,15.478
		c1.704,1.788,4.211,4.339,7.452,7.583c0.293,0.293,0.677,0.439,1.061,0.439c0.384,0,0.767-0.146,1.06-0.438
		c0.586-0.586,0.586-1.535,0.001-2.122C15.337,61.713,12.846,59.179,11.158,57.407z"/>
	<path d="M93.226,27.635c-0.478-0.677-1.414-0.838-2.091-0.36c-0.677,0.478-0.838,1.414-0.36,2.091
		c2.438,3.452,3.726,7.538,3.726,11.815c0,3.417-0.807,6.742-2.333,9.617c-0.388,0.731-0.11,1.64,0.622,2.028
		C93.013,52.944,93.254,53,93.491,53c0.537,0,1.057-0.289,1.326-0.797c1.755-3.306,2.683-7.118,2.683-11.023
		C97.5,36.28,96.021,31.596,93.226,27.635z"/>
	<path d="M85.933,59.949c-3.715,3.783-9.094,9.161-15.985,15.985c-0.589,0.582-0.593,1.532-0.01,2.121
		c0.293,0.296,0.679,0.444,1.065,0.444c0.382,0,0.763-0.145,1.056-0.435c6.901-6.833,12.289-12.222,16.015-16.015
		c0.58-0.591,0.572-1.54-0.02-2.121C87.463,59.35,86.514,59.358,85.933,59.949z"/>
	<path d="M25.542,33.421c-0.595-0.575-1.545-0.559-2.121,0.037c-4.548,4.71-4.548,12.374,0,17.084C23.715,50.847,24.107,51,24.5,51
		c0.375,0,0.751-0.14,1.042-0.421c0.596-0.576,0.612-1.525,0.037-2.121c-3.439-3.561-3.439-9.355,0-12.916
		C26.154,34.946,26.138,33.997,25.542,33.421z"/>
</g>
</svg>`;

const SVG_BO_DE = `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 100.353 100.353" style="enable-background:new 0 0 100.353 100.353;" xml:space="preserve">
<g>
	<path d="M49.106,50.437c-12.167,0-22.066,9.898-22.066,22.065c0,0.828,0.671,1.5,1.5,1.5h41.131c0.828,0,1.5-0.672,1.5-1.5
		C71.171,60.335,61.272,50.437,49.106,50.437z M30.099,71.002c0.768-9.814,9-17.565,19.007-17.565
		c10.007,0,18.239,7.751,19.006,17.565H30.099z"/>
	<path d="M48.746,48.456c7.143,0,12.954-5.811,12.954-12.954c0-7.143-5.812-12.954-12.954-12.954
		c-7.143,0-12.954,5.811-12.954,12.954C35.792,42.645,41.603,48.456,48.746,48.456z M48.746,25.548c5.488,0,9.954,4.465,9.954,9.954
		c0,5.488-4.466,9.954-9.954,9.954c-5.489,0-9.954-4.465-9.954-9.954C38.792,30.013,43.257,25.548,48.746,25.548z"/>
	<path d="M19.78,58.714c2.461,0,4.878,0.656,6.99,1.898c0.714,0.422,1.634,0.181,2.053-0.532c0.42-0.714,0.182-1.634-0.533-2.054
		c-2.572-1.513-5.515-2.312-8.51-2.312c-9.257,0-16.788,7.531-16.788,16.788c0,0.828,0.671,1.5,1.5,1.5h19.012
		c0.829,0,1.5-0.672,1.5-1.5s-0.671-1.5-1.5-1.5H6.073C6.823,64.102,12.684,58.714,19.78,58.714z"/>
	<path d="M19.514,53.319c5.521,0,10.014-4.492,10.014-10.014c0-5.522-4.492-10.014-10.014-10.014
		c-5.522,0-10.014,4.492-10.014,10.014C9.5,48.826,13.992,53.319,19.514,53.319z M19.514,36.291c3.867,0,7.014,3.146,7.014,7.014
		c0,3.867-3.146,7.014-7.014,7.014c-3.868,0-7.014-3.146-7.014-7.014C12.5,39.437,15.646,36.291,19.514,36.291z"/>
	<path d="M78.553,55.714c-2.994,0-5.937,0.8-8.51,2.312c-0.715,0.42-0.953,1.339-0.533,2.053c0.42,0.716,1.342,0.953,2.053,0.533
		c2.113-1.242,4.53-1.898,6.99-1.898c7.096,0,12.957,5.388,13.707,12.288H74.832c-0.828,0-1.5,0.672-1.5,1.5s0.672,1.5,1.5,1.5
		h19.009c0.828,0,1.5-0.672,1.5-1.5C95.341,63.245,87.81,55.714,78.553,55.714z"/>
	<path d="M78.82,53.319c5.521,0,10.014-4.492,10.014-10.014c0-5.522-4.492-10.014-10.014-10.014
		c-5.522,0-10.015,4.492-10.015,10.014C68.806,48.826,73.298,53.319,78.82,53.319z M78.82,36.291c3.867,0,7.014,3.146,7.014,7.014
		c0,3.867-3.146,7.014-7.014,7.014c-3.868,0-7.015-3.146-7.015-7.014C71.806,39.437,74.952,36.291,78.82,36.291z"/>
</g>
</svg>`;

const SVG_BO_PR = `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 100.353 100.353" style="enable-background:new 0 0 100.353 100.353;" xml:space="preserve">
<g>
	<path d="M53.378,5.489c-18.718,0-33.946,15.229-33.946,33.949c0,1.265,0.069,2.532,0.206,3.777
		c-2.465,2.71-9.632,11.272-5.893,15.386c0.752,0.829,3.997,2.982,6.347,3.868l-0.016,4.191c0,8.871,6.101,18.3,17.358,18.299
		l6.256,0.207v7.844c0,0.828,0.671,1.5,1.5,1.5s1.5-0.672,1.5-1.5v-9.295c0-0.81-0.642-1.473-1.45-1.499l-7.756-0.256
		c-9.459,0-14.408-7.697-14.408-15.294l0.02-5.251c0-0.1-0.009-0.2-0.029-0.301c-0.129-0.645-0.658-1.117-1.287-1.194
		c-0.907-0.314-4.636-2.037-5.814-3.336c-0.99-1.089,0.661-5.807,6.336-11.832c0.309-0.328,0.454-0.777,0.396-1.224
		c-0.176-1.34-0.265-2.716-0.265-4.091c0-17.065,13.882-30.949,30.946-30.949c17.067,0,30.953,13.884,30.953,30.949
		c0,8.861-3.812,17.311-10.458,23.182c-0.322,0.284-0.507,0.693-0.507,1.123l-0.021,29.093c-0.001,0.828,0.671,1.5,1.499,1.501
		h0.001c0.828,0,1.499-0.671,1.5-1.499l0.021-28.426c6.977-6.418,10.965-15.48,10.965-24.974C87.331,20.718,72.1,5.489,53.378,5.489
		z"/>
	<path d="M53.473,20.24c-11.011,0-19.97,8.951-19.97,19.953c0,0.829,0.671,1.5,1.5,1.5s1.5-0.671,1.5-1.5
		c0-9.348,7.613-16.953,16.97-16.953c9.354,0,16.963,7.605,16.963,16.953c0,5.126-2.17,9.927-5.805,12.843
		c-2.151,1.727-5.772,3.547-10.799,2.431c-7.729-1.721-8.329-9.502-8.329-11.847c0-4.872,3.836-8.843,8.577-8.911
		c0.078,0.013,0.158,0.019,0.238,0.019c2.668,0,4.838,2.17,4.838,4.837c0,2.672-2.17,4.845-4.838,4.845c-0.828,0-1.5,0.671-1.5,1.5
		s0.672,1.5,1.5,1.5c4.322,0,7.838-3.52,7.838-7.845c0-4.275-3.442-7.762-7.701-7.836c-0.083-0.014-0.167-0.021-0.251-0.021
		c-6.452,0-11.701,5.344-11.701,11.912c0,5.994,2.805,13.022,10.678,14.774c1.223,0.272,2.438,0.406,3.635,0.406
		c3.529,0,6.881-1.169,9.692-3.424c4.338-3.48,6.928-9.156,6.928-15.184C73.436,29.191,64.48,20.24,53.473,20.24z"/>
</g>
</svg>`;

function toNum_(x){
  const v = parseFloat(String(x||'').replace(',','.').trim());
  return isFinite(v) ? v : null;
}

function formatScore_(x){
  const v = toNum_(x);
  return v == null ? String(x||'') : v.toFixed(1);
}

function levelFromScore_(score){
  const v = toNum_(score);
  if (v == null) return '';
  if (v >= 4.0) return 'Высокий';
  if (v >= 3.6) return 'Средний';
  return 'Низкий';
}

function levelClass(level){
  const t = String(level || '').trim().toLowerCase();
  if (!t) return 'level-pill';
  if (t.startsWith('выс')) return 'level-pill level-high';
  if (t.startsWith('сре')) return 'level-pill level-mid';
  if (t.startsWith('низ')) return 'level-pill level-low';
  return 'level-pill';
}

function scoreByBinsClass_(val, bins){
  const n = toNum_(val);
  if (n == null) return '';
  if (n === 0) return 'score-zero';
  for (let i=0;i<bins.length;i++){
    if (n <= bins[i].max) return bins[i].cls;
  }
  return bins[bins.length-1].cls;
}

const SCORE_BINS = {
  via: [
    {max:5,  cls:'score-red'},
    {max:10, cls:'score-lred'},
    {max:15, cls:'score-yellow'},
    {max:20, cls:'score-lgreen'},
    {max:25, cls:'score-green'}
  ],
  oneToFive: [
    {max:2.2, cls:'score-red'},
    {max:3.0, cls:'score-orange'},
    {max:3.8, cls:'score-yellow'},
    {max:4.4, cls:'score-lgreen'},
    {max:5.0, cls:'score-green'}
  ],
  driversTest: [
    {max:2,  cls:'score-red'},
    {max:4,  cls:'score-lred'},
    {max:6,  cls:'score-orange'},
    {max:8,  cls:'score-yellow'},
    {max:10, cls:'score-lgreen'},
    {max:15, cls:'score-green'}
  ],
  driversSelf: [
    {max:16, cls:'score-red'},
    {max:19, cls:'score-orange'},
    {max:20, cls:'score-yellow'},
    {max:23, cls:'score-lgreen'},
    {max:35, cls:'score-green'}
  ],
  b5MainSelf: [
    {max:12, cls:'score-red'},
    {max:15, cls:'score-lred'},
    {max:21, cls:'score-orange'},
    {max:24, cls:'score-yellow'},
    {max:26, cls:'score-green'}
  ],
b5MainTest: [
  {max:3.2,  cls:'score-red'},     // 2.0–3.2
  {max:3.5,  cls:'score-orange'},  // 3.3–3.5
  {max:3.7,  cls:'score-yellow'},  // 3.6–3.7
  {max:3.99, cls:'score-lgreen'},  // 3.8–3.99
  {max:4.5,  cls:'score-green'}    // 4.0–4.5
],
  intelSelf: [
    {max:2, cls:'score-red'},
    {max:3, cls:'score-orange'},
    {max:4, cls:'score-yellow'},
    {max:6, cls:'score-green'}
  ],
  intelTest: [
    {max:24, cls:'score-red'},
    {max:26, cls:'score-lred'},
    {max:30, cls:'score-orange'},
    {max:35, cls:'score-yellow'},
    {max:50, cls:'score-green'}
  ],
};

function scoreViaClass_(v){ return scoreByBinsClass_(v, SCORE_BINS.via); }
function score1to5Class_(v){ return scoreByBinsClass_(v, SCORE_BINS.oneToFive); }
function scoreDriversTestClass_(v){ return scoreByBinsClass_(v, SCORE_BINS.driversTest); }
function scoreDriversSelfClass_(v){ return scoreByBinsClass_(v, SCORE_BINS.driversSelf); }
function scoreB5MainSelfClass_(v){ return scoreByBinsClass_(v, SCORE_BINS.b5MainSelf); }
function scoreB5MainTestClass_(v){ return scoreByBinsClass_(v, SCORE_BINS.b5MainTest); }
function scoreIntelSelfClass_(v){ return scoreByBinsClass_(v, SCORE_BINS.intelSelf); }
function scoreIntelTestClass_(v){ return scoreByBinsClass_(v, SCORE_BINS.intelTest); }


function selfEsteemResultClass_(result){
  const n = parseInt(String(result || '').replace(/\D+/g,''), 10);
  if (!isFinite(n)) return 'score-pill';
  if (n <= 15) return 'score-pill score-red';     // 0–15
  if (n <= 25) return 'score-pill score-yellow';  // 16–25
  return 'score-pill score-green';                // 26–30
}

function burnoutIcon_(label){
  const t = String(label||'').toLowerCase();
  if (t.includes('истощ')) return `<span class="bo-ico bo-ex">${SVG_BO_EX}</span>`;
  if (t.includes('деперсон')) return `<span class="bo-ico bo-de">${SVG_BO_DE}</span>`;
  if (t.includes('редукц')) return `<span class="bo-ico bo-pr">${SVG_BO_PR}</span>`;
  return '';
}

function burnoutHelp_(label){
  const t = String(label||'').toLowerCase();
  if (t.includes('истощ')) return 'Оно выражается в утрате интереса к жизни и положительного отношения к окружающим, в недовольстве работой и усталости от неё, в сниженном эмоциональном тонусе, аффективной неустойчивости и повышенной психической истощаемости. Для эмоционального истощения в целом характерно недовольство жизнью.';
  if (t.includes('деперсон')) return 'Проявляется в апатии и равнодушии, в работе «на автомате» без вовлечения в профессиональную деятельность и сопереживания. Случается, что деперсонализация может перерасти в негативизм и циничное отношение.\n\nНа поведенческом уровне она выражается в высокомерии, навешивании ярлыков, применении профессионального юмора и сленга.';
  if (t.includes('редукц')) return 'Высокое значение этой характеристики показывает негативную оценку собственной экспертности и работоспособности. В результате чего возрастает негативизм в отношении трудовой деятельности и снижается мотивация. Человеку хочется изолироваться от других людей, избавиться от ответственности и отстраниться от дел. Сначала отстранённость и избегание работы происходит на психологическом уровне, а потом уже на физическом.';
  return '';
}

function escapeHtmlBr_(s){
  return escapeHtml(s).replace(/\n{2,}/g,'<br><br>').replace(/\n/g,'<br>');
}


function burnoutLevelClass_(level){
  const s = (level||'').toLowerCase();
  if (s.includes('выс')) return 'level-pill level-low';   // высокий = красный
  if (s.includes('сред')) return 'level-pill level-mid';
  if (s.includes('низ')) return 'level-pill level-high';  // низкий = зеленый
  return 'level-pill';
}

function burnoutScoreByLevelClass_(level){
  const s = (level||'').toLowerCase();
  if (s.includes('выс')) return 'score-pill score-low';
  if (s.includes('сред')) return 'score-pill score-mid';
  if (s.includes('низ')) return 'score-pill score-high';
  return 'score-pill';
}

function scoreByLevelClass_(level){
  const s = (level||'').toLowerCase();
  if (s.includes('выс')) return 'score-pill score-high';
  if (s.includes('сред')) return 'score-pill score-mid';
  if (s.includes('низ')) return 'score-pill score-low';
  return 'score-pill';
}

function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g, ch => (
    ch === '&' ? '&amp;' :
    ch === '<' ? '&lt;' :
    ch === '>' ? '&gt;' :
    ch === '"' ? '&quot;' : '&#39;'
  ));
}

const DRIVERS_DESC_ = {
  'Экспертиза': 'Быть профессионалом, мастером в своем деле. Эта ориентация связана с наличием способностей и талантов в определенной области. Люди с такой ориентацией хотят быть мастерами своего дела, они бывают особенно счастливы, когда достигают успеха в профессиональной сфере, но быстро теряют интерес к работе, которая не позволяет развивать их способности. Вряд ли их заинтересует даже значимая более высокая должность, если она не связана с их профессиональными компетенциями. Они ищут признания своих талантов, что должно выражаться в статусе, соответствующем их мастерству. Они готовы управлять другими в пределах своей компетенции, но управление не представляет для них особого интереса.',
  'Менеджмент': 'Ориентация на управление людьми и ресурсами, ответственность за результат, координацию и принятие решений. Важны полномочия, влияние и рост масштаба задач.',
  'Независимость (автономия)': 'Стремление к самостоятельности и свободе выбора. Важны гибкость, минимальный контроль и возможность действовать по своим правилам и графику.',
  'Стабильность работы': 'Приоритет — надежность, предсказуемость и защищенность занятости. Важны гарантии, понятные правила и устойчивый доход.',
  'Стабильность места жительства': 'Важно оставаться в выбранной локации. Работа и карьерные решения подстраиваются под комфорт и устойчивость места проживания.',
  'Преданность делу': 'Ориентация на смысл и миссию. Важна работа “про ценности”, вклад в людей/общество/идею, а не только статус и деньги.',
  'Соревнование': 'Драйв от соперничества и побед. Важны метрики, сравнение, вызов и возможность быть лучшим в измеримом результате.',
  'Жизненный баланс': 'Приоритет — баланс ролей и качества жизни. Важны здоровье, семья, личное время и экологичная нагрузка.',
  'Предпринимательство': 'Ориентация на создание нового: продукт, проект, бизнес. Важны инициатива, риск, рост и владение результатом.'
};

function parseDriverLabel_(label){
  const t = String(label || '').trim();
  if (!t) return { prefix:'', name:'' };
  const i = t.indexOf(':');
  if (i < 0) return { prefix:'', name:t };
  return { prefix: t.slice(0, i).trim() + ':', name: t.slice(i+1).trim() };
}

function renderProfileHtml(p, profileName){
  p = p || {};
  const via = Array.isArray(p.via_rows) ? p.via_rows : [];
  const b5m = Array.isArray(p.big5_main) ? p.big5_main : [];
  const b5a = Array.isArray(p.big5_aspects) ? p.big5_aspects : [];
  const dh = p.drivers_header || {};
  const dr = Array.isArray(p.drivers_rows) ? p.drivers_rows : [];
  const ih = p.intellect_header || {};
  const ir = (Array.isArray(p.intellect_rows) ? p.intellect_rows : []).filter(r => r && String(r.name || '').trim());
  const il = p.intellect_lead || {};
  const se = p.selfesteem_block || {};
  const jc = Array.isArray(p.job_content_block) ? p.job_content_block : [];
  const bo = Array.isArray(p.burnout_block) ? p.burnout_block : [];

   const viaSections = new Set([
    'Сильные стороны личности (VIA)',
    'Блок 1', 'Блок 2', 'Блок 3'
  ]);

  const VIA_SECTION_RE = /^\s*(I|II|III|IV|V|VI)\s*[\.\:\)\]]\s*/i;

  function isViaSection_(label){
    const t = String(label || '').trim();
    if (!t) return false;
    if (VIA_SECTION_RE.test(t)) return true;          // I. ... / II. ... / III. ... / IV. ...
    if (/^блок\s*\d+/i.test(t)) return true;          // "Блок 1" и т.п. (на всякий случай)
    if (viaSections.has(t)) return true;              // если секции приходят как "Блок 1/2/3" и т.п.
    return false;
  }

  const tbody = via.map(r => {
    const label = String(r.criterion || r.label || r.name || '').trim();
    if (!label) return '';

      if (isViaSection_(label)) {
      const sec = label.replace(/\s*[:：]\s*$/, '') + ':';
      return `<tr class="cc-via-section-row"><td colspan="2">${escapeHtml(sec)}</td></tr>`;
    }


    return `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td><span class="score-pill ${scoreViaClass_(r.score)}">${escapeHtml(formatScore_(r.score))}</span></td>
      </tr>
    `;
  }).join('');

return `
<div class="cb-profile">
<div class="cb-bento">

  <div class="cb-col cb-col-left">

    <div class="cb-card cb-via">
      <div class="cb-card-h">
        <h4><span class="cb-hico">${SVG_HDR_VIA}</span>Сильные стороны личности (VIA)</h4>
      </div>
      <div class="cb-card-b">
        <table class="cc-table">
          <thead><tr><th>Критерий</th><th>Балл</th></tr></thead>
        <tbody>
        ${tbody}
      </tbody>
        </table>
      </div>
    </div>

    <div class="cb-card">
      <div class="cb-card-h"><h4><span class="cb-hico">${SVG_HDR_BIG5_MAIN}</span>Big5 — главные черты</h4></div>
      <div class="cb-card-b">
        <table class="cc-table">
          <thead><tr><th>Черта</th><th>Тест</th><th>Самоанализ</th></tr></thead>
          <tbody>
            ${b5m.map(r => `
              <tr>
                <td>${escapeHtml(r.trait||'')}</td>
                <td><span class="score-pill ${scoreB5MainTestClass_(r.score)}">${escapeHtml(formatScore_(r.score))}</span></td>
                <td><span class="score-pill ${scoreB5MainSelfClass_(r.self)}">${escapeHtml(formatScore_(r.self))}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="cb-card">
      <div class="cb-card-h"><h4><span class="cb-hico">${SVG_HDR_BIG5_ASPECTS}</span>Big5 — аспекты</h4></div>
      <div class="cb-card-b">
        <table class="cc-table">
          <thead><tr><th>Аспект</th><th>Балл</th><th>Уровень</th></tr></thead>
          <tbody>
            ${b5a.map(r => `
              <tr>
                <td>${escapeHtml(r.aspect||'')}</td>
                <td><span class="score-pill ${score1to5Class_(r.score)}">${escapeHtml(formatScore_(r.score))}</span></td>
                <td><span class="${levelClass(r.level || levelFromScore_(r.score))}">${escapeHtml(r.level || levelFromScore_(r.score) || '')}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

  </div>

  <div class="cb-col cb-col-right">

   <div class="cb-card cb-drivers">
  <div class="cb-card-h">
    <h4><span class="cb-hico">${SVG_HDR_DRIVERS}</span>Двигатели жизни</h4>
  </div>

${dh && (dh.main_value || dh.desc) ? `
  <div style="padding:10px 12px 0 12px; font-size:12px; color:#4b5563; line-height:1.35;">
    <div style="font-weight:800;color:#043D56;background:#F9F9F9;padding:8px 10px;border-radius:10px;display:inline-block;">
      ${escapeHtml(dh.main_label || 'Ваша главная ценность')}: ${escapeHtml(dh.main_value || '')}
    </div>
    ${dh.desc ? `<div style="margin-top:6px;">${escapeHtml(dh.desc)}</div>` : ''}
  </div>` : ``}

  <div class="cb-card-b">
    <table class="cc-table">
      <thead><tr><th>Тест</th><th>Ценность</th><th>Самоанализ</th></tr></thead>
      <tbody>
        ${dr.map(r => `
          <tr>
            <td><span class="score-pill ${scoreDriversTestClass_(r.test)}">${escapeHtml(String(r.test || ''))}</span></td>
            <td>${escapeHtml(r.name || '')}</td>
            <td><span class="score-pill ${scoreDriversSelfClass_(r.self)}">${escapeHtml(String(r.self || ''))}</span></td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>

<div class="cb-card cb-intellect">
  <div class="cb-card-h">
    <h4><span class="cb-hico">${SVG_HDR_INTEL}</span>Интеллекты</h4>
  </div>

${il && (il.value || il.desc) ? `
  <div style="padding:10px 12px 0 12px; font-size:12px; color:#4b5563; line-height:1.35;">
    <div style="font-weight:800;color:#043D56;background:#F9F9F9;padding:8px 10px;border-radius:10px;display:inline-block;">
      ${escapeHtml(il.label || 'Ваш ведущий интеллект')}${il.value ? `: ${escapeHtml(il.value)}` : ''}
    </div>
    ${il.desc ? `<div style="margin-top:6px;">${escapeHtml(il.desc).replace(/\n/g,'<br>')}</div>` : ''}
  </div>` : ``}

  <div class="cb-card-b">
    <table class="cc-table">
      <thead><tr><th>Балл</th><th>Интеллект</th><th>Самоанализ</th></tr></thead>
      <tbody>
        ${ir.map(r => `
          <tr>
            <td><span class="score-pill ${scoreIntelTestClass_(r.score)}">${escapeHtml(formatScore_(r.score))}</span></td>
            <td>${escapeHtml(r.name || '')}</td>
            <td><span class="score-pill ${scoreIntelSelfClass_(r.self)}">${escapeHtml(String(r.self || ''))}</span></td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>

       <div class="cb-card">
      <div class="cb-card-h"><h4><span class="cb-hico">${SVG_HDR_SELFESTEEM}</span>Самооценка</h4></div>
      <div class="cb-card-b">
        <table class="cc-table">
          <thead><tr><th>Результат</th><th>Уровень</th></tr></thead>
          <tbody>
            <tr>
              <td><span class="${selfEsteemResultClass_(se.result)}">${escapeHtml(String(se.result||''))}</span></td>
              <td><span class="${levelClass(se.level)}">${escapeHtml(String(se.level||''))}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="cb-card">
      <div class="cb-card-h"><h4><span class="cb-hico">${SVG_HDR_KARASEK}</span>Содержание работы (Карасек)</h4></div>
      <div class="cb-card-b">
        <table class="cc-table">
          <thead><tr><th>Показатель</th><th>Балл</th><th>Уровень</th></tr></thead>
          <tbody>
            ${jc.map(r => `
              <tr>
                <td>${escapeHtml(r.label || '')}</td>
                <td><span class="${toNum_(r.score) === 0 ? 'score-pill score-zero' : scoreByLevelClass_(r.level || levelFromScore_(r.score))}">${escapeHtml(formatScore_(r.score))}</span></td>
                <td><span class="${levelClass(r.level || levelFromScore_(r.score))}">${escapeHtml(r.level || levelFromScore_(r.score) || '')}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

  </div>

  ${bo && bo.length ? `
  <div class="cb-card cb-span-4">
    <div class="cb-card-h"><h4><span class="cb-hico">${SVG_HDR_BURNOUT}</span>Выгорание</h4></div>
    <div class="cb-card-b">

<div class="cc-bo-list">
  ${bo.map((r) => {
    const help = burnoutHelp_(r.label);
    const hasHelp = !!help;

    const scoreCls = (toNum_(r.result) === 0)
      ? 'score-pill score-zero'
      : burnoutScoreByLevelClass_(r.level);

    const rowInner = `
      <div class="cc-bo-cell cc-bo-cell--label">
        <span class="bo-label">${burnoutIcon_(r.label)}${escapeHtml(r.label||'')}</span>
      </div>
      <div class="cc-bo-cell cc-bo-cell--lvl">
        <span class="${burnoutLevelClass_(r.level)}">${escapeHtml(String(r.level||''))}</span>
      </div>
      <div class="cc-bo-cell cc-bo-cell--res">
        <span class="${scoreCls}">${escapeHtml(String(r.result||''))}</span>
      </div>
      <div class="cc-bo-cell cc-bo-cell--chev">
        ${hasHelp ? `
          <span class="cc-bo-caret" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
          </span>
        ` : ``}
      </div>
    `;

    if(!hasHelp){
      return `<div class="cc-bo-static">${rowInner}</div>`;
    }

    return `
      <details class="cc-bo-details">
        <summary class="cc-bo-sum">${rowInner}</summary>
        <div class="cc-bo-desc">${escapeHtmlBr_(help)}</div>
      </details>
    `;
  }).join('')}
</div>
    </div>
  </div>` : ''}

</div>
</div>
`;
}

document.addEventListener("DOMContentLoaded", () => {
  bootstrap_().catch(e => {
    dbg_("BOOT_FAIL " + (e && e.message ? e.message : String(e)));
    try {
      setAuthMsg_("Ошибка загрузки: " + (e && e.message ? e.message : "unknown"));
    } catch (_) {}
  });
});

document.addEventListener("toggle", (e) => {
  const t = e.target;
  if (!t || t.tagName !== "DETAILS" || !t.open) return;

  const isExp = t.classList.contains("cc-exp-details");
  const isBo  = t.classList.contains("cc-bo-details");
  if (!isExp && !isBo) return;

  document
    .querySelectorAll("details.cc-exp-details[open], details.cc-bo-details[open]")
    .forEach(d => { if (d !== t) d.open = false; });
}, true);
}




