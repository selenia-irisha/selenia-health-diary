import { useState, useEffect } from "react";

const SK = { log: "cd_log", goal: "cd_goal", body: "cd_body", bodyLog: "cd_body_log", steps: "cd_steps" };

// Telegram CloudStorage с fallback на localStorage
const tg = window.Telegram?.WebApp;
if (tg) tg.expand();

function ls(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
}
function ss(key, val) {
  try {
    const str = JSON.stringify(val);
    localStorage.setItem(key, str);
    if (tg?.CloudStorage) tg.CloudStorage.setItem(key, str, () => {});
  } catch {}
}
// При старте подгружаем данные из Telegram CloudStorage (если доступно)
function syncFromCloud(keys, cb) {
  if (!tg?.CloudStorage) { cb(); return; }
  tg.CloudStorage.getItems(keys, (err, vals) => {
    if (!err && vals) {
      keys.forEach(k => { if (vals[k]) { try { localStorage.setItem(k, vals[k]); } catch {} } });
    }
    cb();
  });
}

// ─── Категории рациона (масштаб от 2300 до 1600, ~0.696x) ───────────────────
// Логика: каждая категория = дневная норма продуктов этого типа.
// Цифра = граммы/штуки, которые можно съесть за день в рамках 1600 ккал.
const CATEGORIES = [
  {
    id: "A", label: "А", name: "Крупи та вуглеводи", color: "#6366f1", bg: "#eef2ff",
    hint: "Складні вуглеводи — основне джерело енергії. Один вид на день.",
    items: [
      { name: "Будь-яка крупа (гречка, рис, вівсянка)", kcal: 340, protein: 7, fat: 1.5, carbs: 70, dailyG: 75, unit: "г" },
      { name: "Макарони т.с.", kcal: 357, protein: 12.6, fat: 1.8, carbs: 70, dailyG: 75, unit: "г" },
      { name: "Хлібці цільнозернові", kcal: 368, protein: 11.5, fat: 2.5, carbs: 75, dailyG: 70, unit: "г" },
      { name: "Цільнозерновий хліб", kcal: 363, protein: 13.1, fat: 3, carbs: 70, dailyG: 75, unit: "г" },
      { name: "Лаваш", kcal: 360, protein: 12, fat: 3, carbs: 69, dailyG: 70, unit: "г" },
      { name: "Картопля варена", kcal: 77, protein: 2, fat: 0.1, carbs: 17, dailyG: 330, unit: "г" },
      { name: "Бобові (сочевиця, нут, квасоля)", kcal: 357, protein: 23, fat: 1, carbs: 60, dailyG: 75, unit: "г" },
    ],
  },
  {
    id: "B", label: "Б", name: "Білкові продукти", color: "#ef4444", bg: "#fff1f2",
    hint: "Основне джерело білка. Вибери 1–2 джерела на день.",
    items: [
      { name: "Куряче або індиче філе", kcal: 110, protein: 23, fat: 1, carbs: 0, dailyG: 315, unit: "г" },
      { name: "Телятина / яловичина", kcal: 172, protein: 20, fat: 10, carbs: 0, dailyG: 200, unit: "г" },
      { name: "Риба нежирна (тріска, тунець, мінтай)", kcal: 82, protein: 18, fat: 0.8, carbs: 0, dailyG: 415, unit: "г" },
      { name: "Лосось / жирна риба", kcal: 208, protein: 20, fat: 13, carbs: 0, dailyG: 165, unit: "г" },
      { name: "Морепродукти", kcal: 85, protein: 18, fat: 1, carbs: 0, dailyG: 400, unit: "г" },
      { name: "Яйця цілі", kcal: 155, protein: 13, fat: 11, carbs: 1, dailyG: 4, unit: "шт" },
      { name: "Печінка", kcal: 135, protein: 20, fat: 5, carbs: 4, dailyG: 265, unit: "г" },
    ],
  },
  {
    id: "V", label: "В", name: "Овочі та зелень", color: "#22c55e", bg: "#f0fdf4",
    hint: "Їж без обмежень — клітковина та мінімум калорій.",
    items: [
      { name: "Некрохмалисті овочі (огірок, перець, броколі, кабачок…)", kcal: 25, protein: 1.5, fat: 0.2, carbs: 4, dailyG: 600, unit: "г" },
      { name: "Квашені овочі", kcal: 15, protein: 1, fat: 0.1, carbs: 2.5, dailyG: 600, unit: "г" },
      { name: "Гриби", kcal: 22, protein: 3.1, fat: 0.3, carbs: 2, dailyG: 600, unit: "г" },
      { name: "Зелень (петрушка, кріп, шпинат…)", kcal: 20, protein: 2, fat: 0.3, carbs: 2, dailyG: 150, unit: "г" },
    ],
  },
  {
    id: "G", label: "Г", name: "Жири", color: "#eab308", bg: "#fefce8",
    hint: "Корисні жири — не більше норми на день.",
    items: [
      { name: "Авокадо", kcal: 160, protein: 2, fat: 15, carbs: 9, dailyG: 95, unit: "г" },
      { name: "Будь-яка олія (льняна, оливкова…)", kcal: 884, protein: 0, fat: 100, carbs: 0, dailyG: 17, unit: "г" },
      { name: "Гірчиця", kcal: 66, protein: 4.4, fat: 3.6, carbs: 5.7, dailyG: 120, unit: "г" },
      { name: "Оливки", kcal: 115, protein: 0.8, fat: 10.7, carbs: 6, dailyG: 130, unit: "г" },
    ],
  },
  {
    id: "D", label: "Д", name: "Молочні продукти", color: "#8b5cf6", bg: "#f5f3ff",
    hint: "Кальцій та білок. Вибирай нежирні варіанти.",
    items: [
      { name: "Сир кисломолочний нежирний (0–2%)", kcal: 80, protein: 18, fat: 0.6, carbs: 3, dailyG: 155, unit: "г" },
      { name: "Сир кисломолочний 5%", kcal: 121, protein: 17, fat: 5, carbs: 3, dailyG: 100, unit: "г" },
      { name: "Кефір 1%", kcal: 40, protein: 3.4, fat: 1, carbs: 4.6, dailyG: 290, unit: "г" },
      { name: "Йогурт несолодкий 1%", kcal: 51, protein: 4.5, fat: 1.5, carbs: 3.5, dailyG: 165, unit: "г" },
      { name: "Молоко 1.5%", kcal: 45, protein: 3.5, fat: 1.5, carbs: 4.8, dailyG: 345, unit: "г" },
      { name: "Сир м'який / твердий / плавлений", kcal: 300, protein: 22, fat: 23, carbs: 0, dailyG: 25, unit: "г" },
      { name: "Сметана 15%", kcal: 158, protein: 2.6, fat: 15, carbs: 3.1, dailyG: 20, unit: "г" },
    ],
  },
  {
    id: "E", label: "Е", name: "Фрукти та ягоди", color: "#ec4899", bg: "#fdf2f8",
    hint: "Некалорійні фрукти — до 400 г на день. Банани та виноград — окремо.",
    items: [
      { name: "Фрукти та ягоди (яблуко, груша, полуниця…)", kcal: 50, protein: 0.5, fat: 0.2, carbs: 12, dailyG: 400, unit: "г" },
      { name: "Банани, виноград, хурма", kcal: 89, protein: 1.1, fat: 0.3, carbs: 23, dailyG: 205, unit: "г" },
    ],
  },
  {
    id: "Ye", label: "Є", name: "Горіхи та насіння", color: "#64748b", bg: "#f8fafc",
    hint: "Корисні, але дуже калорійні. Суворо в межах норми.",
    items: [
      { name: "Будь-які горіхи", kcal: 600, protein: 20, fat: 55, carbs: 10, dailyG: 14, unit: "г" },
      { name: "Насіння (льон, чіа, гарбуз…)", kcal: 500, protein: 18, fat: 40, carbs: 15, dailyG: 14, unit: "г" },
    ],
  },
  {
    id: "Zh", label: "Ж", name: "Жовта зона", color: "#f97316", bg: "#fff7ed",
    hint: "Дозволено, але в межах норми. Краще уникати щодня.",
    items: [
      { name: "Будь-що (солодощі, снеки, ковбаса…)", kcal: 450, protein: 4.5, fat: 25, carbs: 55, dailyG: 63, unit: "г" },
      { name: "Сухе вино", kcal: 68, protein: 0.1, fat: 0, carbs: 2.5, dailyG: 150, unit: "мл" },
      { name: "Пиво", kcal: 43, protein: 0.5, fat: 0, carbs: 4.5, dailyG: 245, unit: "мл" },
      { name: "Фрукти та ягоди (жирна норма)", kcal: 50, protein: 0.5, fat: 0.2, carbs: 12, dailyG: 460, unit: "г" },
    ],
  },
];

const FOODS_FLAT = CATEGORIES.flatMap(cat => cat.items.map(item => ({ ...item, cat: cat.id, catLabel: cat.label, catColor: cat.color })));

const MEALS = ["Сніданок", "Обід", "Вечеря", "Перекус"];
const FIXED_KCAL = 1600;
const FIXED_GOAL = { kcal: FIXED_KCAL, protein: 103, fat: 50, carbs: 175 };

function todayKey() { return new Date().toISOString().slice(0, 10); }

const C = {
  bg: "#eef2ff", surface: "#ffffff", surfaceAlt: "#f5f3ff",
  border: "#dde3f5", accent: "#7c6ef7", accentSoft: "#ede9fe",
  grad: "linear-gradient(135deg, #7c6ef7 0%, #a78bfa 55%, #67e8f9 100%)",
  teal: "#0891b2", pink: "#db2777", amber: "#d97706",
  text: "#1e1b4b", muted: "#64748b", faint: "#94a3b8",
  danger: "#dc2626", white: "#ffffff",
};

function MacroBar({ label, value, max, color }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  const over = value > max;
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: C.muted }}>{label}</span>
        <span style={{ color: over ? C.danger : C.text, fontWeight: 600 }}>
          {Math.round(value)}<span style={{ color: C.faint, fontWeight: 400 }}>/{max}г</span>
        </span>
      </div>
      <div style={{ background: C.border, borderRadius: 5, height: 7, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, background: over ? C.danger : color, height: "100%", borderRadius: 5, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

function KcalRing({ eaten, goal }) {
  const pct = Math.min(1, goal > 0 ? eaten / goal : 0);
  const r = 50, cx = 60, cy = 60, circ = 2 * Math.PI * r;
  const color = pct > 1 ? C.danger : pct > 0.88 ? C.amber : C.accent;
  return (
    <svg width={120} height={120}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.accentSoft} strokeWidth={10} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: "stroke-dasharray 0.5s" }} />
      <text x={cx} y={cy - 6} textAnchor="middle" fill={C.text} fontSize={20} fontWeight={800} fontFamily="Nunito,sans-serif">{Math.round(eaten)}</text>
      <text x={cx} y={cy + 9} textAnchor="middle" fill={C.faint} fontSize={9} fontFamily="Nunito,sans-serif">із {goal}</text>
      <text x={cx} y={cy + 22} textAnchor="middle" fill={C.accent} fontSize={9} fontFamily="Nunito,sans-serif">ккал</text>
    </svg>
  );
}

function Pill({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: active ? C.accent : C.white, color: active ? C.white : C.muted,
      border: `1.5px solid ${active ? C.accent : C.border}`, borderRadius: 20,
      padding: "5px 13px", fontSize: 12, cursor: "pointer", fontWeight: active ? 700 : 500,
    }}>{children}</button>
  );
}

function Inp({ style, ...p }) {
  return <input {...p} style={{
    background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 10,
    padding: "9px 12px", fontSize: 14, color: C.text, width: "100%",
    boxSizing: "border-box", outline: "none", fontFamily: "inherit", ...style,
  }} />;
}

function Card({ children, style }) {
  return <div style={{
    background: C.surface, borderRadius: 18, padding: 16, margin: "12px 14px 0",
    boxShadow: "0 2px 14px rgba(124,110,247,0.08)", border: `1px solid ${C.border}`, ...style,
  }}>{children}</div>;
}

function SL({ children }) {
  return <div style={{ fontSize: 11, color: C.accent, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>{children}</div>;
}

function BodyBar({ label, current, goal }) {
  const diff = (current - goal).toFixed(1);
  const pct = goal > 0 ? Math.min(100, (goal / current) * 100) : 100;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: C.muted }}>{label}</span>
        <span style={{ color: C.text, fontWeight: 600 }}>
          {current} <span style={{ color: C.faint }}>→ {goal} см</span>
          {diff > 0 && <span style={{ color: C.pink, marginLeft: 5 }}>−{diff}</span>}
        </span>
      </div>
      <div style={{ background: C.border, borderRadius: 5, height: 7 }}>
        <div style={{ width: `${pct}%`, background: C.grad, height: "100%", borderRadius: 5, transition: "width 0.5s" }} />
      </div>
    </div>
  );
}

// ─── Экран Рациона ────────────────────────────────────────────────────────────
// Граммы считаются из log (дневника), не из rationLog.
// Матчим по имени продукта из категории с именем в дневнике.
function RationScreen({ log, activeDate, setActiveDate, onAddFromRation }) {
  const [openCat, setOpenCat] = useState(null);
  const [inputG, setInputG] = useState({});
  const [addingMeal, setAddingMeal] = useState("Сніданок");

  const dateEntries = log[activeDate] || [];

  // Считаем граммы для продукта из log по имени
  function getEatenG(itemName) {
    return dateEntries
      .filter(e => e.name === itemName)
      .reduce((s, e) => s + e.weight, 0);
  }

  function saveInput(item, catId) {
    const key = `${catId}_${item.name}`;
    const g = parseFloat(inputG[key]);
    if (!g) return;
    onAddFromRation(item, g, addingMeal);
    setInputG(p => ({ ...p, [key]: "" }));
  }

  return (
    <div>
      {/* Date + meal selector */}
      <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>Дата:</span>
          <input type="date" value={activeDate} onChange={e => setActiveDate(e.target.value)}
            style={{ background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "7px 10px", fontSize: 13, color: C.text, outline: "none", fontFamily: "inherit", flex: 1 }} />
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: C.muted, alignSelf: "center" }}>Прийом:</span>
          {MEALS.map(m => <Pill key={m} active={addingMeal === m} onClick={() => setAddingMeal(m)}>{m}</Pill>)}
        </div>
      </Card>

      {CATEGORIES.map(cat => {
        const isOpen = openCat === cat.id;

        // Суммарные ккал по категории из дневника
        const eatenKcalCat = cat.items.reduce((sum, item) => {
          const g = getEatenG(item.name);
          return sum + (g > 0 ? Math.round(item.kcal * g / 100) : 0);
        }, 0);

        // Суммарный прогресс категории: берём item с наибольшим заполнением
        const catMaxPct = cat.items.reduce((max, item) => {
          const g = getEatenG(item.name);
          return Math.max(max, Math.min(100, (g / item.dailyG) * 100));
        }, 0);

        return (
          <div key={cat.id} style={{ margin: "10px 14px 0" }}>
            <button onClick={() => setOpenCat(isOpen ? null : cat.id)} style={{
              width: "100%", background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: isOpen ? "14px 14px 0 0" : 14, padding: "12px 16px", cursor: "pointer", textAlign: "left",
              boxShadow: "0 1px 8px rgba(124,110,247,0.06)", borderLeft: `4px solid ${cat.color}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{
                    background: cat.color, color: "#fff", borderRadius: 8,
                    width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 800, fontSize: 14, flexShrink: 0,
                  }}>{cat.label}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{cat.name}</div>
                    <div style={{ fontSize: 11, color: C.faint }}>{cat.items.length} продуктів</div>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                  {eatenKcalCat > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: cat.color }}>{eatenKcalCat} ккал</div>}
                  <div style={{ fontSize: 16, color: C.faint }}>{isOpen ? "▲" : "▼"}</div>
                </div>
              </div>
              {/* Шкала в свёрнутом и открытом виде */}
              <div style={{ marginTop: 8, background: C.border, borderRadius: 4, height: 5 }}>
                <div style={{ width: `${catMaxPct}%`, background: cat.color, height: "100%", borderRadius: 4, transition: "width 0.4s", opacity: 0.75 }} />
              </div>
              {isOpen && cat.hint && (
                <div style={{ marginTop: 8, fontSize: 12, color: C.muted, background: cat.bg, borderRadius: 8, padding: "6px 10px" }}>
                  💡 {cat.hint}
                </div>
              )}
            </button>

            {isOpen && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 14px 14px", overflow: "hidden" }}>
                {cat.items.map((item, i) => {
                  const key = `${cat.id}_${item.name}`;
                  const eatenG = getEatenG(item.name);
                  const eatenPct = Math.min(100, (eatenG / item.dailyG) * 100);
                  return (
                    <div key={i} style={{ padding: "12px 16px", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <div style={{ flex: 1, paddingRight: 8 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
                            {item.kcal} ккал · {item.protein}г білка · на 100{item.unit === "шт" ? "г" : item.unit}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: C.muted, textAlign: "right", whiteSpace: "nowrap" }}>
                          <span style={{ color: eatenG > 0 ? cat.color : C.faint, fontWeight: 700 }}>{eatenG}</span>
                          <span style={{ color: C.faint }}> / {item.dailyG} {item.unit}</span>
                        </div>
                      </div>
                      <div style={{ background: C.border, borderRadius: 4, height: 5, marginBottom: 8 }}>
                        <div style={{ width: `${eatenPct}%`, background: cat.color, height: "100%", borderRadius: 4, transition: "width 0.4s", opacity: 0.8 }} />
                      </div>
                      <div style={{ display: "flex", gap: 7 }}>
                        <Inp type="number" placeholder={`Кількість (${item.unit})`}
                          value={inputG[key] || ""}
                          onChange={e => setInputG(p => ({ ...p, [key]: e.target.value }))}
                          onKeyDown={e => e.key === "Enter" && saveInput(item, cat.id)}
                          style={{ flex: 1, padding: "7px 10px", fontSize: 13 }} />
                        <button onClick={() => saveInput(item, cat.id)} style={{
                          background: cat.color, color: "#fff", border: "none",
                          borderRadius: 9, padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: 13,
                          opacity: inputG[key] ? 1 : 0.4,
                        }}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <div style={{ height: 20 }} />
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [ready, setReady] = useState(!tg?.CloudStorage);

  useEffect(() => {
    if (!tg?.CloudStorage) return;
    syncFromCloud(Object.values(SK), () => setReady(true));
  }, []);

  const [log, setLog] = useState(() => ls(SK.log, {}));
  const [goal] = useState(FIXED_GOAL);
  const [profile, setProfile] = useState(() => ls(SK.body, {
    weight: 64.2, height: 175, age: 31,
    chest: 96, waist: 78, hips: 98,
    goalWeight: 57, goalChest: 92, goalWaist: 70, goalHips: 94,
  }));
  const [bodyLog, setBodyLog] = useState(() => ls(SK.bodyLog, []));

  const [view, setView] = useState("today");
  const [showAdd, setShowAdd] = useState(false);
  const [meal, setMeal] = useState("Сніданок");
  const [search, setSearch] = useState("");
  const [custom, setCustom] = useState({ name: "", kcal: "", protein: "", fat: "", carbs: "", weight: "" });
  const [addMode, setAddMode] = useState("ration");
  const [selFood, setSelFood] = useState(null);
  const [pendW, setPendW] = useState("");
  const [histDate, setHistDate] = useState(todayKey());
  const [activeDate, setActiveDate] = useState(todayKey());
  const [showMeasure, setShowMeasure] = useState(false);
  const [newM, setNewM] = useState({ weight: "", chest: "", waist: "", hips: "" });
  const [stepsLog, setStepsLog] = useState(() => ls(SK.steps, {}));
  const [stepsInput, setStepsInput] = useState("");

  const today = todayKey();

  useEffect(() => ss(SK.log, log), [log]);
  useEffect(() => ss(SK.body, profile), [profile]);
  useEffect(() => ss(SK.bodyLog, bodyLog), [bodyLog]);
  useEffect(() => ss(SK.steps, stepsLog), [stepsLog]);


  const sum = (entries) => entries.reduce(
    (a, e) => ({ kcal: a.kcal + e.kcal, protein: a.protein + e.protein, fat: a.fat + e.fat, carbs: a.carbs + e.carbs }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  );

  const todayE = log[activeDate] || [];
  const todayT = sum(todayE);
  const rem = Math.max(0, goal.kcal - todayT.kcal);

  function addEntry(food, w, mealName, dateKey) {
    const m = w / 100;
    const dk = dateKey || today;
    setLog(p => ({
      ...p, [dk]: [...(p[dk] || []), {
        id: Date.now() + Math.random(), meal: mealName || meal, name: food.name, weight: w,
        kcal: Math.round(food.kcal * m),
        protein: Math.round(food.protein * m * 10) / 10,
        fat: Math.round(food.fat * m * 10) / 10,
        carbs: Math.round(food.carbs * m * 10) / 10,
      }]
    }));
  }

  function addFood(food) {
    addEntry(food, food.weight || 100);
    setSearch(""); setShowAdd(false); setSelFood(null); setPendW("");
  }

  function addCustom() {
    if (!custom.name || !custom.kcal) return;
    const w = parseFloat(custom.weight) || 100, m2 = w / 100;
    setLog(p => ({
      ...p, [today]: [...(p[today] || []), {
        id: Date.now(), meal, name: custom.name, weight: w,
        kcal: Math.round(parseFloat(custom.kcal) * m2),
        protein: Math.round(parseFloat(custom.protein || 0) * m2 * 10) / 10,
        fat: Math.round(parseFloat(custom.fat || 0) * m2 * 10) / 10,
        carbs: Math.round(parseFloat(custom.carbs || 0) * m2 * 10) / 10,
      }]
    }));
    setCustom({ name: "", kcal: "", protein: "", fat: "", carbs: "", weight: "" });
    setShowAdd(false);
  }

  function removeEntry(id) { setLog(p => ({ ...p, [activeDate]: (p[activeDate] || []).filter(e => e.id !== id) })); }

  function saveMeasure() {
    const e = {
      date: today,
      weight: parseFloat(newM.weight) || profile.weight,
      chest: parseFloat(newM.chest) || profile.chest,
      waist: parseFloat(newM.waist) || profile.waist,
      hips: parseFloat(newM.hips) || profile.hips,
    };
    setBodyLog(prev => [...prev.filter(x => x.date !== today), e].sort((a, b) => a.date.localeCompare(b.date)));
    setProfile(p => ({ ...p, weight: e.weight, chest: e.chest, waist: e.waist, hips: e.hips }));
    setNewM({ weight: "", chest: "", waist: "", hips: "" });
    setShowMeasure(false);
  }

  const allFoods = FOODS_FLAT;
  const filtered = allFoods.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
  const histDates = Object.keys(log).sort().reverse().slice(0, 14);
  const histE = log[histDate] || [];
  const histT = sum(histE);

  const dlabel = (d) => {
    if (d === today) return "Сьогодні";
    const diff = Math.round((new Date(today) - new Date(d)) / 86400000);
    return diff === 1 ? "Вчора" : d.slice(5);
  };

  const sheetStyle = { background: C.surface, borderRadius: "22px 22px 0 0", padding: 22, maxHeight: "88vh", overflowY: "auto" };
  const overlayStyle = { position: "fixed", inset: 0, background: "rgba(30,27,75,0.3)", zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" };

  const viewTitle = { today: dlabel(today), history: "Історія", ration: "Раціон", body: "Моє тіло" };

  if (!ready) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 40 }}>🥗</div>
      <div style={{ color: C.accent, fontWeight: 700, fontSize: 16 }}>Завантаження...</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Nunito','Segoe UI',sans-serif", paddingBottom: 90 }}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: C.grad, padding: "30px 18px 22px", borderRadius: "0 0 26px 26px" }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", letterSpacing: 3, textTransform: "uppercase", marginBottom: 3 }}>Щоденник харчування</div>
        <div style={{ fontSize: 23, fontWeight: 800, color: C.white }}>{viewTitle[view]}</div>
      </div>

      {/* TODAY */}
      {view === "today" && (<>
        <Card style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px" }}>
          <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>Дата:</span>
          <input type="date" value={activeDate} onChange={e => setActiveDate(e.target.value)}
            style={{ background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "7px 10px", fontSize: 13, color: C.text, outline: "none", fontFamily: "inherit", flex: 1 }} />
          {activeDate !== today && <button onClick={() => setActiveDate(today)}
            style={{ background: C.accentSoft, color: C.accent, border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 11, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>
            Сьогодні
          </button>}
        </Card>
        <Card style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <KcalRing eaten={todayT.kcal} goal={goal.kcal} />
          <div style={{ flex: 1 }}>
            <MacroBar label="Білки" value={todayT.protein} max={goal.protein} color={C.teal} />
            <MacroBar label="Жири" value={todayT.fat} max={goal.fat} color={C.pink} />
            <MacroBar label="Вуглеводи" value={todayT.carbs} max={goal.carbs} color={C.amber} />
            <div style={{ fontSize: 11, color: C.faint, marginTop: 5 }}>
              залишилось <span style={{ color: C.accent, fontWeight: 700 }}>{rem}</span> ккал
            </div>
          </div>
        </Card>

        {todayE.length === 0 ? (
          <Card style={{ textAlign: "center", padding: "32px 20px" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🥗</div>
            <div style={{ color: C.faint }}>Натисни + або відкрий «Раціон» щоб додати</div>
          </Card>
        ) : (
          <Card>
            {MEALS.map(m => {
              const entries = todayE.filter(e => e.meal === m);
              if (!entries.length) return null;
              return (
                <div key={m} style={{ marginBottom: 12 }}>
                  <SL>{m}</SL>
                  {entries.map(e => (
                    <div key={e.id} style={{ display: "flex", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{e.name} <span style={{ color: C.faint, fontWeight: 400 }}>· {e.weight}г</span></div>
                        <div style={{ fontSize: 11, color: C.faint, marginTop: 1 }}>Б {e.protein} · Ж {e.fat} · В {e.carbs}</div>
                      </div>
                      <span style={{ color: C.accent, fontWeight: 700, fontSize: 14, marginRight: 8 }}>{e.kcal}</span>
                      <button onClick={() => removeEntry(e.id)} style={{ background: "none", border: "none", color: C.faint, cursor: "pointer", fontSize: 17, lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <span style={{ color: C.muted, fontSize: 12, fontWeight: 600 }}>РАЗОМ</span>
              <span style={{ color: C.accent, fontWeight: 800 }}>{Math.round(todayT.kcal)} ккал</span>
            </div>
          </Card>
        )}

        {/* Steps */}
        <Card style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 32 }}>👟</div>
          <div style={{ flex: 1 }}>
            <SL>Кроки сьогодні</SL>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.text, marginTop: -4 }}>
              {stepsLog[activeDate] || 0}<span style={{ fontSize: 12, color: C.faint, fontWeight: 400, marginLeft: 4 }}>кроків</span>
            </div>
            <div style={{ background: C.border, borderRadius: 5, height: 6, marginTop: 6 }}>
              <div style={{ width: `${Math.min(100, ((stepsLog[activeDate] || 0) / 10000) * 100)}%`, background: C.grad, height: "100%", borderRadius: 5, transition: "width 0.4s" }} />
            </div>
            <div style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>ціль 10 000 кроків</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Inp type="number" placeholder="кроки" value={stepsInput} onChange={e => setStepsInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && stepsInput) { setStepsLog(p => ({ ...p, [activeDate]: parseInt(stepsInput) || 0 })); setStepsInput(""); } }}
              style={{ width: 88, textAlign: "center", padding: "7px 9px", fontSize: 13 }} />
            <button onClick={() => { if (stepsInput) { setStepsLog(p => ({ ...p, [activeDate]: parseInt(stepsInput) || 0 })); setStepsInput(""); } }}
              style={{ background: C.accentSoft, color: C.accent, border: "none", borderRadius: 9, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
              Зберегти
            </button>
          </div>
        </Card>

        <button onClick={() => setShowAdd(true)} style={{
          position: "fixed", bottom: 90, right: 18, width: 54, height: 54, borderRadius: "50%",
          background: C.grad, border: "none", fontSize: 26, cursor: "pointer", color: C.white,
          boxShadow: "0 4px 18px rgba(124,110,247,0.4)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>+</button>
      </>)}

      {/* RATION */}
      {view === "ration" && (
        <RationScreen
          log={log}
          activeDate={activeDate}
          setActiveDate={setActiveDate}
          onAddFromRation={(item, g, mealName) => addEntry(item, g, mealName, activeDate)}
        />
      )}

      {/* HISTORY */}
      {view === "history" && (<>
        <Card style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {histDates.length === 0 && <span style={{ color: C.faint }}>Немає даних</span>}
          {histDates.map(d => <Pill key={d} active={d === histDate} onClick={() => setHistDate(d)}>{dlabel(d)}</Pill>)}
        </Card>
        {histDates.length > 0 && (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ color: C.muted, fontSize: 12, fontWeight: 600 }}>КАЛОРІЇ</span>
              <span style={{ color: C.accent, fontWeight: 700 }}>{Math.round(histT.kcal)} / {goal.kcal}</span>
            </div>
            <MacroBar label="Білки" value={histT.protein} max={goal.protein} color={C.teal} />
            <MacroBar label="Жири" value={histT.fat} max={goal.fat} color={C.pink} />
            <MacroBar label="Вуглеводи" value={histT.carbs} max={goal.carbs} color={C.amber} />
            <div style={{ marginTop: 12 }}>
              {MEALS.map(m => {
                const entries = histE.filter(e => e.meal === m);
                if (!entries.length) return null;
                return (
                  <div key={m} style={{ marginBottom: 10 }}>
                    <SL>{m}</SL>
                    {entries.map(e => (
                      <div key={e.id} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                        <div style={{ flex: 1 }}>{e.name} <span style={{ color: C.faint }}>· {e.weight}г</span></div>
                        <span style={{ color: C.accent, fontWeight: 600 }}>{e.kcal}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
              {histE.length === 0 && <div style={{ color: C.faint, textAlign: "center", padding: 16 }}>Немає записів</div>}
            </div>
          </Card>
        )}
      </>)}

      {/* BODY */}
      {view === "body" && (<>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 11, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 3 }}>Вага</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>{profile.weight} <span style={{ fontSize: 14, color: C.faint }}>кг</span></div>
              <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
                ціль {profile.goalWeight} кг · залишилось <b style={{ color: C.accent }}>{Math.max(0, profile.weight - (profile.goalWeight || 57)).toFixed(1)} кг</b>
              </div>
            </div>
            <button onClick={() => setShowMeasure(true)} style={{
              background: C.accentSoft, color: C.accent, border: "none",
              borderRadius: 12, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontWeight: 700,
            }}>+ Замір</button>
          </div>
          <div style={{ marginTop: 12, background: C.border, borderRadius: 7, height: 9 }}>
            <div style={{
              width: `${Math.min(100, Math.max(4, (1 - (profile.weight - (profile.goalWeight || 57)) / Math.max(1, ((bodyLog[0]?.weight || profile.weight) - (profile.goalWeight || 57)))) * 100))}%`,
              background: C.grad, height: "100%", borderRadius: 7, transition: "width 0.5s",
            }} />
          </div>
        </Card>

        <Card>
          <SL>Параметри тіла</SL>
          <BodyBar label="Груди" current={profile.chest} goal={profile.goalChest} />
          <BodyBar label="Талія" current={profile.waist} goal={profile.goalWaist} />
          <BodyBar label="Стегна" current={profile.hips} goal={profile.goalHips} />
          <div style={{ marginTop: 10, background: C.accentSoft, borderRadius: 10, padding: "9px 13px", fontSize: 12, color: C.accent, fontWeight: 600 }}>
            Ціль: {profile.goalChest} × {profile.goalWaist} × {profile.goalHips} см
          </div>
        </Card>

        <Card style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
          <SL>Норма на день</SL>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "Калорії", val: `${goal.kcal} ккал`, color: C.accent },
              { label: "Білки", val: `${goal.protein} г`, color: C.teal },
              { label: "Жири", val: `${goal.fat} г`, color: C.pink },
              { label: "Вуглеводи", val: `${goal.carbs} г`, color: C.amber },
            ].map(r => (
              <div key={r.label} style={{ background: C.white, borderRadius: 10, padding: "8px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 11, color: C.faint }}>{r.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: r.color }}>{r.val}</div>
              </div>
            ))}
          </div>
        </Card>

        {bodyLog.length > 0 && (
          <Card>
            <SL>Історія замірів</SL>
            {[...bodyLog].reverse().slice(0, 8).map(e => (
              <div key={e.date} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                <span style={{ color: C.muted }}>{dlabel(e.date)}</span>
                <span><b>{e.weight}</b> кг · {e.chest}×{e.waist}×{e.hips}</span>
              </div>
            ))}
          </Card>
        )}

        <Card>
          <SL>Редагувати профіль</SL>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { key: "age", label: "Вік" }, { key: "height", label: "Зріст (см)" },
              { key: "goalWeight", label: "Ціль вага (кг)" }, { key: "goalChest", label: "Ціль груди" },
              { key: "goalWaist", label: "Ціль талія" }, { key: "goalHips", label: "Ціль стегна" },
            ].map(({ key, label }) => (
              <div key={key}>
                <label style={{ fontSize: 11, color: C.faint, display: "block", marginBottom: 3 }}>{label}</label>
                <Inp type="number" value={profile[key] || ""} onChange={e => setProfile(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))} />
              </div>
            ))}
          </div>
        </Card>
      </>)}

      {/* NAV */}
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: C.surface, borderTop: `1px solid ${C.border}`,
        display: "flex", justifyContent: "space-around", padding: "9px 0",
        boxShadow: "0 -3px 16px rgba(124,110,247,0.08)",
      }}>
        {[
          { id: "today", icon: "🍽", label: "СЬОГОДНІ" },
          { id: "ration", icon: "📋", label: "РАЦІОН" },
          { id: "history", icon: "📅", label: "ІСТОРІЯ" },
          { id: "body", icon: "📏", label: "ТІЛО" },
        ].map(n => (
          <button key={n.id} onClick={() => setView(n.id)} style={{
            background: "none", border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            color: view === n.id ? C.accent : C.faint,
            fontSize: 10, fontFamily: "inherit", fontWeight: view === n.id ? 700 : 400,
          }}>
            <span style={{ fontSize: 19 }}>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>

      {/* ADD FOOD SHEET (ручной ввод) */}
      {showAdd && (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div style={sheetStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>Додати вручну</span>
              <button onClick={() => setShowAdd(false)} style={{ background: C.bg, border: "none", borderRadius: 8, padding: "3px 10px", fontSize: 18, cursor: "pointer", color: C.muted }}>×</button>
            </div>
            <div style={{ display: "flex", gap: 7, marginBottom: 12, flexWrap: "wrap" }}>
              {MEALS.map(m => <Pill key={m} active={meal === m} onClick={() => setMeal(m)}>{m}</Pill>)}
            </div>
            <div style={{ display: "flex", gap: 7, marginBottom: 12 }}>
              <Pill active={addMode === "ration"} onClick={() => setAddMode("ration")}>З раціону</Pill>
              <Pill active={addMode === "custom"} onClick={() => setAddMode("custom")}>Свій продукт</Pill>
            </div>

            {addMode === "ration" ? (<>
              <Inp placeholder="Пошук продукту..." value={search} onChange={e => setSearch(e.target.value)} autoFocus style={{ marginBottom: 10 }} />
              <div style={{ maxHeight: 330, overflowY: "auto" }}>
                {filtered.slice(0, 20).map((f, i) => (
                  <div key={i} style={{ padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
                    {selFood?.name === f.name ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{f.name}</span>
                        <Inp autoFocus type="number" placeholder="г" value={pendW}
                          onChange={e => setPendW(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && pendW) addFood({ ...f, weight: parseFloat(pendW) });
                            if (e.key === "Escape") { setSelFood(null); setPendW(""); }
                          }}
                          style={{ width: 68, textAlign: "center", padding: "7px 9px" }} />
                        <button onClick={() => { if (pendW) addFood({ ...f, weight: parseFloat(pendW) }); }}
                          style={{ background: C.accent, color: C.white, border: "none", borderRadius: 9, padding: "7px 13px", cursor: "pointer", fontWeight: 700 }}>✓</button>
                        <button onClick={() => { setSelFood(null); setPendW(""); }}
                          style={{ background: C.bg, border: "none", borderRadius: 8, padding: "7px 10px", cursor: "pointer", color: C.muted }}>×</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", cursor: "pointer" }}
                        onClick={() => { setSelFood(f); setPendW(String(f.dailyG || 100)); }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>
                            <span style={{ background: f.catColor, color: "#fff", borderRadius: 5, padding: "1px 6px", fontSize: 10, marginRight: 6 }}>{f.catLabel}</span>
                            {f.name}
                          </div>
                          <div style={{ fontSize: 11, color: C.faint }}>Б{f.protein} · Ж{f.fat} · В{f.carbs} · на 100г</div>
                        </div>
                        <span style={{ color: C.accent, fontWeight: 700, fontSize: 14 }}>{f.kcal}</span>
                      </div>
                    )}
                  </div>
                ))}
                {filtered.length === 0 && <div style={{ color: C.faint, textAlign: "center", padding: 18 }}>Не знайдено</div>}
              </div>
            </>) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <Inp placeholder="Назва" value={custom.name} onChange={e => setCustom(c => ({ ...c, name: e.target.value }))} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                  <Inp placeholder="Ккал на 100г" type="number" value={custom.kcal} onChange={e => setCustom(c => ({ ...c, kcal: e.target.value }))} />
                  <Inp placeholder="Вага (г)" type="number" value={custom.weight} onChange={e => setCustom(c => ({ ...c, weight: e.target.value }))} />
                  <Inp placeholder="Білки (г)" type="number" value={custom.protein} onChange={e => setCustom(c => ({ ...c, protein: e.target.value }))} />
                  <Inp placeholder="Жири (г)" type="number" value={custom.fat} onChange={e => setCustom(c => ({ ...c, fat: e.target.value }))} />
                  <Inp placeholder="Вуглеводи (г)" type="number" value={custom.carbs} onChange={e => setCustom(c => ({ ...c, carbs: e.target.value }))} />
                </div>
                <button onClick={addCustom} style={{
                  background: C.grad, color: C.white, border: "none", borderRadius: 12,
                  padding: 12, fontSize: 14, fontWeight: 700, cursor: "pointer",
                }}>Додати</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* NEW MEASURE */}
      {showMeasure && (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && setShowMeasure(false)}>
          <div style={{ ...sheetStyle, maxHeight: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>Новий замір</span>
              <button onClick={() => setShowMeasure(false)} style={{ background: C.bg, border: "none", borderRadius: 8, padding: "3px 10px", fontSize: 18, cursor: "pointer", color: C.muted }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, marginBottom: 14 }}>
              {[
                { key: "weight", label: "Вага (кг)", ph: `${profile.weight}` },
                { key: "chest", label: "Груди (см)", ph: `${profile.chest}` },
                { key: "waist", label: "Талія (см)", ph: `${profile.waist}` },
                { key: "hips", label: "Стегна (см)", ph: `${profile.hips}` },
              ].map(({ key, label, ph }) => (
                <div key={key}>
                  <label style={{ fontSize: 11, color: C.faint, display: "block", marginBottom: 3 }}>{label}</label>
                  <Inp type="number" placeholder={ph} value={newM[key]} onChange={e => setNewM(p => ({ ...p, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <button onClick={saveMeasure} style={{
              width: "100%", background: C.grad, color: C.white,
              border: "none", borderRadius: 12, padding: 13, fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}>Зберегти</button>
          </div>
        </div>
      )}
    </div>
  );
}
