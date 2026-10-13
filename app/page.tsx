"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Role = "admin" | "user";
type AttendanceStatus = "present" | "justified" | "unjustified";
type CategoryKey = "collaboration" | "cleaning" | "behavior" | "attitude";

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
  closed_at: string | null;
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

type VoteReviewStatus = "approved" | "pending" | "rejected";

type Vote = {
  id: string;
  event_id: string;
  voter_id: string;
  target_id: string;
  collaboration: number;
  cleaning: number;
  behavior: number;
  attitude: number;
  review_status: VoteReviewStatus;
  review_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

const supabase = createClient();

const UNJUSTIFIED_PENALTY = -10;
const MISSED_VOTING_PENALTY = -5;
const VOTING_HOURS = 72;
const OUTLIER_THRESHOLD = 3;
const SUSPICIOUS_THRESHOLD = 4;

const categories: Array<{
  key: CategoryKey;
  label: string;
  icon: string;
  sub: string;
  weight: number;
}> = [
  { key: "collaboration", label: "Colaboración", icon: "🛒", sub: "Compras, organización y aporte", weight: 0.30 },
  { key: "cleaning", label: "Limpieza", icon: "🧹", sub: "Orden, lavado y ayuda al final", weight: 0.30 },
  { key: "behavior", label: "Comportamiento", icon: "🤝", sub: "Convivencia y buena onda", weight: 0.20 },
  { key: "attitude", label: "Actitud", icon: "🎉", sub: "Predisposición y participación", weight: 0.20 },
];

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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function deadlineFor(event: EventRow) {
  if (!event.closed_at) return null;
  return new Date(new Date(event.closed_at).getTime() + VOTING_HOURS * 60 * 60 * 1000);
}

function isDeadlineExpired(event: EventRow) {
  const deadline = deadlineFor(event);
  return !!deadline && Date.now() > deadline.getTime();
}

function formatRemainingTime(milliseconds: number) {
  if (milliseconds <= 0) return "00:00:00";

  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const clock = [hours, minutes, seconds]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");

  return days > 0
    ? `${days} ${days === 1 ? "día" : "días"} · ${clock}`
    : clock;
}

function weightedScore(values: Record<CategoryKey, number>) {
  return categories.reduce((sum, c) => sum + values[c.key] * c.weight * 10, 0);
}

function average(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function trimmedAverage(nums: number[]) {
  if (!nums.length) return 0;
  if (nums.length < 5) return average(nums);
  const sorted = [...nums].sort((a, b) => a - b);
  return average(sorted.slice(1, -1));
}

function suspiciousPattern(values: Record<CategoryKey, number>) {
  const nums = categories.map((c) => Number(values[c.key]));
  return nums.every((n) => n === 1) || nums.every((n) => n === 10);
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
  const editDateInputRef = useRef<HTMLInputElement>(null);

  const [newEventName, setNewEventName] = useState("");
  const [newEventDate, setNewEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [newHost, setNewHost] = useState("");
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editEventName, setEditEventName] = useState("");
  const [editEventDate, setEditEventDate] = useState("");
  const [editEventHost, setEditEventHost] = useState("");

  const [selectedEventId, setSelectedEventId] = useState("");
  const [voteDrafts, setVoteDrafts] = useState<Record<string, typeof defaultVote>>({});
  const [voteComments, setVoteComments] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());

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
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
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
      const { data, error } = await supabase.auth.signUp({ email, password });

      if (error) {
        setAuthMessage(error.message);
        return;
      }

      // Con "Confirm email" desactivado en Supabase, el registro crea sesión inmediatamente.
      // Si por configuración del proyecto no hubiera sesión, mostramos un aviso genérico
      // sin pedirle al usuario que confirme ningún correo.
      if (!data.session) {
        setAuthMessage("Cuenta creada. Probá iniciar sesión con el mismo email y contraseña.");
      } else {
        setAuthMessage("");
      }
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
      is_closed: false,
      closed_at: null,
    });
    if (error) return alert(error.message);
    setNewEventName("");
    await loadAll();
  }

  function startEditEvent(event: EventRow) {
    if (!isAdmin) return;
    setEditingEventId(event.id);
    setEditEventName(event.name);
    setEditEventDate(event.event_date);
    setEditEventHost(event.host_id ?? "");
  }

  function cancelEditEvent() {
    setEditingEventId(null);
    setEditEventName("");
    setEditEventDate("");
    setEditEventHost("");
  }

  async function saveEventEdit() {
    if (!isAdmin || !editingEventId) return;
    if (!editEventName.trim()) return alert("La juntada necesita un nombre.");

    const event = events.find((e) => e.id === editingEventId);
    if (!event) return;

    if (event.is_closed) {
      return alert("La juntada está cerrada. Reabrila antes de modificar sus datos.");
    }

    const { error } = await supabase
      .from("events")
      .update({
        name: editEventName.trim(),
        event_date: editEventDate,
        host_id: editEventHost || null,
      })
      .eq("id", editingEventId);

    if (error) return alert(error.message);
    cancelEditEvent();
    await loadAll();
  }

  async function deleteEvent(event: EventRow) {
    if (!isAdmin) return;

    const ok = confirm(
      `¿Eliminar "${event.name}"?\n\nEsto va a borrar también sus asistencias, votos y Bonus/Malus. Esta acción no se puede deshacer.`
    );
    if (!ok) return;

    const typed = prompt(`Para confirmar, escribí ELIMINAR`);
    if (typed !== "ELIMINAR") {
      alert("Eliminación cancelada.");
      return;
    }

    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", event.id);

    if (error) return alert(error.message);

    if (selectedEventId === event.id) {
      setSelectedEventId("");
    }
    if (editingEventId === event.id) {
      cancelEditEvent();
    }

    await loadAll();
  }

  async function closeEvent(eventId: string) {
    if (!isAdmin) return;

    const missingAttendance = profiles.filter(
      (p) => !attendance.some((a) => a.event_id === eventId && a.profile_id === p.id)
    );

    if (missingAttendance.length) {
      return alert(
        `Antes de cerrar la juntada marcá la asistencia de todos. Falta: ${missingAttendance
          .map((p) => p.name)
          .join(", ")}`
      );
    }

    if (!confirm("¿Cerrar la juntada? Desde ahora empiezan las 72 horas para completar los votos.")) return;

    const { error } = await supabase
      .from("events")
      .update({ is_closed: true, closed_at: new Date().toISOString() })
      .eq("id", eventId);

    if (error) return alert(error.message);
    await loadAll();
  }

  async function setAttendanceFor(profileId: string, status: AttendanceStatus, reason = "") {
    if (!isAdmin || !selectedEventId) return;

    const event = events.find((e) => e.id === selectedEventId);
    if (event?.is_closed) return alert("La juntada ya está cerrada. La asistencia quedó bloqueada.");

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

    const event = events.find((e) => e.id === selectedEventId);
    if (!event?.is_closed || !event.closed_at) {
      return alert("La votación se habilita cuando el Admin cierra la juntada.");
    }
    if (isDeadlineExpired(event)) {
      return alert("El plazo de 72 horas ya terminó.");
    }

    const myAttendance = attendance.find(
      (x) => x.event_id === selectedEventId && x.profile_id === userId
    );
    if (myAttendance?.status !== "present") {
      return alert("Solo los asistentes pueden votar en esta juntada.");
    }

    const targetAttendance = attendance.find(
      (x) => x.event_id === selectedEventId && x.profile_id === targetId
    );
    if (targetAttendance?.status !== "present") {
      return alert("No podés puntuar a alguien que faltó.");
    }

    const draft = voteDrafts[targetId] ?? defaultVote;
    const reviewCheck = classifyVoteDraft(targetId, draft);
    const reviewComment = (voteComments[targetId] ?? "").trim();

    if (reviewCheck.level === "suspicious" && !reviewComment) {
      return alert("Este voto fue detectado como dudoso. Tenés que explicar brevemente por qué elegiste esas notas.");
    }

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
      review_comment: reviewCheck.level === "suspicious" ? reviewComment : null,
    };

    const result = existing
      ? await supabase.from("votes").update(payload).eq("id", existing.id)
      : await supabase.from("votes").insert(payload);

    if (result.error) return alert(result.error.message);
    setVoteComments((s) => ({ ...s, [targetId]: "" }));
    await loadAll();
  }

  async function reviewVote(voteId: string, status: "approved" | "rejected") {
    if (!isAdmin || !userId) return;

    const { error } = await supabase
      .from("votes")
      .update({
        review_status: status,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", voteId);

    if (error) return alert(error.message);
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

  function classifyVoteDraft(targetId: string, draft: typeof defaultVote) {
    const peerVotes = votes.filter(
      (v) =>
        v.event_id === selectedEventId &&
        v.target_id === targetId &&
        v.voter_id !== userId &&
        v.review_status !== "rejected"
    );

    let level: "normal" | "atypical" | "suspicious" = "normal";
    const details: Array<{ label: string; value: number; peerAverage: number; diff: number }> = [];

    if (peerVotes.length >= 2) {
      categories.forEach((c) => {
        const peerAverage = average(peerVotes.map((v) => Number(v[c.key])));
        const value = Number(draft[c.key]);
        const diff = Math.abs(value - peerAverage);

        if (diff > OUTLIER_THRESHOLD) {
          details.push({ label: c.label, value, peerAverage, diff });
        }

        if (diff > SUSPICIOUS_THRESHOLD) {
          level = "suspicious";
        } else if (diff > OUTLIER_THRESHOLD && level !== "suspicious") {
          level = "atypical";
        }
      });
    }

    if (suspiciousPattern(draft)) {
      level = "suspicious";
    }

    return { level, details, peerCount: peerVotes.length };
  }

  function currentUserWasPresent(eventId: string) {
    if (!userId) return false;
    return attendance.some(
      (a) =>
        a.event_id === eventId &&
        a.profile_id === userId &&
        a.status === "present"
    );
  }

  function presentIdsForEvent(eventId: string) {
    return attendance
      .filter((a) => a.event_id === eventId && a.status === "present")
      .map((a) => a.profile_id);
  }

  function votingProgress(eventId: string, voterId: string) {
    const presentIds = presentIdsForEvent(eventId);
    if (!presentIds.includes(voterId)) return { required: 0, completed: 0, done: true };
    const targets = presentIds.filter((id) => id !== voterId);
    const completedTargets = new Set(
      votes
        .filter((v) => v.event_id === eventId && v.voter_id === voterId && targets.includes(v.target_id))
        .map((v) => v.target_id)
    );
    return {
      required: targets.length,
      completed: completedTargets.size,
      done: completedTargets.size >= targets.length,
    };
  }

  function missedVotingPenalty(profileId: string) {
    return events.reduce((sum, e) => {
      if (!e.is_closed || !e.closed_at || !isDeadlineExpired(e)) return sum;
      const att = attendance.find((a) => a.event_id === e.id && a.profile_id === profileId);
      if (att?.status !== "present") return sum;
      const progress = votingProgress(e.id, profileId);
      return sum + (progress.done ? 0 : MISSED_VOTING_PENALTY);
    }, 0);
  }

  function eventCategoryAverages(eventId: string, targetId: string) {
    const targetVotes = votes.filter(
      (v) =>
        v.event_id === eventId &&
        v.target_id === targetId &&
        v.review_status === "approved"
    );
    const result = {} as Record<CategoryKey, number>;
    categories.forEach((c) => {
      result[c.key] = trimmedAverage(targetVotes.map((v) => Number(v[c.key])));
    });
    return { values: result, voteCount: targetVotes.length };
  }

  function eventFinalScore(eventId: string, targetId: string) {
    const { values, voteCount } = eventCategoryAverages(eventId, targetId);
    if (!voteCount) return { score: 0, voteCount, values };
    return { score: weightedScore(values), voteCount, values };
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
        const eventScores = events
          .map((e) => eventFinalScore(e.id, p.id))
          .filter((x) => x.voteCount > 0);

        // Rendimiento: promedio 0-100 de las juntadas donde recibió votos válidos.
        const performanceSum = eventScores.reduce((sum, x) => sum + x.score, 0);
        const performanceAvg = eventScores.length ? performanceSum / eventScores.length : 0;

        // Asistencia: porcentaje sobre todas las juntadas donde el Admin ya marcó su estado.
        const attendanceRows = attendance.filter((a) => a.profile_id === p.id);
        const attendedCount = attendanceRows.filter((a) => a.status === "present").length;
        const attendancePct = attendanceRows.length
          ? (attendedCount / attendanceRows.length) * 100
          : 0;

        // Penalizaciones y Bonus/Malus se normalizan para que una sola fecha
        // no destruya el ranking de temporada.
        const attendancePenalty = attendanceRows
          .reduce((sum, a) => sum + Number(a.penalty || 0), 0);

        const deadlinePenalty = missedVotingPenalty(p.id);

        const adjustment = adjustments
          .filter((a) => a.profile_id === p.id)
          .reduce((sum, a) => sum + Number(a.points || 0), 0);

        const rawAdjustments = attendancePenalty + deadlinePenalty + adjustment;
        const normalizationEvents = Math.max(attendanceRows.length, 1);
        const normalizedAdjustment = rawAdjustments / normalizationEvents;

        const baseScore = performanceAvg * 0.85 + attendancePct * 0.15;
        const total = Math.max(0, Math.min(100, baseScore + normalizedAdjustment));

        return {
          ...p,
          total,
          baseScore,
          performanceAvg,
          attendancePct,
          scoredEvents: eventScores.length,
          normalizationEvents,
          attendancePenalty,
          deadlinePenalty,
          adjustment,
          rawAdjustments,
          normalizedAdjustment,
        };
      })
      // El ranking principal se define por el promedio general.
      // En caso de empate, usamos asistencia y luego el puntaje ajustado como desempate.
      .sort(
        (a, b) =>
          b.performanceAvg - a.performanceAvg ||
          b.attendancePct - a.attendancePct ||
          b.total - a.total
      );
  }, [profiles, votes, attendance, adjustments, events]);

  const outliers = useMemo(() => {
    const result: Array<{
      vote: Vote;
      categories: Array<{ key: CategoryKey; label: string; value: number; peerAverage: number }>;
    }> = [];

    votes
      .filter((vote) => vote.review_status !== "rejected")
      .forEach((vote) => {
      const sameTarget = votes.filter(
        (v) =>
          v.event_id === vote.event_id &&
          v.target_id === vote.target_id &&
          v.voter_id !== vote.voter_id &&
          v.review_status !== "rejected"
      );

      if (sameTarget.length < 2) return;

      const flagged = categories
        .map((c) => {
          const peerAverage = average(sameTarget.map((v) => Number(v[c.key])));
          const value = Number(vote[c.key]);
          return { key: c.key, label: c.label, value, peerAverage };
        })
        .filter((x) => Math.abs(x.value - x.peerAverage) > OUTLIER_THRESHOLD);

      if (flagged.length) result.push({ vote, categories: flagged });
    });

    return result;
  }, [votes]);

  const activeVotingTimers = useMemo(() => {
    return events
      .filter((e) => e.is_closed && e.closed_at)
      .map((e) => {
        const deadline = deadlineFor(e);
        if (!deadline) return null;

        const remainingMs = deadline.getTime() - now;

        return {
          event: e,
          deadline,
          remainingMs,
          expired: remainingMs <= 0,
        };
      })
      .filter(
        (item): item is {
          event: EventRow;
          deadline: Date;
          remainingMs: number;
          expired: boolean;
        } => !!item && !item.expired
      )
      .sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
  }, [events, now]);

  const pendingVotingByEvent = useMemo(() => {
    return events
      .filter((e) => e.is_closed && e.closed_at)
      .map((e) => {
        const presentIds = attendance
          .filter((a) => a.event_id === e.id && a.status === "present")
          .map((a) => a.profile_id);

        const pending = presentIds
          .map((profileId) => {
            const profile = profiles.find((p) => p.id === profileId);
            const requiredTargets = presentIds.filter((id) => id !== profileId);
            const completedTargets = new Set(
              votes
                .filter((v) => v.event_id === e.id && v.voter_id === profileId && requiredTargets.includes(v.target_id))
                .map((v) => v.target_id)
            );
            const required = requiredTargets.length;
            const completed = completedTargets.size;
            if (!profile || completed >= required) return null;
            return { profile, required, completed, missing: required - completed };
          })
          .filter(Boolean) as Array<{ profile: Profile; required: number; completed: number; missing: number }>;

        return { event: e, pending, deadline: deadlineFor(e), expired: isDeadlineExpired(e) };
      })
      .filter((x) => x.pending.length > 0);
  }, [events, attendance, votes, profiles]);

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
  const myProgress = currentEvent && userId ? votingProgress(currentEvent.id, userId) : null;
  const currentDeadline = currentEvent ? deadlineFor(currentEvent) : null;

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
              <div className="muted">{ranking[0] ? `${ranking[0].performanceAvg.toFixed(1)} promedio` : "Todavía no hay puntos"}</div>
            </div>
            <div className="card">
              <div className="eyebrow">Juntadas</div>
              <div className="metric">{events.length}</div>
              <div className="muted">cargadas en la temporada</div>
            </div>
          </section>

          <section className="card">
            <div className="section-head">
              <div>
                <h2>⏳ Cierre de votaciones</h2>
                <p className="muted">Tiempo restante para cada juntada que todavía tiene la votación abierta.</p>
              </div>
            </div>

            {activeVotingTimers.length === 0 ? (
              <div className="notice">No hay votaciones abiertas en este momento.</div>
            ) : (
              <div className="timer-grid">
                {activeVotingTimers.map(({ event, deadline, remainingMs }) => (
                  <div className="voting-timer-card" key={event.id}>
                    <div className="timer-event-name">🍖 {event.name}</div>
                    <div className="timer-label">Cierra en</div>
                    <div className="timer-value">{formatRemainingTime(remainingMs)}</div>
                    <div className="muted tiny">
                      Cierre: {formatDateTime(deadline.toISOString())}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <div className="section-head pending-head">
              <div>
                <h2>🗳️ Votaciones pendientes</h2>
                <p className="muted">Quién todavía debe completar votos y en qué juntada.</p>
              </div>
            </div>
            {pendingVotingByEvent.length === 0 ? (
              <div className="success-box">✅ No hay votaciones pendientes.</div>
            ) : (
              <div className="pending-event-list">
                {pendingVotingByEvent.map(({ event, pending, deadline, expired }) => (
                  <div className={`pending-event-card ${expired ? "expired" : ""}`} key={event.id}>
                    <div className="pending-event-top">
                      <div>
                        <strong>{event.name}</strong>
                        <div className="muted tiny">
                          {formatDate(event.event_date)}
                          {deadline ? ` · ${expired ? "⛔ Venció" : "⏰ Vence"} ${formatDateTime(deadline.toISOString())}` : ""}
                        </div>
                      </div>
                      <span className={expired ? "pending-status expired" : "pending-status"}>
                        {expired ? "Plazo vencido" : "Pendiente"}
                      </span>
                    </div>
                    <div className="pending-people">
                      {pending.map((item) => (
                        <div className="pending-person" key={`${event.id}-${item.profile.id}`}>
                          <div className="identity-line pending-identity">
                            <div className="mini-avatar">{item.profile.emoji}</div>
                            <div className="grow">
                              <strong>{item.profile.name}</strong>
                              <small>{item.completed}/{item.required} completados · faltan {item.missing}</small>
                            </div>
                            {expired && <span className="penalty-chip">−5 pts</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2>🏆 Tabla general · Promedio general</h2>
            {ranking.map((r, i) => (
              <div className="ranking-row" key={r.id}>
                <div className="place">{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</div>
                <div className="avatar">{r.emoji}</div>
                <div className="grow">
                  <div className="person-name">{r.name}</div>
                  <div className="title">{r.title}</div>
                  <div className="muted tiny">
                    Promedio general {r.performanceAvg.toFixed(1)} · Asistencia {r.attendancePct.toFixed(0)}%
                    {" · "}{r.scoredEvents} juntadas puntuadas
                  </div>
                  <div className="muted tiny">
                    Puntos ajustados {r.total.toFixed(1)}
                    {" · "}Bonus/Malus {r.adjustment >= 0 ? "+" : ""}{r.adjustment}
                    {r.attendancePenalty !== 0 && <> · faltas {r.attendancePenalty}</>}
                    {r.deadlinePenalty !== 0 && <> · votos tarde {r.deadlinePenalty}</>}
                  </div>
                </div>
                <div className="points">
                  <strong>{r.performanceAvg.toFixed(1)}</strong>
                  <small>prom.</small>
                </div>
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
                  <span className="grow">{r.emoji} <strong>{r.name}</strong><small>{r.absent} faltas · {r.unjustified} no justificable</small></span>
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
              <p className="muted">La votación se habilita al cerrar la juntada y queda abierta durante 72 horas.</p>
            </div>
            <select value={selectedEventId} onChange={(e)=>setSelectedEventId(e.target.value)}>
              {events.map(e=><option key={e.id} value={e.id}>{formatDate(e.event_date)} · {e.name}</option>)}
            </select>
          </div>

          {!currentEvent && <div className="notice">Todavía no hay juntadas creadas.</div>}

          {currentEvent && (
            <>
              {!currentUserWasPresent(currentEvent.id) && (
                <div className="danger-box voting-blocked-notice">
                  🚫 No podés votar en <strong>{currentEvent.name}</strong> porque no figurás como presente en esa juntada.
                </div>
              )}

              {!currentEvent.is_closed && (
                <div className="notice">⏳ Esta juntada todavía está abierta. El Admin debe cerrarla para comenzar la votación.</div>
              )}

              {currentEvent.is_closed && currentDeadline && (
                <div className={isDeadlineExpired(currentEvent) ? "danger-box" : "deadline-box"}>
                  {isDeadlineExpired(currentEvent)
                    ? `⛔ El plazo terminó el ${formatDateTime(currentDeadline.toISOString())}.`
                    : `⏰ Tenés hasta el ${formatDateTime(currentDeadline.toISOString())} para completar todos tus votos.`}
                  {myProgress && myProgress.required > 0 && (
                    <div className="tiny" style={{marginTop: 5}}>
                      Progreso: {myProgress.completed}/{myProgress.required} votos completos.
                    </div>
                  )}
                </div>
              )}

              {profiles.filter(p=>p.id!==userId).map((p)=>{
                const att = attendance.find(a=>a.event_id===selectedEventId && a.profile_id===p.id);
                const existing = votes.find(v=>v.event_id===selectedEventId && v.voter_id===userId && v.target_id===p.id);
                const draft = voteDrafts[p.id] ?? existing ?? defaultVote;
                const reviewCheck = classifyVoteDraft(p.id, draft as typeof defaultVote);
                const absent = att?.status !== "present";
                const voterAbsent = !currentUserWasPresent(currentEvent.id);
                const disabled =
                  !currentEvent.is_closed ||
                  isDeadlineExpired(currentEvent) ||
                  absent ||
                  voterAbsent;

                return (
                  <div className={`vote-card ${disabled ? "disabled" : ""}`} key={p.id}>
                    <div className="identity-line">
                      <div className="avatar">{p.emoji}</div>
                      <div><strong>{p.name}</strong><small>{p.title}</small></div>
                      {existing && (
                        <span className={
                          existing.review_status === "pending"
                            ? "review-badge pending"
                            : existing.review_status === "rejected"
                            ? "review-badge rejected"
                            : "saved"
                        }>
                          {existing.review_status === "pending"
                            ? "⏳ Pendiente de revisión"
                            : existing.review_status === "rejected"
                            ? "❌ Rechazado"
                            : "✓ Voto guardado"}
                        </span>
                      )}
                    </div>

                    {voterAbsent ? (
                      <div className="absence-label">🚫 No podés votar porque no estuviste presente en esta juntada.</div>
                    ) : absent ? (
                      <div className="absence-label">🚫 No podés votar a esta persona porque no asistió a esta juntada.</div>
                    ) : !currentEvent.is_closed ? (
                      <div className="notice">Esperando que el Admin cierre la juntada.</div>
                    ) : isDeadlineExpired(currentEvent) ? (
                      <div className="absence-label">⛔ Plazo de votación vencido.</div>
                    ) : (
                      <>
                        <div className="category-list">
                          {categories.map(c=>(
                            <div className="category" key={c.key}>
                              <div className="cat-icon">{c.icon}</div>
                              <div className="grow"><strong>{c.label}</strong><small>{c.sub} · {(c.weight*100).toFixed(0)}%</small></div>
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

                        {reviewCheck.level === "atypical" && (
                          <div className="vote-warning atypical">
                            🟡 Este voto se aleja bastante del promedio del resto. Se puede guardar, pero quedará marcado para el Admin.
                          </div>
                        )}

                        {reviewCheck.level === "suspicious" && (
                          <div className="vote-warning suspicious">
                            <strong>🔴 Voto dudoso</strong>
                            <div className="tiny">
                              Estas notas son demasiado distintas al resto o forman un patrón extremo. Necesitás explicar el motivo y el voto quedará pendiente de aprobación.
                            </div>
                            {reviewCheck.details.length > 0 && (
                              <div className="tiny warning-details">
                                {reviewCheck.details.map((d) => (
                                  <div key={d.label}>
                                    {d.label}: pusiste <b>{d.value}</b> · promedio del resto <b>{d.peerAverage.toFixed(1)}</b>
                                  </div>
                                ))}
                              </div>
                            )}
                            <textarea
                              className="review-comment"
                              value={voteComments[p.id] ?? existing?.review_comment ?? ""}
                              onChange={(e) => setVoteComments((s) => ({ ...s, [p.id]: e.target.value }))}
                              placeholder="Explicá brevemente por qué corresponde este puntaje..."
                            />
                          </div>
                        )}

                        <button className="primary" onClick={()=>saveVote(p.id)}>Guardar puntaje de {p.name}</button>
                      </>
                    )}
                  </div>
                );
              })}
            </>
          )}
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
            <h2>🗂️ Administrar juntadas</h2>
            <p className="muted">Podés editar nombre, fecha y anfitrión mientras la juntada esté abierta. También podés eliminarla por completo.</p>

            <div className="event-admin-list">
              {events.length === 0 && <div className="notice">Todavía no hay juntadas creadas.</div>}

              {events.map((e) => {
                const host = profiles.find((p) => p.id === e.host_id);
                const isEditing = editingEventId === e.id;

                return (
                  <div className="event-admin-card" key={e.id}>
                    {!isEditing ? (
                      <>
                        <div className="event-admin-main">
                          <div>
                            <strong>{e.name}</strong>
                            <div className="muted tiny">
                              {formatDate(e.event_date)}
                              {host ? ` · ${host.emoji} ${host.name}` : " · Sin anfitrión"}
                              {e.is_closed ? " · 🔒 Cerrada" : " · 🟢 Abierta"}
                            </div>
                          </div>
                          <div className="event-admin-actions">
                            <button
                              className="secondary"
                              disabled={e.is_closed}
                              onClick={() => startEditEvent(e)}
                              title={e.is_closed ? "La juntada está cerrada" : "Editar juntada"}
                            >
                              ✏️ Editar
                            </button>
                            <button
                              className="danger-btn"
                              onClick={() => deleteEvent(e)}
                            >
                              🗑️ Eliminar
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="event-edit-form">
                        <div className="form-grid">
                          <div>
                            <label>Nombre</label>
                            <input value={editEventName} onChange={(x)=>setEditEventName(x.target.value)} />
                          </div>
                          <div>
                            <label>Fecha</label>
                            <div className="date-wrap">
                              <input
                                ref={editDateInputRef}
                                type="date"
                                value={editEventDate}
                                onChange={(x)=>setEditEventDate(x.target.value)}
                                onClick={() => editDateInputRef.current?.showPicker?.()}
                              />
                              <button
                                type="button"
                                className="calendar-btn"
                                onClick={() => {
                                  const el = editDateInputRef.current;
                                  if (!el) return;
                                  if (typeof el.showPicker === "function") el.showPicker();
                                  else el.focus();
                                }}
                                aria-label="Abrir calendario"
                              >📅</button>
                            </div>
                          </div>
                          <div>
                            <label>Anfitrión</label>
                            <select value={editEventHost} onChange={(x)=>setEditEventHost(x.target.value)}>
                              <option value="">Sin definir</option>
                              {profiles.map(p=><option value={p.id} key={p.id}>{p.emoji} {p.name}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="event-edit-actions">
                          <button className="primary" onClick={saveEventEdit}>Guardar cambios</button>
                          <button className="secondary" onClick={cancelEditEvent}>Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <div className="section-head">
              <div>
                <h2>📋 Asistencia, Bonus/Malus y cierre</h2>
                <p className="muted">Marcá la asistencia de todos. Al cerrar la fecha empieza el plazo de 72 horas.</p>
              </div>
              <select value={selectedEventId} onChange={(e)=>setSelectedEventId(e.target.value)}>
                {events.map(e=><option key={e.id} value={e.id}>{formatDate(e.event_date)} · {e.name}</option>)}
              </select>
            </div>

            {currentEvent && (
              <div className="event-status">
                <div>
                  <strong>{currentEvent.is_closed ? "🔒 Juntada cerrada" : "🟢 Juntada abierta"}</strong>
                  {currentEvent.closed_at && (
                    <small>
                      Cerrada: {formatDateTime(currentEvent.closed_at)} · vence votación: {formatDateTime(deadlineFor(currentEvent)!.toISOString())}
                    </small>
                  )}
                </div>
                {!currentEvent.is_closed && (
                  <button className="close-event-btn" onClick={()=>closeEvent(currentEvent.id)}>🔒 Cerrar juntada e iniciar 72 h</button>
                )}
              </div>
            )}

            {profiles.map(p=>(
              <AdminPerson
                key={p.id}
                profile={p}
                attendance={attendance.find(a=>a.event_id===selectedEventId && a.profile_id===p.id)}
                adjustments={adjustments.filter(a=>a.event_id===selectedEventId && a.profile_id===p.id)}
                onAttendance={setAttendanceFor}
                onAdjustment={addAdjustment}
                attendanceLocked={!!currentEvent?.is_closed}
              />
            ))}
          </section>

          <section className="card">
            <h2>🔎 Detalle de votaciones</h2>
            <p className="muted">Visible solo para el Admin. Podés ver quién puntuó a quién y cómo.</p>
            <VoteDetails
              eventId={selectedEventId}
              votes={votes}
              profiles={profiles}
            />
          </section>

          <section className="card">
            <h2>🛡️ Votos dudosos pendientes de aprobación</h2>
            <p className="muted">Estos votos no cuentan para el ranking hasta que los apruebes.</p>

            {votes.filter(v => v.event_id === selectedEventId && v.review_status === "pending").length === 0 ? (
              <div className="success-box">✅ No hay votos dudosos pendientes.</div>
            ) : (
              <div className="review-queue">
                {votes
                  .filter(v => v.event_id === selectedEventId && v.review_status === "pending")
                  .map(v => {
                    const voter = profiles.find(p => p.id === v.voter_id);
                    const target = profiles.find(p => p.id === v.target_id);
                    return (
                      <div className="review-card" key={v.id}>
                        <div className="review-card-head">
                          <strong>{voter?.emoji} {voter?.name} → {target?.emoji} {target?.name}</strong>
                          <span className="review-badge pending">⏳ Pendiente</span>
                        </div>
                        <div className="vote-detail-scores">
                          <span>🛒 {v.collaboration}</span>
                          <span>🧹 {v.cleaning}</span>
                          <span>🤝 {v.behavior}</span>
                          <span>🎉 {v.attitude}</span>
                        </div>
                        <div className="review-reason">
                          <span>💬 Motivo:</span> {v.review_comment || "Sin explicación"}
                        </div>
                        <div className="review-actions">
                          <button className="approve-btn" onClick={() => reviewVote(v.id, "approved")}>✅ Aprobar</button>
                          <button className="danger-btn" onClick={() => reviewVote(v.id, "rejected")}>❌ Rechazar</button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>

          <section className="card">
            <h2>⚠️ Votos a revisar</h2>
            <p className="muted">Se marca un voto cuando alguna categoría queda a más de {OUTLIER_THRESHOLD} puntos del promedio de los demás votantes. No se anula: el promedio recortado protege el puntaje final.</p>
            {outliers.filter(o=>o.vote.event_id===selectedEventId).length === 0 ? (
              <div className="notice">No hay votos atípicos detectados en esta fecha.</div>
            ) : (
              <div className="outlier-list">
                {outliers.filter(o=>o.vote.event_id===selectedEventId).map((o)=>{
                  const voter = profiles.find(p=>p.id===o.vote.voter_id);
                  const target = profiles.find(p=>p.id===o.vote.target_id);
                  return (
                    <div className="outlier-card" key={o.vote.id}>
                      <strong>{voter?.emoji} {voter?.name} → {target?.emoji} {target?.name}</strong>
                      {o.categories.map(c=>(
                        <div className="tiny" key={c.key}>
                          ⚠️ {c.label}: puso <b>{c.value}</b> · promedio del resto {c.peerAverage.toFixed(1)}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
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
            const overdue = profiles.filter((p)=>{
              if (!e.is_closed || !e.closed_at || !isDeadlineExpired(e)) return false;
              const att = attendance.find(a=>a.event_id===e.id && a.profile_id===p.id);
              return att?.status === "present" && !votingProgress(e.id,p.id).done;
            });

            return (
              <div className="history-event" key={e.id}>
                <div>
                  <strong>{e.name}</strong>
                  <div className="muted">
                    {formatDate(e.event_date)}
                    {e.is_closed && e.closed_at ? ` · 🔒 cerrada ${formatDateTime(e.closed_at)}` : " · 🟢 abierta"}
                  </div>
                </div>
                {rows.map(a=>{
                  const p=profiles.find(x=>x.id===a.profile_id);
                  return <div className="history-line" key={a.id}>{a.status==="justified"?"🟡":"🔴"} {p?.emoji} {p?.name}: {a.reason || "Sin motivo"} {a.penalty ? `(${a.penalty} pts)` : ""}</div>
                })}
                {ads.map(a=>{
                  const p=profiles.find(x=>x.id===a.profile_id);
                  return <div className="history-line" key={a.id}>⚡ {p?.emoji} {p?.name}: {a.points>0?"+":""}{a.points} · {a.description}</div>
                })}
                {overdue.map(p=>(
                  <div className="history-line deadline-penalty" key={`deadline-${e.id}-${p.id}`}>
                    ⏰ {p.emoji} {p.name}: no completó todos los votos en 72 h ({MISSED_VOTING_PENALTY} pts)
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      )}

      {tab === "rules" && <Rules />}

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
  attendanceLocked,
}: {
  profile: Profile;
  attendance?: Attendance;
  adjustments: Adjustment[];
  onAttendance: (id:string,status:AttendanceStatus,reason?:string)=>Promise<void>;
  onAdjustment: (id:string,points:number,description:string)=>Promise<void>;
  attendanceLocked: boolean;
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
        <button disabled={attendanceLocked} className={attendance?.status==="present"?"present active":"present"} onClick={()=>onAttendance(profile.id,"present","")}>✅ Asistió</button>
        <button disabled={attendanceLocked} className={attendance?.status==="justified"?"justified active":"justified"} onClick={()=>onAttendance(profile.id,"justified",reason)}>🟡 Justificable</button>
        <button disabled={attendanceLocked} className={attendance?.status==="unjustified"?"unjustified active":"unjustified"} onClick={()=>onAttendance(profile.id,"unjustified",reason)}>🔴 No justificable</button>
      </div>

      {attendance?.status && attendance.status!=="present" && (
        <div className="reason-row">
          <input disabled={attendanceLocked} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Motivo de la inasistencia..." />
          <button disabled={attendanceLocked} className="secondary" onClick={()=>onAttendance(profile.id,attendance.status,reason)}>Guardar motivo</button>
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

function VoteDetails({
  eventId,
  votes,
  profiles,
}: {
  eventId: string;
  votes: Vote[];
  profiles: Profile[];
}) {
  const eventVotes = votes.filter(v=>v.event_id===eventId);

  if (!eventVotes.length) return <div className="notice">Todavía no hay votos cargados en esta fecha.</div>;

  return (
    <div className="vote-detail-list">
      {eventVotes.map(v=>{
        const voter=profiles.find(p=>p.id===v.voter_id);
        const target=profiles.find(p=>p.id===v.target_id);
        const score=weightedScore({
          collaboration:v.collaboration,
          cleaning:v.cleaning,
          behavior:v.behavior,
          attitude:v.attitude,
        });
        return (
          <div className="vote-detail-card" key={v.id}>
            <div className="vote-detail-title">
              <strong>{voter?.emoji} {voter?.name}</strong>
              <span>→</span>
              <strong>{target?.emoji} {target?.name}</strong>
              <span className={
                v.review_status === "pending"
                  ? "review-badge pending"
                  : v.review_status === "rejected"
                  ? "review-badge rejected"
                  : "review-badge approved"
              }>
                {v.review_status === "pending" ? "Pendiente" : v.review_status === "rejected" ? "Rechazado" : "Aprobado"}
              </span>
              <b>{v.review_status === "approved" ? score.toFixed(1) : "—"}</b>
            </div>
            <div className="vote-detail-scores">
              <span>🛒 {v.collaboration}</span>
              <span>🧹 {v.cleaning}</span>
              <span>🤝 {v.behavior}</span>
              <span>🎉 {v.attitude}</span>
            </div>
          </div>
        );
      })}
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
        <p className="muted">Cada asistente puntúa a los demás asistentes de 1 a 10. El resultado de la fecha se calcula por categoría y después se aplican los pesos.</p>
        <div className="rules-grid">
          <div className="rule-card"><span>🛒</span><div><strong>Colaboración</strong><small>Compras, organización, traer cosas, dar una mano.</small></div><b>30%</b></div>
          <div className="rule-card"><span>🧹</span><div><strong>Limpieza</strong><small>Ordenar, lavar, levantar y ayudar al final.</small></div><b>30%</b></div>
          <div className="rule-card"><span>🤝</span><div><strong>Comportamiento</strong><small>Buena onda, convivencia y respeto al grupo.</small></div><b>20%</b></div>
          <div className="rule-card"><span>🎉</span><div><strong>Actitud</strong><small>Predisposición, participación y coparse.</small></div><b>20%</b></div>
        </div>
      </section>

      <section className="card">
        <h2>🛡️ Control de votos</h2>
        <div className="rule-lines">
          <div><span>✂️</span><div><strong>Promedio recortado</strong><small>Con 5 o más votos recibidos se elimina la nota más alta y la más baja de cada categoría antes de calcular el promedio.</small></div></div>
          <div><span>⚠️</span><div><strong>Voto atípico</strong><small>Si una nota queda a más de 3 puntos del promedio de los demás, queda marcada para control.</small></div></div>
          <div><span>🔴</span><div><strong>Voto dudoso</strong><small>Si una nota se aleja más de 4 puntos del promedio del resto, o si el voto tiene un patrón extremo como todo 1 o todo 10, exige una explicación y queda pendiente de aprobación del Admin. Mientras esté pendiente no entra en el ranking.</small></div></div>
          <div><span>👑</span><div><strong>Revisión del Admin</strong><small>El Admin puede aprobar o rechazar un voto dudoso. Aprobado: computa normalmente. Rechazado: queda registrado pero no suma al puntaje.</small></div></div>
          <div><span>🙅</span><div><strong>Sin auto-voto</strong><small>Nadie puede puntuarse a sí mismo y solo los asistentes pueden votar.</small></div></div>
        </div>
      </section>

      <section className="card">
        <h2>⏰ Cierre y plazo para votar</h2>
        <div className="rule-lines">
          <div><span>🔒</span><div><strong>Cierre de la juntada</strong><small>El Admin confirma asistencias y cierra la fecha. Desde ese momento comienza el plazo de votación.</small></div></div>
          <div><span>3️⃣</span><div><strong>72 horas</strong><small>Cada asistente tiene 3 días para puntuar a todos los demás asistentes.</small></div></div>
          <div><span>🚫</span><div><strong>Quiénes pueden votar</strong><small>Solo pueden votar quienes estuvieron marcados como presentes en esa juntada. Además, únicamente pueden puntuar a otros asistentes presentes. Quien faltó no puede votar esa fecha.</small></div></div>
          <div><span>−5</span><div><strong>Votación incompleta</strong><small>Si al vencer las 72 horas no completó todos sus votos, recibe −5 puntos una sola vez por esa juntada.</small></div></div>
          <div><span>⛔</span><div><strong>Plazo vencido</strong><small>Después de las 72 horas los votos de esa fecha quedan bloqueados.</small></div></div>
        </div>
      </section>

      <section className="card">
        <h2>📅 Asistencia y sanciones</h2>
        <div className="rule-lines">
          <div><span>✅</span><div><strong>Asistió</strong><small>Puede recibir y emitir votos normalmente.</small></div></div>
          <div><span>🟡</span><div><strong>Falta justificable</strong><small>Cuenta como inasistencia para el porcentaje, pero no resta puntos.</small></div></div>
          <div><span>🔴</span><div><strong>Falta no justificable</strong><small>Cuenta como inasistencia y resta 10 puntos automáticamente.</small></div></div>
          <div><span>⚡</span><div><strong>Bonus / Malus</strong><small>Solo el Admin puede asignarlos y siempre llevan una descripción. Se acumulan durante la temporada, pero para el ranking se normalizan dividiendo el total de ajustes por la cantidad de juntadas computadas. Ejemplo: +5 y −10 en 5 juntadas = −1 punto sobre el ranking final. No modifican los promedios por categoría ni el porcentaje de asistencia.</small></div></div>
        </div>
      </section>

      <section className="card">
        <h2>🧮 Cómo sale el puntaje</h2>

        <div className="formula">
          <strong>Rendimiento de cada juntada:</strong><br />
          <strong>30%</strong> Colaboración + <strong>30%</strong> Limpieza + <strong>20%</strong> Comportamiento + <strong>20%</strong> Actitud
        </div>

        <p className="muted">Ejemplo de una fecha: 8 en Colaboración, 9 en Limpieza, 7 en Comportamiento y 10 en Actitud = <strong>85 puntos</strong>.</p>

        <div className="formula" style={{marginTop: 12}}>
          <strong>Ranking de temporada:</strong><br />
          La posición se define por el <strong>promedio general de rendimiento</strong>.
        </div>

        <div className="rule-lines" style={{marginTop: 12}}>
          <div><span>📊</span><div><strong>Promedio general</strong><small>Es el promedio de los puntajes de las juntadas donde participaste y recibiste votos válidos. Este valor define la posición en el ranking. Faltar una fecha no agrega un cero al promedio.</small></div></div>
          <div><span>🏆</span><div><strong>Orden de la tabla</strong><small>Se ordena de mayor a menor promedio general. Si dos jugadores tienen el mismo promedio, se usa primero el porcentaje de asistencia como desempate y luego los puntos ajustados.</small></div></div>
          <div><span>➕</span><div><strong>Puntos como dato adicional</strong><small>El puntaje ajustado sigue mostrando el efecto de asistencia, Bonus/Malus, faltas no justificables y penalizaciones por no votar, pero ya no determina directamente la posición en la tabla.</small></div></div>
        </div>

        <p className="muted tiny">Los puntos ajustados siguen en escala 0–100, pero son informativos. El ranking se define por el promedio general.</p>
      </section>
    </>
  );
}
