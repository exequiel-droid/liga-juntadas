"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Role = "admin" | "user";
type AttendanceStatus = "present" | "justified" | "unjustified";

type Profile = {
  id: string;
  name: string;
  emoji: string;
  title: string;
  role: Role;
};

type EventRow = {
  id: string;
  name: string;
  event_date: string;
  host_id: string | null;
  is_closed: boolean;
  created_by: string;
};

type Attendance = {
  id: string;
  event_id: string;
  profile_id: string;
  status: AttendanceStatus;
  reason: string | null;
  penalty: number;
};

type Adjustment = {
  id: string;
  event_id: string;
  profile_id: string;
  points: number;
  description: string;
};

type Vote = {
  id: string;
  event_id: string;
  voter_id: string;
  target_id: string;
  collaboration: number;
  cleaning: number;
  behavior: number;
  attitude: number;
};

const supabase = createClient();
const UNJUSTIFIED_PENALTY = -10;
const categories = [
  { key: "collaboration", label: "Colaboración", icon: "🛒", sub: "Compras, organización y aporte" },
  { key: "cleaning", label: "Limpieza", icon: "🧹", sub: "Orden, lavado y ayuda al final" },
  { key: "behavior", label: "Comportamiento", icon: "🤝", sub: "Convivencia y buena onda" },
  { key: "attitude", label: "Actitud", icon: "🎉", sub: "Predisposición y participación" },
] as const;

const defaultVote = {
  collaboration: 8,
  cleaning: 8,
  behavior: 8,
  attitude: 8,
};

function formatDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function scoreVote(v: Vote) {
  return (
    v.collaboration * 3 +
    v.cleaning * 3 +
    v.behavior * 2 +
    v.attitude * 2
  );
}

export default function Home() {
  const [sessionReady, setSessionReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [tab, setTab] = useState<"ranking" | "vote" | "admin" | "history" | "profile" | "rules">("ranking");
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authMessage, setAuthMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const [newEventName, setNewEventName] = useState("");
  const [newEventDate, setNewEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [newHost, setNewHost] = useState("");

  const [selectedEventId, setSelectedEventId] = useState("");
  const [voteDrafts, setVoteDrafts] = useState<Record<string, typeof defaultVote>>({});

  const isAdmin = me?.role === "admin";

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setSessionReady(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    if (!userId) {
      setMe(null);
      setLoading(false);
      return;
    }
    loadAll();
  }, [sessionReady, userId]);

  async function loadAll() {
    setLoading(true);
    const [
      { data: profileRows },
      { data: eventRows },
      { data: attendanceRows },
      { data: adjustmentRows },
      { data: voteRows },
    ] = await Promise.all([
      supabase.from("profiles").select("*").order("name"),
      supabase.from("events").select("*").order("event_date", { ascending: false }),
      supabase.from("attendance").select("*"),
      supabase.from("point_adjustments").select("*"),
      supabase.from("votes").select("*"),
    ]);

    const p = (profileRows ?? []) as Profile[];
    const e = (eventRows ?? []) as EventRow[];
    setProfiles(p);
    setEvents(e);
    setAttendance((attendanceRows ?? []) as Attendance[]);
    setAdjustments((adjustmentRows ?? []) as Adjustment[]);
    setVotes((voteRows ?? []) as Vote[]);
    setMe(p.find((x) => x.id === userId) ?? null);

    if (!selectedEventId && e.length) setSelectedEventId(e[0].id);
    setLoading(false);
  }

  async function submitAuth() {
    setAuthMessage("");
    if (!email || !password) return setAuthMessage("Completá email y contraseña.");

    if (authMode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      setAuthMessage(
        error
          ? error.message
          : "Cuenta creada. Si Supabase pide confirmación por email, confirmala y después iniciá sesión."
      );
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthMessage(error.message);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setUserId(null);
    setMe(null);
  }

  async function createEvent() {
    if (!isAdmin || !userId || !newEventName.trim()) return;
    const { error } = await supabase.from("events").insert({
      name: newEventName.trim(),
      event_date: newEventDate,
      host_id: newHost || null,
      created_by: userId,
    });
    if (error) return alert(error.message);
    setNewEventName("");
    await loadAll();
  }

  async function setAttendanceFor(profileId: string, status: AttendanceStatus, reason = "") {
    if (!isAdmin || !selectedEventId) return;

    const penalty = status === "unjustified" ? UNJUSTIFIED_PENALTY : 0;
    const existing = attendance.find(
      (x) => x.event_id === selectedEventId && x.profile_id === profileId
    );

    const payload = {
      event_id: selectedEventId,
      profile_id: profileId,
      status,
      reason: status === "present" ? null : reason || null,
      penalty,
    };

    const result = existing
      ? await supabase.from("attendance").update(payload).eq("id", existing.id)
      : await supabase.from("attendance").insert(payload);

    if (result.error) return alert(result.error.message);
    await loadAll();
  }

  async function addAdjustment(profileId: string, points: number, description: string) {
    if (!isAdmin || !selectedEventId || !description.trim()) {
      return alert("El Bonus/Malus necesita una descripción.");
    }
    const { error } = await supabase.from("point_adjustments").insert({
      event_id: selectedEventId,
      profile_id: profileId,
      points,
      description: description.trim(),
      created_by: userId,
    });
    if (error) return alert(error.message);
    await loadAll();
  }

  async function saveVote(targetId: string) {
    if (!userId || !selectedEventId || targetId === userId) return;
    const att = attendance.find(
      (x) => x.event_id === selectedEventId && x.profile_id === targetId
    );
    if (att?.status && att.status !== "present") {
      return alert("No podés puntuar a alguien que faltó.");
    }

    const draft = voteDrafts[targetId] ?? defaultVote;
    const existing = votes.find(
      (x) =>
        x.event_id === selectedEventId &&
        x.voter_id === userId &&
        x.target_id === targetId
    );

    const payload = {
      event_id: selectedEventId,
      voter_id: userId,
      target_id: targetId,
      ...draft,
    };

    const result = existing
      ? await supabase.from("votes").update(payload).eq("id", existing.id)
      : await supabase.from("votes").insert(payload);

    if (result.error) return alert(result.error.message);
    await loadAll();
  }

  async function updateProfile(profileId: string, name: string, emoji: string, title: string) {
    if (!isAdmin) return;
    const { error } = await supabase
      .from("profiles")
      .update({ name: name.trim(), emoji: emoji.trim(), title: title.trim() })
      .eq("id", profileId);
    if (error) return alert(error.message);
    await loadAll();
  }

  const attendanceStats = useMemo(() => {
    return profiles.map((p) => {
      const rows = attendance.filter((a) => a.profile_id === p.id);
      const present = rows.filter((a) => a.status === "present").length;
      const justified = rows.filter((a) => a.status === "justified").length;
      const unjustified = rows.filter((a) => a.status === "unjustified").length;
      const absent = justified + unjustified;
      const total = rows.length;
      return {
        ...p,
        present,
        justified,
        unjustified,
        absent,
        total,
        pct: total ? (present / total) * 100 : 0,
        absentPct: total ? (absent / total) * 100 : 0,
      };
    });
  }, [profiles, attendance]);

  const ranking = useMemo(() => {
    return profiles
      .map((p) => {
        const targetVotes = votes.filter((v) => v.target_id === p.id);
        const performance = targetVotes.reduce((sum, v) => sum + scoreVote(v), 0);
        const voteCount = targetVotes.length;
        const avg = voteCount ? performance / voteCount : 0;

        const penalty = attendance
          .filter((a) => a.profile_id === p.id)
          .reduce((sum, a) => sum + Number(a.penalty || 0), 0);

        const adjustment = adjustments
          .filter((a) => a.profile_id === p.id)
          .reduce((sum, a) => sum + Number(a.points || 0), 0);

        return { ...p, total: performance + penalty + adjustment, avg, voteCount, penalty, adjustment };
      })
      .sort((a, b) => b.total - a.total || b.avg - a.avg);
  }, [profiles, votes, attendance, adjustments]);

  if (!sessionReady || loading) {
    return <main className="shell"><div className="card center">Cargando Liga de Juntadas…</div></main>;
  }

  if (!userId) {
    return (
      <main className="shell auth-shell">
        <div className="auth-card">
          <div className="brand">🏆 Liga de Juntadas</div>
          <p className="muted">Ranking oficial del grupo · edición escabio 🍻</p>
          <div className="auth-switch">
            <button className={authMode === "signin" ? "active" : ""} onClick={() => setAuthMode("signin")}>Entrar</button>
            <button className={authMode === "signup" ? "active" : ""} onClick={() => setAuthMode("signup")}>Crear cuenta</button>
          </div>
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vos@email.com" />
          <label>Contraseña</label>
          <div className="password-wrap">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button"
              className="eye-btn"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
          <button className="primary wide" onClick={submitAuth}>
            {authMode === "signin" ? "Entrar a la liga" : "Crear mi cuenta"}
          </button>
          {authMessage && <div className="notice">{authMessage}</div>}
        </div>
      </main>
    );
  }

  const currentEvent = events.find((e) => e.id === selectedEventId);
  const sortedAttendance = [...attendanceStats].sort((a,b) => b.pct - a.pct || b.present - a.present);
  const sortedAbsences = [...attendanceStats].sort((a,b) => b.absentPct - a.absentPct || b.unjustified - a.unjustified);
  const boozeLeader = sortedAbsences[0];

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>🏆 Liga de Juntadas</h1>
          <div className="muted">Temporada 2026 · 🍻 edición escabio</div>
        </div>
        <div className="mebox">
          <div>{me?.emoji} <strong>{me?.name}</strong></div>
          <span className={isAdmin ? "role admin" : "role"}>{isAdmin ? "👑 Admin" : "Jugador"}</span>
          <button className="linkbtn" onClick={logout}>Salir</button>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab==="ranking"?"active":""} onClick={()=>setTab("ranking")}>Ranking</button>
        <button className={tab==="vote"?"active":""} onClick={()=>setTab("vote")}>Puntuar</button>
        {isAdmin && <button className={tab==="admin"?"active":""} onClick={()=>setTab("admin")}>Admin</button>}
        <button className={tab==="history"?"active":""} onClick={()=>setTab("history")}>Historial</button>
        <button className={tab==="rules"?"active":""} onClick={()=>setTab("rules")}>Reglas</button>
        <button className={tab==="profile"?"active":""} onClick={()=>setTab("profile")}>Mi perfil</button>
      </nav>

      {tab === "ranking" && (
        <>
          <section className="hero">
            <div className="card">
              <div className="eyebrow">Líder actual</div>
              <div className="metric">{ranking[0] ? `${ranking[0].emoji} ${ranking[0].name}` : "—"}</div>
              <div className="muted">{ranking[0] ? `${ranking[0].total.toFixed(0)} puntos` : "Todavía no hay puntos"}</div>
            </div>
            <div className="card">
              <div className="eyebrow">Juntadas</div>
              <div className="metric">{events.length}</div>
              <div className="muted">cargadas en la temporada</div>
            </div>
          </section>

          <section className="card">
            <h2>🏆 Tabla general</h2>
            {ranking.map((r, i) => (
              <div className="ranking-row" key={r.id}>
                <div className="place">{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</div>
                <div className="avatar">{r.emoji}</div>
                <div className="grow">
                  <div className="person-name">{r.name}</div>
                  <div className="title">{r.title}</div>
                  <div className="muted tiny">Promedio de votos {r.avg.toFixed(1)} · ajustes {r.adjustment >= 0 ? "+" : ""}{r.adjustment} · sanciones {r.penalty}</div>
                </div>
                <div className="points">{r.total.toFixed(0)} pts</div>
              </div>
            ))}
          </section>

          <section className="attendance-grid">
            <div className="card">
              <h2>✅ Los más presentes</h2>
              {sortedAttendance.map((r,i)=>(
                <div className="mini-row" key={r.id}>
                  <span>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</span>
                  <span className="grow">{r.emoji} <strong>{r.name}</strong><small>{r.present}/{r.total} juntadas</small></span>
                  <strong>{r.pct.toFixed(0)}%</strong>
                </div>
              ))}
            </div>
            <div className="card">
              <h2>🚫 Los más faltadores</h2>
              {sortedAbsences.map((r,i)=>(
                <div className="mini-row" key={r.id}>
                  <span>{i===0?"🍾":i===1?"🥈":i===2?"🥉":`#${i+1}`}</span>
                  <span className="grow">{r.emoji} <strong>{r.name}</strong><small>{r.absent} faltas · {r.unjustified} sin justificar</small></span>
                  <strong>{r.absentPct.toFixed(0)}%</strong>
                </div>
              ))}
              {boozeLeader && events.length > 0 && (
                <div className="danger-box">🍻 Si la temporada terminara hoy, <strong>{boozeLeader.emoji} {boozeLeader.name}</strong> paga el escabio.</div>
              )}
            </div>
          </section>
        </>
      )}

      {tab === "vote" && (
        <section className="card">
          <div className="section-head">
            <div>
              <h2>📝 Puntuar juntada</h2>
              <p className="muted">Cada usuario puntúa a los demás. No podés votarte a vos mismo.</p>
            </div>
            <select value={selectedEventId} onChange={(e)=>setSelectedEventId(e.target.value)}>
              {events.map(e=><option key={e.id} value={e.id}>{formatDate(e.event_date)} · {e.name}</option>)}
            </select>
          </div>

          {!currentEvent && <div className="notice">Todavía no hay juntadas creadas.</div>}

          {currentEvent && profiles.filter(p=>p.id!==userId).map((p)=>{
            const att = attendance.find(a=>a.event_id===selectedEventId && a.profile_id===p.id);
            const existing = votes.find(v=>v.event_id===selectedEventId && v.voter_id===userId && v.target_id===p.id);
            const draft = voteDrafts[p.id] ?? existing ?? defaultVote;
            const absent = att && att.status !== "present";

            return (
              <div className={`vote-card ${absent ? "disabled" : ""}`} key={p.id}>
                <div className="identity-line">
                  <div className="avatar">{p.emoji}</div>
                  <div><strong>{p.name}</strong><small>{p.title}</small></div>
                  {existing && <span className="saved">✓ Voto guardado</span>}
                </div>

                {absent ? (
                  <div className="absence-label">🚫 No asistió · {att.status === "justified" ? "justificada" : "sin justificar"}</div>
                ) : (
                  <>
                    <div className="category-list">
                      {categories.map(c=>(
                        <div className="category" key={c.key}>
                          <div className="cat-icon">{c.icon}</div>
                          <div className="grow"><strong>{c.label}</strong><small>{c.sub}</small></div>
                          <div className="stepper">
                            <button onClick={()=>{
                              const next = Math.max(1, Number((draft as any)[c.key])-1);
                              setVoteDrafts(s=>({...s,[p.id]:{...draft,[c.key]:next}}));
                            }}>−</button>
                            <span>{(draft as any)[c.key]}</span>
                            <button onClick={()=>{
                              const next = Math.min(10, Number((draft as any)[c.key])+1);
                              setVoteDrafts(s=>({...s,[p.id]:{...draft,[c.key]:next}}));
                            }}>+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button className="primary" onClick={()=>saveVote(p.id)}>Guardar puntaje de {p.name}</button>
                  </>
                )}
              </div>
            );
          })}
        </section>
      )}

      {tab === "admin" && isAdmin && (
        <>
          <section className="card">
            <h2>👑 Crear juntada</h2>
            <div className="form-grid">
              <div><label>Nombre</label><input value={newEventName} onChange={e=>setNewEventName(e.target.value)} placeholder="Ej: Asado en lo de Pagis.tv" /></div>
              <div>
                <label>Fecha</label>
                <div className="date-wrap">
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={newEventDate}
                    onChange={e=>setNewEventDate(e.target.value)}
                    onClick={() => dateInputRef.current?.showPicker?.()}
                  />
                  <button
                    type="button"
                    className="calendar-btn"
                    onClick={() => {
                      const el = dateInputRef.current;
                      if (!el) return;
                      if (typeof el.showPicker === "function") el.showPicker();
                      else el.focus();
                    }}
                    aria-label="Abrir calendario"
                  >📅</button>
                </div>
              </div>
              <div><label>Anfitrión</label>
                <select value={newHost} onChange={e=>setNewHost(e.target.value)}>
                  <option value="">Sin definir</option>
                  {profiles.map(p=><option value={p.id} key={p.id}>{p.emoji} {p.name}</option>)}
                </select>
              </div>
            </div>
            <button className="primary" onClick={createEvent}>Crear juntada</button>
          </section>

          <section className="card">
            <div className="section-head">
              <div><h2>📋 Asistencias y Bonus/Malus</h2><p className="muted">Solo el Admin puede modificar esta sección.</p></div>
              <select value={selectedEventId} onChange={(e)=>setSelectedEventId(e.target.value)}>
                {events.map(e=><option key={e.id} value={e.id}>{formatDate(e.event_date)} · {e.name}</option>)}
              </select>
            </div>

            {profiles.map(p=>(
              <AdminPerson
                key={p.id}
                profile={p}
                attendance={attendance.find(a=>a.event_id===selectedEventId && a.profile_id===p.id)}
                adjustments={adjustments.filter(a=>a.event_id===selectedEventId && a.profile_id===p.id)}
                onAttendance={setAttendanceFor}
                onAdjustment={addAdjustment}
              />
            ))}
          </section>

          <section className="card">
            <h2>👥 Administrar perfiles</h2>
            <p className="muted">Solo el Admin puede cambiar nombre, emoji y título de los integrantes.</p>
            <div className="profile-admin-grid">
              {profiles.map((p) => (
                <AdminProfileEditor key={p.id} profile={p} onSave={updateProfile} />
              ))}
            </div>
          </section>
        </>
      )}

      {tab === "history" && (
        <section className="card">
          <h2>📚 Historial</h2>
          {events.map(e=>{
            const rows = attendance.filter(a=>a.event_id===e.id && a.status!=="present");
            const ads = adjustments.filter(a=>a.event_id===e.id);
            return (
              <div className="history-event" key={e.id}>
                <div><strong>{e.name}</strong><div className="muted">{formatDate(e.event_date)}</div></div>
                {rows.map(a=>{
                  const p=profiles.find(x=>x.id===a.profile_id);
                  return <div className="history-line" key={a.id}>{a.status==="justified"?"🟡":"🔴"} {p?.emoji} {p?.name}: {a.reason || "Sin motivo"} {a.penalty ? `(${a.penalty} pts)` : ""}</div>
                })}
                {ads.map(a=>{
                  const p=profiles.find(x=>x.id===a.profile_id);
                  return <div className="history-line" key={a.id}>⚡ {p?.emoji} {p?.name}: {a.points>0?"+":""}{a.points} · {a.description}</div>
                })}
              </div>
            );
          })}
        </section>
      )}

      {tab === "rules" && (
        <Rules />
      )}

      {tab === "profile" && me && (
        <section className="card profile-editor">
          <h2>👤 Mi perfil</h2>
          <div className="profile-preview">
            <div className="big-avatar">{me.emoji}</div>
            <div>
              <strong>{me.name}</strong>
              <div className="title">{me.title}</div>
              <div className="muted tiny">{isAdmin ? "👑 Administrador" : "Jugador"}</div>
            </div>
          </div>
          <div className="notice">Los perfiles solo los puede modificar el Admin.</div>
        </section>
      )}
    </main>
  );
}

function AdminPerson({
  profile,
  attendance,
  adjustments,
  onAttendance,
  onAdjustment,
}: {
  profile: Profile;
  attendance?: Attendance;
  adjustments: Adjustment[];
  onAttendance: (id:string,status:AttendanceStatus,reason?:string)=>Promise<void>;
  onAdjustment: (id:string,points:number,description:string)=>Promise<void>;
}) {
  const [reason,setReason] = useState(attendance?.reason ?? "");
  const [points,setPoints] = useState(0);
  const [description,setDescription] = useState("");

  useEffect(()=>setReason(attendance?.reason ?? ""),[attendance?.reason]);

  return (
    <div className="admin-person">
      <div className="identity-line">
        <div className="avatar">{profile.emoji}</div>
        <div><strong>{profile.name}</strong><small>{profile.title}</small></div>
      </div>

      <div className="attendance-buttons">
        <button className={attendance?.status==="present"?"present active":"present"} onClick={()=>onAttendance(profile.id,"present","")}>✅ Asistió</button>
        <button className={attendance?.status==="justified"?"justified active":"justified"} onClick={()=>onAttendance(profile.id,"justified",reason)}>🟡 Justificada</button>
        <button className={attendance?.status==="unjustified"?"unjustified active":"unjustified"} onClick={()=>onAttendance(profile.id,"unjustified",reason)}>🔴 Sin justificar</button>
      </div>

      {attendance?.status && attendance.status!=="present" && (
        <div className="reason-row">
          <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Motivo de la inasistencia..." />
          <button className="secondary" onClick={()=>onAttendance(profile.id,attendance.status,reason)}>Guardar motivo</button>
          {attendance.status==="unjustified" && <span className="penalty-chip">−10 pts obligatorio</span>}
        </div>
      )}

      <div className="adjustment-box">
        <div className="point-chips">
          {[-10,-5,-3,0,3,5,10].map(n=>(
            <button key={n} className={points===n?"chip active":"chip"} onClick={()=>setPoints(n)}>{n>0?`+${n}`:n}</button>
          ))}
        </div>
        <input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Descripción: hizo el asado, puso casa, se borró al limpiar..." />
        <button className="secondary" onClick={async()=>{
          await onAdjustment(profile.id,points,description);
          setDescription("");
          setPoints(0);
        }}>Agregar Bonus/Malus</button>
      </div>

      {adjustments.length>0 && (
        <div className="adjustment-history">
          {adjustments.map(a=><span key={a.id} className="adjustment-pill">{a.points>0?"+":""}{a.points} · {a.description}</span>)}
        </div>
      )}
    </div>
  );
}

function AdminProfileEditor({profile,onSave}:{profile:Profile,onSave:(id:string,name:string,emoji:string,title:string)=>Promise<void>}) {
  const [name,setName]=useState(profile.name);
  const [emoji,setEmoji]=useState(profile.emoji);
  const [title,setTitle]=useState(profile.title);

  useEffect(() => {
    setName(profile.name);
    setEmoji(profile.emoji);
    setTitle(profile.title);
  }, [profile.name, profile.emoji, profile.title]);

  return (
    <div className="admin-profile-card">
      <div className="profile-preview compact"><div className="avatar">{emoji || "🙂"}</div><div><strong>{name}</strong><div className="title">{title}</div></div></div>
      <div className="admin-profile-fields">
        <div><label>Emoji</label><input value={emoji} onChange={e=>setEmoji(e.target.value)} /></div>
        <div><label>Nombre / apodo</label><input value={name} onChange={e=>setName(e.target.value)} /></div>
        <div className="full"><label>Título</label><input value={title} onChange={e=>setTitle(e.target.value)} /></div>
      </div>
      <button className="secondary" onClick={()=>onSave(profile.id,name,emoji,title)}>Guardar perfil</button>
    </div>
  );
}

function Rules() {
  return (
    <>
      <section className="card">
        <h2>📜 Reglas de puntuación</h2>
        <p className="muted">La idea es premiar al que suma en la juntada y castigar las ausencias sin justificar. El puntaje de cada voto va de 1 a 10 por categoría y se transforma a una escala de 0 a 100 según estos pesos.</p>
        <div className="rules-grid">
          <div className="rule-card"><span>🛒</span><div><strong>Colaboración</strong><small>Compras, organización, traer cosas, dar una mano.</small></div><b>30%</b></div>
          <div className="rule-card"><span>🧹</span><div><strong>Limpieza</strong><small>Ordenar, lavar, levantar y ayudar al final.</small></div><b>30%</b></div>
          <div className="rule-card"><span>🤝</span><div><strong>Comportamiento</strong><small>Buena onda, convivencia y respeto al grupo.</small></div><b>20%</b></div>
          <div className="rule-card"><span>🎉</span><div><strong>Actitud</strong><small>Predisposición, participación y coparse.</small></div><b>20%</b></div>
        </div>
      </section>

      <section className="card">
        <h2>📅 Asistencia y sanciones</h2>
        <div className="rule-lines">
          <div><span>✅</span><div><strong>Asistió</strong><small>Puede recibir votos normalmente.</small></div></div>
          <div><span>🟡</span><div><strong>Falta justificada</strong><small>Cuenta como inasistencia para el porcentaje, pero no resta puntos.</small></div></div>
          <div><span>🔴</span><div><strong>Falta sin justificar</strong><small>Cuenta como inasistencia y resta 10 puntos automáticamente.</small></div></div>
          <div><span>⚡</span><div><strong>Bonus / Malus</strong><small>Se suma o resta aparte del voto. Solo el Admin puede asignarlo y siempre lleva una descripción.</small></div></div>
        </div>
      </section>

      <section className="card">
        <h2>🧮 Ejemplo</h2>
        <p className="muted">Si alguien recibe 8 en Colaboración, 9 en Limpieza, 7 en Comportamiento y 10 en Actitud:</p>
        <div className="formula">8×3 + 9×3 + 7×2 + 10×2 = <strong>85 puntos</strong></div>
        <p className="muted tiny">Después se agregan los Bonus/Malus y las penalizaciones por faltas sin justificar.</p>
      </section>
    </>
  );
}
