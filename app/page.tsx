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

type Season = {
  id: string;
  name: string;
  emoji: string;
  is_active: boolean;
  started_at: string | null;
  closed_at: string | null;
  created_by: string;
  final_standings: Array<{
    profile_id: string;
    name: string;
    emoji: string;
    position: number;
    performance_avg: number;
    ranking_average: number;
    attendance_pct: number;
    missed_voting_count: number;
    unjustified_absence_count: number;
    adjustment: number;
    missed_voting_penalty: number;
    unjustified_absence_penalty: number;
    scored_events: number;
  }> | null;
  awards: Record<string, { profile_id: string; name: string; emoji: string; value?: number | string }> | null;
};

type EventRow = {
  id: string;
  name: string;
  event_date: string;
  host_id: string | null;
  is_closed: boolean;
  closed_at: string | null;
  created_by: string;
  season_id: string | null;
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

const UNJUSTIFIED_AVG_PENALTY = -0.7;
const MISSED_VOTING_AVG_PENALTY = -1.0;
const VOTING_HOURS = 48;
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
  { key: "cleaning", label: "Limpieza", icon: "🧹", sub: "Orden, cuidado del espacio y limpieza durante la juntada", weight: 0.30 },
  { key: "behavior", label: "Comportamiento", icon: "🤝", sub: "Convivencia y buena onda", weight: 0.20 },
  { key: "attitude", label: "Actitud", icon: "🎉", sub: "Predisposición y participación", weight: 0.20 },
];

const ratingOptions = [
  { value: 2, label: "Muy mala", emoji: "😡" },
  { value: 4, label: "Mala", emoji: "😕" },
  { value: 6, label: "Regular", emoji: "😐" },
  { value: 8, label: "Buena", emoji: "🙂" },
  { value: 10, label: "Excelente", emoji: "🤩" },
] as const;

const defaultVote = {
  collaboration: 6,
  cleaning: 6,
  behavior: 6,
  attitude: 6,
};

function ratingMeta(value: number) {
  const exact = ratingOptions.find((option) => option.value === Number(value));
  if (exact) return exact;

  // Compatibilidad visual con votos históricos 1–10.
  return ratingOptions.reduce((closest, option) =>
    Math.abs(option.value - Number(value)) < Math.abs(closest.value - Number(value))
      ? option
      : closest
  );
}

function ratingLabel(value: number) {
  const meta = ratingMeta(value);
  return `${meta.emoji} ${meta.label}`;
}

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
  return categories.reduce((sum, c) => sum + values[c.key] * c.weight, 0);
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
  return nums.every((n) => n === 2) || nums.every((n) => n === 10);
}

function voteCountsForRanking(vote: Vote) {
  // Compatibilidad con votos históricos:
  // antes de v7 no existía review_status, así que null/undefined se considera aprobado.
  return !vote.review_status || vote.review_status === "approved";
}

export default function Home() {
  const [sessionReady, setSessionReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
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

  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [newSeasonName, setNewSeasonName] = useState("");
  const [newSeasonEmoji, setNewSeasonEmoji] = useState("🏆");

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
  const [editingVotes, setEditingVotes] = useState<Record<string, boolean>>({});
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
      { data: seasonRows },
      { data: eventRows },
      { data: attendanceRows },
      { data: adjustmentRows },
      { data: voteRows },
    ] = await Promise.all([
      supabase.from("profiles").select("*").order("name"),
      supabase.from("seasons").select("*").order("started_at", { ascending: false, nullsFirst: false }),
      supabase.from("events").select("*").order("event_date", { ascending: false }),
      supabase.from("attendance").select("*"),
      supabase.from("point_adjustments").select("*"),
      supabase.from("votes").select("*"),
    ]);

    const p = (profileRows ?? []) as Profile[];
    const s = (seasonRows ?? []) as Season[];
    const e = (eventRows ?? []) as EventRow[];
    setProfiles(p);
    setSeasons(s);
    setEvents(e);
    setAttendance((attendanceRows ?? []) as Attendance[]);
    setAdjustments((adjustmentRows ?? []) as Adjustment[]);
    setVotes((voteRows ?? []) as Vote[]);
    setMe(p.find((x) => x.id === userId) ?? null);

    const active = s.find((season) => season.is_active);
    const selectedStillExists = s.some((season) => season.id === selectedSeasonId);
    if (!selectedStillExists && active) setSelectedSeasonId(active.id);
    else if (!selectedStillExists && s.length) setSelectedSeasonId(s[0].id);

    const activeEvents = active ? e.filter((event) => event.season_id === active.id) : [];
    if (!selectedEventId || !activeEvents.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(activeEvents[0]?.id ?? "");
    }
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

  async function createSeason() {
    if (!isAdmin || !userId || !newSeasonName.trim()) return;
    const { error } = await supabase.from("seasons").insert({
      name: newSeasonName.trim(),
      emoji: newSeasonEmoji.trim() || "🏆",
      is_active: false,
      created_by: userId,
    });
    if (error) return alert(error.message);
    setNewSeasonName("");
    setNewSeasonEmoji("🏆");
    await loadAll();
  }

  async function startSeason(season: Season) {
    if (!isAdmin) return;
    const current = seasons.find((item) => item.is_active);
    if (current && current.id !== season.id) {
      return alert(`Primero cerrá ${current.emoji} ${current.name}. Así queda congelado su resultado final.`);
    }
    if (season.closed_at) return alert("Una temporada cerrada queda en el historial y no se puede reabrir.");

    const { error } = await supabase
      .from("seasons")
      .update({ is_active: true, started_at: season.started_at ?? new Date().toISOString() })
      .eq("id", season.id);
    if (error) return alert(error.message);
    setSelectedSeasonId(season.id);
    await loadAll();
  }

  function seasonAwards(eventList: EventRow[], standings: ReturnType<typeof calculateRankingForEvents>) {
    const eventIds = new Set(eventList.map((event) => event.id));
    const byAbsences = profiles.map((profile) => ({
      profile,
      count: attendance.filter((a) => eventIds.has(a.event_id) && a.profile_id === profile.id && a.status !== "present").length,
    })).sort((a, b) => b.count - a.count);

    const byMissedVotes = standings.map((row) => ({ profile: row, count: row.missedVotingCount }))
      .sort((a, b) => b.count - a.count);

    const categoryWinners = Object.fromEntries(categories.map((category) => {
      const scored = profiles.map((profile) => {
        const values = eventList
          .map((event) => eventCategoryAverages(event.id, profile.id))
          .filter((x) => x.voteCount > 0)
          .map((x) => x.values[category.key]);
        return { profile, value: values.length ? average(values) : 0 };
      }).sort((a, b) => b.value - a.value);
      const winner = scored[0];
      return [category.key, winner && winner.value > 0 ? {
        profile_id: winner.profile.id, name: winner.profile.name, emoji: winner.profile.emoji, value: Number(winner.value.toFixed(1))
      } : null];
    }));

    const champion = standings[0];
    return {
      champion: champion ? { profile_id: champion.id, name: champion.name, emoji: champion.emoji, value: Number(champion.rankingAverage.toFixed(1)) } : null,
      ghost: byAbsences[0]?.count ? { profile_id: byAbsences[0].profile.id, name: byAbsences[0].profile.name, emoji: byAbsences[0].profile.emoji, value: byAbsences[0].count } : null,
      democracy_zero: byMissedVotes[0]?.count ? { profile_id: byMissedVotes[0].profile.id, name: byMissedVotes[0].profile.name, emoji: byMissedVotes[0].profile.emoji, value: byMissedVotes[0].count } : null,
      ...categoryWinners,
    };
  }

  async function closeSeason(season: Season) {
    if (!isAdmin || !season.is_active) return;
    const openEvents = events.filter((event) => event.season_id === season.id && !event.is_closed);
    if (openEvents.length) {
      return alert("Antes de cerrar la temporada, cerrá todas sus juntadas.");
    }
    if (!confirm(`¿Cerrar ${season.emoji} ${season.name}? El resultado quedará congelado en el historial.`)) return;

    const eventList = events.filter((event) => event.season_id === season.id);
    const standings = calculateRankingForEvents(eventList);
    const finalStandings = standings.map((row, index) => ({
      profile_id: row.id,
      name: row.name,
      emoji: row.emoji,
      position: index + 1,
      performance_avg: Number(row.performanceAvg.toFixed(2)),
      ranking_average: Number(row.rankingAverage.toFixed(2)),
      attendance_pct: Number(row.attendancePct.toFixed(2)),
      missed_voting_count: row.missedVotingCount,
      unjustified_absence_count: row.unjustifiedAbsenceCount,
      adjustment: row.adjustment,
      missed_voting_penalty: Number(row.missedVotingAvgPenalty.toFixed(2)),
      unjustified_absence_penalty: Number(row.unjustifiedAbsenceAvgPenalty.toFixed(2)),
      scored_events: row.scoredEvents,
    }));

    const awards = seasonAwards(eventList, standings);
    const { error } = await supabase.from("seasons").update({
      is_active: false,
      closed_at: new Date().toISOString(),
      final_standings: finalStandings,
      awards,
    }).eq("id", season.id);
    if (error) return alert(error.message);
    await loadAll();
  }

  async function createEvent() {
    if (!isAdmin || !userId || !newEventName.trim()) return;
    const activeSeason = seasons.find((season) => season.is_active);
    if (!activeSeason) return alert("Primero iniciá una temporada.");
    const { error } = await supabase.from("events").insert({
      name: newEventName.trim(),
      event_date: newEventDate,
      host_id: newHost || null,
      created_by: userId,
      is_closed: false,
      closed_at: null,
      season_id: activeSeason.id,
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

    if (!confirm("¿Cerrar la juntada? Desde ahora empiezan las 48 horas para completar los votos.")) return;

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

    const penalty = 0;
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

  function startEditingVote(targetId: string, existing: Vote) {
    setVoteDrafts((s) => ({
      ...s,
      [targetId]: {
        collaboration: Number(existing.collaboration),
        cleaning: Number(existing.cleaning),
        behavior: Number(existing.behavior),
        attitude: Number(existing.attitude),
      },
    }));
    setVoteComments((s) => ({
      ...s,
      [targetId]: existing.review_comment ?? "",
    }));
    setEditingVotes((s) => ({ ...s, [targetId]: true }));
  }

  function cancelEditingVote(targetId: string) {
    setEditingVotes((s) => ({ ...s, [targetId]: false }));
    setVoteDrafts((s) => {
      const next = { ...s };
      delete next[targetId];
      return next;
    });
    setVoteComments((s) => {
      const next = { ...s };
      delete next[targetId];
      return next;
    });
  }

  async function saveVote(targetId: string) {
    if (!userId || !selectedEventId || targetId === userId) return;

    const event = events.find((e) => e.id === selectedEventId);
    if (!event?.is_closed || !event.closed_at) {
      return alert("La votación se habilita cuando el Admin cierra la juntada.");
    }
    if (isDeadlineExpired(event)) {
      return alert("El plazo de 48 horas ya terminó.");
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
    setEditingVotes((s) => ({ ...s, [targetId]: false }));
    setVoteDrafts((s) => {
      const next = { ...s };
      delete next[targetId];
      return next;
    });
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

  function classifyVoteDraft(
    targetId: string,
    draft: typeof defaultVote
  ): {
    level: "normal" | "atypical" | "suspicious";
    details: Array<{ label: string; value: number; peerAverage: number; diff: number }>;
    peerCount: number;
  } {
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
        } else if (diff > OUTLIER_THRESHOLD) {
          if (level === "normal") level = "atypical";
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

  const activeSeason = seasons.find((season) => season.is_active) ?? null;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) ?? activeSeason ?? seasons[0] ?? null;
  const seasonEvents = selectedSeason ? events.filter((event) => event.season_id === selectedSeason.id) : [];
  const activeSeasonEvents = activeSeason ? events.filter((event) => event.season_id === activeSeason.id) : [];

  function missedVotingStats(profileId: string, eventList: EventRow[] = seasonEvents) {
    let missedEvents = 0;

    eventList.forEach((event) => {
      if (!event.is_closed || !event.closed_at || !isDeadlineExpired(event)) return;

      const wasPresent = attendance.some(
        (a) =>
          a.event_id === event.id &&
          a.profile_id === profileId &&
          a.status === "present"
      );

      if (!wasPresent) return;

      const presentIds = attendance
        .filter((a) => a.event_id === event.id && a.status === "present")
        .map((a) => a.profile_id);

      const requiredTargets = presentIds.filter((id) => id !== profileId);

      const completedTargets = new Set(
        votes
          .filter(
            (v) =>
              v.event_id === event.id &&
              v.voter_id === profileId &&
              requiredTargets.includes(v.target_id)
          )
          .map((v) => v.target_id)
      );

      if (completedTargets.size < requiredTargets.length) {
        missedEvents += 1;
      }
    });

    return {
      missedEvents,
      averagePenalty: missedEvents * MISSED_VOTING_AVG_PENALTY,
    };
  }

  function unjustifiedAbsenceStats(profileId: string, eventList: EventRow[] = seasonEvents) {
    const eventIds = new Set(eventList.map((event) => event.id));
    const count = attendance.filter(
      (a) => eventIds.has(a.event_id) && a.profile_id === profileId && a.status === "unjustified"
    ).length;

    return {
      count,
      averagePenalty: count * UNJUSTIFIED_AVG_PENALTY,
    };
  }

  function eventCategoryAverages(eventId: string, targetId: string) {
    const targetVotes = votes.filter(
      (v) =>
        v.event_id === eventId &&
        v.target_id === targetId &&
        voteCountsForRanking(v)
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

  function calculateRankingForEvents(eventList: EventRow[]) {
    const eventIds = new Set(eventList.map((event) => event.id));
    return profiles
      .map((p) => {
        const eventScores = eventList
          .map((e) => eventFinalScore(e.id, p.id))
          .filter((x) => x.voteCount > 0);

        const performanceSum = eventScores.reduce((sum, x) => sum + x.score, 0);
        const performanceAvg = eventScores.length ? performanceSum / eventScores.length : 0;
        const attendanceRows = attendance.filter((a) => eventIds.has(a.event_id) && a.profile_id === p.id);
        const attendedCount = attendanceRows.filter((a) => a.status === "present").length;
        const attendancePct = attendanceRows.length ? (attendedCount / attendanceRows.length) * 100 : 0;
        const missedVoting = missedVotingStats(p.id, eventList);
        const unjustifiedAbsence = unjustifiedAbsenceStats(p.id, eventList);
        const adjustment = adjustments
          .filter((a) => eventIds.has(a.event_id) && a.profile_id === p.id)
          .reduce((sum, a) => sum + Number(a.points || 0), 0);
        const rankingAverage = Math.max(0, performanceAvg + missedVoting.averagePenalty + unjustifiedAbsence.averagePenalty);

        return {
          ...p, performanceAvg, rankingAverage, attendancePct, scoredEvents: eventScores.length, adjustment,
          missedVotingCount: missedVoting.missedEvents, missedVotingAvgPenalty: missedVoting.averagePenalty,
          unjustifiedAbsenceCount: unjustifiedAbsence.count, unjustifiedAbsenceAvgPenalty: unjustifiedAbsence.averagePenalty,
        };
      })
      .sort((a, b) => b.rankingAverage - a.rankingAverage || b.attendancePct - a.attendancePct || b.performanceAvg - a.performanceAvg);
  }

  const attendanceStats = useMemo(() => {
    const eventIds = new Set(seasonEvents.map((event) => event.id));
    return profiles.map((p) => {
      const rows = attendance.filter((a) => eventIds.has(a.event_id) && a.profile_id === p.id);
      const present = rows.filter((a) => a.status === "present").length;
      const justified = rows.filter((a) => a.status === "justified").length;
      const unjustified = rows.filter((a) => a.status === "unjustified").length;
      const absent = justified + unjustified;
      const total = rows.length;
      return { ...p, present, justified, unjustified, absent, total, pct: total ? (present / total) * 100 : 0, absentPct: total ? (absent / total) * 100 : 0 };
    });
  }, [profiles, attendance, selectedSeasonId, events]);

  const ranking = useMemo(() => {
    if (selectedSeason?.closed_at && selectedSeason.final_standings?.length) {
      return selectedSeason.final_standings
        .map((row) => ({
          id: row.profile_id,
          name: row.name,
          emoji: row.emoji,
          title: profiles.find((p) => p.id === row.profile_id)?.title ?? "",
          role: profiles.find((p) => p.id === row.profile_id)?.role ?? "user" as Role,
          performanceAvg: Number(row.performance_avg),
          rankingAverage: Number(row.ranking_average),
          attendancePct: Number(row.attendance_pct),
          scoredEvents: Number(row.scored_events ?? 0),
          adjustment: Number(row.adjustment ?? 0),
          missedVotingCount: Number(row.missed_voting_count ?? 0),
          missedVotingAvgPenalty: Number(row.missed_voting_penalty ?? 0),
          unjustifiedAbsenceCount: Number(row.unjustified_absence_count ?? 0),
          unjustifiedAbsenceAvgPenalty: Number(row.unjustified_absence_penalty ?? 0),
        }))
        .sort((a, b) => b.rankingAverage - a.rankingAverage);
    }
    return calculateRankingForEvents(seasonEvents);
  }, [profiles, votes, attendance, adjustments, events, selectedSeasonId, seasons]);

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
    return seasonEvents
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
  }, [events, selectedSeasonId, now]);

  const rankingLockedForMe = useMemo(() => {
    if (isAdmin || !userId) {
      return { locked: false, events: [] as EventRow[] };
    }

    const blockingEvents = seasonEvents.filter((event) => {
      if (!event.is_closed || !event.closed_at) return false;
      if (isDeadlineExpired(event)) return false;

      const myAttendance = attendance.find(
        (a) => a.event_id === event.id && a.profile_id === userId
      );

      if (myAttendance?.status !== "present") return false;

      const presentIds = attendance
        .filter((a) => a.event_id === event.id && a.status === "present")
        .map((a) => a.profile_id);

      const requiredTargets = presentIds.filter((id) => id !== userId);

      const completedTargets = new Set(
        votes
          .filter(
            (v) =>
              v.event_id === event.id &&
              v.voter_id === userId &&
              requiredTargets.includes(v.target_id)
          )
          .map((v) => v.target_id)
      );

      return completedTargets.size < requiredTargets.length;
    });

    return {
      locked: blockingEvents.length > 0,
      events: blockingEvents,
    };
  }, [isAdmin, userId, events, selectedSeasonId, attendance, votes, now]);

  const pendingVotingByEvent = useMemo(() => {
    return seasonEvents
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
  }, [events, selectedSeasonId, attendance, votes, profiles]);

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

  const currentEvent = activeSeasonEvents.find((e) => e.id === selectedEventId);
  const sortedAttendance = [...attendanceStats].sort((a,b) => b.pct - a.pct || b.present - a.present);
  const sortedAbsences = [...attendanceStats].sort((a,b) => b.absentPct - a.absentPct || b.unjustified - a.unjustified);
  const boozeLeader = sortedAbsences[0];
  const myProgress = currentEvent && userId ? votingProgress(currentEvent.id, userId) : null;
  const currentDeadline = currentEvent ? deadlineFor(currentEvent) : null;

  const bonusMalusHistory = adjustments
    .map((a) => {
      const profile = profiles.find((p) => p.id === a.profile_id);
      const event = events.find((e) => e.id === a.event_id);
      const season = seasons.find((s) => s.id === event?.season_id);

      return {
        ...a,
        profileName: profile?.name ?? "Jugador",
        profileEmoji: profile?.emoji ?? "👤",
        eventName: event?.name ?? "Sin juntada",
        eventDate: event?.date ?? null,
        seasonId: season?.id ?? null,
        seasonName: season ? `${season.emoji} ${season.name}` : "Sin temporada",
      };
    })
    .filter((a) => bonusHistoryProfileFilter === "all" || a.profile_id === bonusHistoryProfileFilter)
    .filter((a) => bonusHistorySeasonFilter === "all" || a.seasonId === bonusHistorySeasonFilter)
    .sort((a, b) => {
      const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bd - ad;
    });


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
          <section className="card season-selector-card">
            <div className="section-head">
              <div>
                <h2>{selectedSeason ? `${selectedSeason.emoji} ${selectedSeason.name}` : "🏆 Temporada"}</h2>
                <p className="muted">El ranking abre por defecto en la temporada actual. Podés consultar cualquier temporada anterior.</p>
              </div>
              <select value={selectedSeason?.id ?? ""} onChange={(e) => setSelectedSeasonId(e.target.value)}>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.emoji} {season.name}{season.is_active ? " · ACTUAL" : season.closed_at ? " · CERRADA" : " · SIN INICIAR"}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="hero">
            <div className="card">
              <div className="eyebrow">Líder actual</div>
              <div className="metric">{ranking[0] ? `${ranking[0].emoji} ${ranking[0].name}` : "—"}</div>
              <div className="muted">{ranking[0] ? `${ranking[0].rankingAverage.toFixed(1)} promedio ranking` : "Todavía no hay puntos"}</div>
            </div>
            <div className="card">
              <div className="eyebrow">Juntadas</div>
              <div className="metric">{seasonEvents.length}</div>
              <div className="muted">cargadas en {selectedSeason?.name ?? "la temporada"}</div>
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
                            {expired && <span className="penalty-chip">−1,0 prom.</span>}
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
            <h2>🏆 Tabla · {selectedSeason?.emoji} {selectedSeason?.name}</h2>

            {rankingLockedForMe.locked ? (
              <div className="ranking-locked">
                <div className="ranking-lock-icon">🔒</div>
                <h3>Completá tus votos para ver el ranking actualizado</h3>
                <p>
                  Para evitar que los resultados condicionen la votación, los promedios y puntos
                  quedan ocultos hasta que completes todos los votos que te corresponden.
                </p>

                <div className="ranking-lock-events">
                  {rankingLockedForMe.events.map((event) => {
                    const presentIds = attendance
                      .filter((a) => a.event_id === event.id && a.status === "present")
                      .map((a) => a.profile_id);

                    const requiredTargets = presentIds.filter((id) => id !== userId);
                    const completedTargets = new Set(
                      votes
                        .filter(
                          (v) =>
                            v.event_id === event.id &&
                            v.voter_id === userId &&
                            requiredTargets.includes(v.target_id)
                        )
                        .map((v) => v.target_id)
                    );
                    const missing = Math.max(requiredTargets.length - completedTargets.size, 0);

                    return (
                      <div className="ranking-lock-event" key={event.id}>
                        <div>
                          <strong>🗳️ {event.name}</strong>
                          <small>
                            Te {missing === 1 ? "falta" : "faltan"} {missing} {missing === 1 ? "voto" : "votos"}
                          </small>
                        </div>
                        <span>Pendiente</span>
                      </div>
                    );
                  })}
                </div>

                <div className="ranking-lock-note">
                  👑 El Admin puede ver el ranking en todo momento.
                </div>
              </div>
            ) : (
              ranking.map((r, i) => (
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

                    <div className="ranking-penalties">
                      <span className={`penalty-detail ${r.missedVotingCount === 0 ? "neutral" : ""}`}>
                        🗳️ No votar: <strong>{r.missedVotingAvgPenalty.toFixed(1)}</strong>
                        {" "}({r.missedVotingCount})
                      </span>

                      <span className={`penalty-detail ${r.unjustifiedAbsenceCount === 0 ? "neutral" : ""}`}>
                        🔴 No justificables: <strong>{r.unjustifiedAbsenceAvgPenalty.toFixed(1)}</strong>
                        {" "}({r.unjustifiedAbsenceCount})
                      </span>

                      <span className="penalty-detail bonus">
                        ⚡ Bonus/Malus: <strong>{r.adjustment >= 0 ? "+" : ""}{r.adjustment}</strong>
                      </span>
                    </div>

                    <div className="muted tiny ranking-formula-line">
                      🏆 Promedio ranking: {r.performanceAvg.toFixed(1)}
                      {r.missedVotingAvgPenalty !== 0 && <> {r.missedVotingAvgPenalty.toFixed(1)}</>}
                      {r.unjustifiedAbsenceAvgPenalty !== 0 && <> {r.unjustifiedAbsenceAvgPenalty.toFixed(1)}</>}
                      {" = "}<strong>{r.rankingAverage.toFixed(1)}</strong>
                    </div>
                  </div>
                  <div className="points">
                    <strong>{r.rankingAverage.toFixed(1)}</strong>
                    <small>ranking</small>
                  </div>
                </div>
              ))
            )}
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
              {boozeLeader && seasonEvents.length > 0 && (
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
              <p className="muted">La votación se habilita al cerrar la juntada y queda abierta durante 48 horas.</p>
            </div>
            <select value={selectedEventId} onChange={(e)=>setSelectedEventId(e.target.value)}>
              {activeSeasonEvents.map(e=><option key={e.id} value={e.id}>{formatDate(e.event_date)} · {e.name}</option>)}
            </select>
          </div>

          {!activeSeason && <div className="notice">No hay una temporada activa. El Admin debe iniciar una para cargar y votar juntadas.</div>}
          {activeSeason && !currentEvent && <div className="notice">Todavía no hay juntadas creadas en {activeSeason.emoji} {activeSeason.name}.</div>}

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
                const isEditing = !!editingVotes[p.id];
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

                    {existing && (
                      <div className="saved-vote-summary">
                        <div className="saved-vote-summary-head">
                          <div className="saved-vote-summary-title">Tu voto guardado</div>
                          {!disabled && !isEditing && (
                            <button
                              type="button"
                              className="edit-vote-btn"
                              onClick={() => startEditingVote(p.id, existing)}
                            >
                              ✏️ Editar voto
                            </button>
                          )}
                        </div>
                        <div className="saved-vote-grid">
                          {categories.map((c) => (
                            <div className="saved-vote-item" key={c.key}>
                              <span>{c.icon} {c.label}</span>
                              <strong>{ratingLabel(Number(existing[c.key]))}</strong>
                            </div>
                          ))}
                        </div>
                        {isDeadlineExpired(currentEvent) && (
                          <div className="tiny locked-vote-note">🔒 El plazo terminó. Este voto ya no se puede editar.</div>
                        )}
                      </div>
                    )}

                    {voterAbsent ? (
                      <div className="absence-label">🚫 No podés votar porque no estuviste presente en esta juntada.</div>
                    ) : absent ? (
                      <div className="absence-label">🚫 No podés votar a esta persona porque no asistió a esta juntada.</div>
                    ) : !currentEvent.is_closed ? (
                      <div className="notice">Esperando que el Admin cierre la juntada.</div>
                    ) : isDeadlineExpired(currentEvent) ? (
                      <div className="absence-label">⛔ Plazo de votación vencido.</div>
                    ) : existing && !isEditing ? (
                      <div className="notice vote-saved-readonly">
                        ✅ Voto guardado. Podés editarlo mientras siga abierta la votación.
                      </div>
                    ) : (
                      <>
                        <div className="category-list">
                          {categories.map(c=>(
                            <div className="category" key={c.key}>
                              <div className="cat-icon">{c.icon}</div>
                              <div className="grow"><strong>{c.label}</strong><small>{c.sub} · {(c.weight*100).toFixed(0)}%</small></div>
                              <div className="rating-choice-group">
                                {ratingOptions.map((option) => {
                                  const selected = ratingMeta(Number((draft as any)[c.key])).value === option.value;
                                  return (
                                    <button
                                      type="button"
                                      key={option.value}
                                      className={`rating-choice ${selected ? "selected" : ""}`}
                                      onClick={() =>
                                        setVoteDrafts((s) => ({
                                          ...s,
                                          [p.id]: { ...draft, [c.key]: option.value },
                                        }))
                                      }
                                      aria-pressed={selected}
                                    >
                                      <span className="rating-emoji">{option.emoji}</span>
                                      <span>{option.label}</span>
                                    </button>
                                  );
                                })}
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
                                    {d.label}: pusiste <b>{ratingLabel(d.value)}</b> · promedio del resto <b>{d.peerAverage.toFixed(1)}</b>
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

                        <div className="vote-edit-actions">
                          <button className="primary" onClick={()=>saveVote(p.id)}>
                            {existing ? `Guardar cambios de ${p.name}` : `Guardar puntaje de ${p.name}`}
                          </button>
                          {existing && isEditing && (
                            <button className="secondary" type="button" onClick={()=>cancelEditingVote(p.id)}>
                              Cancelar
                            </button>
                          )}
                        </div>
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
            <div className="section-head">
              <div>
                <h2>🏁 Temporadas</h2>
                <p className="muted">Las temporadas se crean e inician manualmente. Solo puede haber una activa. Al cerrarla se congela su tabla final y pasa al historial.</p>
              </div>
              {activeSeason && <span className="season-active-badge">🟢 {activeSeason.emoji} {activeSeason.name}</span>}
            </div>

            <div className="season-create-grid">
              <div><label>Emoji</label><input value={newSeasonEmoji} onChange={(e)=>setNewSeasonEmoji(e.target.value)} maxLength={4} placeholder="❄️" /></div>
              <div><label>Nombre de temporada</label><input value={newSeasonName} onChange={(e)=>setNewSeasonName(e.target.value)} placeholder="Ej: Invierno '26" /></div>
              <button className="primary" onClick={createSeason}>Crear temporada</button>
            </div>

            <div className="season-admin-list">
              {seasons.map((season) => (
                <div className={`season-admin-row ${season.is_active ? "active" : ""}`} key={season.id}>
                  <div>
                    <strong>{season.emoji} {season.name}</strong>
                    <small>
                      {season.is_active ? "🟢 Temporada actual" : season.closed_at ? `🏁 Cerrada ${formatDateTime(season.closed_at)}` : "⚪ Todavía no iniciada"}
                    </small>
                  </div>
                  <div className="event-admin-actions">
                    {!season.is_active && !season.closed_at && <button className="primary" onClick={()=>startSeason(season)}>▶️ Iniciar</button>}
                    {season.is_active && <button className="close-event-btn" onClick={()=>closeSeason(season)}>🏁 Cerrar temporada</button>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>👑 Crear juntada</h2>
            <p className="muted">{activeSeason ? `Se cargará en ${activeSeason.emoji} ${activeSeason.name}.` : "Primero iniciá una temporada."}</p>
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
              {activeSeasonEvents.length === 0 && <div className="notice">Todavía no hay juntadas creadas en la temporada activa.</div>}

              {activeSeasonEvents.map((e) => {
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
                <p className="muted">Marcá la asistencia de todos. Al cerrar la fecha empieza el plazo de 48 horas.</p>
              </div>
              <select value={selectedEventId} onChange={(e)=>setSelectedEventId(e.target.value)}>
                {activeSeasonEvents.map(e=><option key={e.id} value={e.id}>{formatDate(e.event_date)} · {e.name}</option>)}
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
                  <button className="close-event-btn" onClick={()=>closeEvent(currentEvent.id)}>🔒 Cerrar juntada e iniciar 48 h</button>
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
                          <span>🛒 {ratingLabel(v.collaboration)}</span>
                          <span>🧹 {ratingLabel(v.cleaning)}</span>
                          <span>🤝 {ratingLabel(v.behavior)}</span>
                          <span>🎉 {ratingLabel(v.attitude)}</span>
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
          <div className="section-head">
            <div>
              <h2>🏛️ Historial de temporadas</h2>
              <p className="muted">Las temporadas cerradas conservan la tabla final y sus premios tal como terminaron.</p>
            </div>
          </div>

          <div className="season-history-list">
            {seasons.map((season) => {
              const standings = season.final_standings ?? [];
              const awards = season.awards ?? {};
              const seasonEventCount = events.filter((event) => event.season_id === season.id).length;
              return (
                <div className={`season-history-card ${season.is_active ? "active" : ""}`} key={season.id}>
                  <div className="season-history-head">
                    <div>
                      <h3>{season.emoji} {season.name}</h3>
                      <small>
                        {season.is_active ? "🟢 Temporada actual" : season.closed_at ? `🏁 Cerrada ${formatDateTime(season.closed_at)}` : "⚪ Sin iniciar"}
                        {` · ${seasonEventCount} juntadas`}
                      </small>
                    </div>
                    {season.is_active && <span className="season-active-badge">EN JUEGO</span>}
                  </div>

                  {season.closed_at && standings.length > 0 ? (
                    <>
                      <div className="season-podium">
                        {standings.slice(0, 3).map((row) => (
                          <div className="season-podium-row" key={row.profile_id}>
                            <span>{row.position === 1 ? "🥇" : row.position === 2 ? "🥈" : "🥉"}</span>
                            <strong>{row.emoji} {row.name}</strong>
                            <span>{row.ranking_average.toFixed(1)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="season-awards">
                        {awards.champion && <span>🏆 Campeón: <strong>{awards.champion.emoji} {awards.champion.name}</strong></span>}
                        {awards.ghost && <span>👻 El Fantasma: <strong>{awards.ghost.emoji} {awards.ghost.name}</strong></span>}
                        {awards.democracy_zero && <span>🗳️ Democracia Cero: <strong>{awards.democracy_zero.emoji} {awards.democracy_zero.name}</strong></span>}
                        {awards.cleaning && <span>🧼 Don Limpieza: <strong>{awards.cleaning.emoji} {awards.cleaning.name}</strong></span>}
                        {awards.collaboration && <span>🛒 El Abastecedor: <strong>{awards.collaboration.emoji} {awards.collaboration.name}</strong></span>}
                        {awards.behavior && <span>🤝 Señor Convivencia: <strong>{awards.behavior.emoji} {awards.behavior.name}</strong></span>}
                        {awards.attitude && <span>🎉 Alma de la Juntada: <strong>{awards.attitude.emoji} {awards.attitude.name}</strong></span>}
                      </div>

                      <details className="season-full-table">
                        <summary>Ver tabla final completa</summary>
                        {standings.map((row) => (
                          <div className="mini-row" key={row.profile_id}>
                            <span>#{row.position}</span>
                            <span className="grow">{row.emoji} <strong>{row.name}</strong><small>Prom. general {row.performance_avg.toFixed(1)} · Asistencia {row.attendance_pct.toFixed(0)}%</small></span>
                            <strong>{row.ranking_average.toFixed(1)}</strong>
                          </div>
                        ))}
                      </details>
                    </>
                  ) : season.is_active ? (
                    <div className="notice">Temporada en curso. El resultado final se congela cuando el Admin la cierre.</div>
                  ) : (
                    <div className="notice">Esta temporada todavía no fue iniciada.</div>
                  )}
                </div>
              );
            })}
          </div>
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
          {attendance.status==="unjustified" && <span className="penalty-chip">−0,7 prom. obligatorio</span>}
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
              <b>{voteCountsForRanking(v) ? score.toFixed(1) : "—"}</b>
            </div>
            <div className="vote-detail-scores">
              <span>🛒 {ratingLabel(v.collaboration)}</span>
              <span>🧹 {ratingLabel(v.cleaning)}</span>
              <span>🤝 {ratingLabel(v.behavior)}</span>
              <span>🎉 {ratingLabel(v.attitude)}</span>
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
          <div><span>🎚️</span><div><strong>Escala de votación</strong><small>En cada categoría elegís una de cinco opciones: 😡 Muy mala = 2, 😕 Mala = 4, 😐 Regular = 6, 🙂 Buena = 8 y 🤩 Excelente = 10. Los números se usan internamente para calcular promedios y ranking.</small></div></div>
          <div><span>⚠️</span><div><strong>Voto atípico</strong><small>Si una nota queda a más de 3 puntos del promedio de los demás, queda marcada para control.</small></div></div>
          <div><span>🔴</span><div><strong>Voto dudoso</strong><small>Si una nota se aleja más de 4 puntos del promedio del resto, o si el voto tiene un patrón extremo como “Muy mala” en todo o “Excelente” en todo, exige una explicación y queda pendiente de aprobación del Admin. Mientras esté pendiente no entra en el ranking.</small></div></div>
          <div><span>👑</span><div><strong>Revisión del Admin</strong><small>El Admin puede aprobar o rechazar un voto dudoso. Aprobado: computa normalmente. Rechazado: queda registrado pero no suma al puntaje.</small></div></div>
          <div><span>🙅</span><div><strong>Sin auto-voto</strong><small>Nadie puede puntuarse a sí mismo y solo los asistentes pueden votar.</small></div></div>
        </div>
      </section>

      <section className="card">
        <h2>⏰ Cierre y plazo para votar</h2>
        <div className="rule-lines">
          <div><span>🔒</span><div><strong>Cierre de la juntada</strong><small>El Admin confirma asistencias y cierra la fecha. Desde ese momento comienza el plazo de votación.</small></div></div>
          <div><span>2️⃣</span><div><strong>48 horas</strong><small>Cada asistente tiene 2 días para puntuar a todos los demás asistentes.</small></div></div>
          <div><span>🚫</span><div><strong>Quiénes pueden votar</strong><small>Solo pueden votar quienes estuvieron marcados como presentes en esa juntada. Además, únicamente pueden puntuar a otros asistentes presentes. Quien faltó no puede votar esa fecha.</small></div></div>
          <div><span>−5</span><div><strong>Votación incompleta (−1,0 al promedio)</strong><small>Si al vencer las 48 horas no completó todos sus votos, recibe −5 puntos una sola vez por esa juntada.</small></div></div>
          <div><span>⛔</span><div><strong>Plazo vencido</strong><small>Después de las 48 horas los votos de esa fecha quedan bloqueados.</small></div></div>
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
        <div className="section-head">
          <div>
            <h2>⚡ Registro de Bonus / Malus</h2>
            <p className="muted">
              Historial completo de ajustes manuales. Podés filtrar por jugador y temporada para ver
              quién recibió cada Bonus/Malus, el valor asignado y el motivo.
            </p>
          </div>
        </div>

        <div className="bonus-history-filters">
          <label>
            Jugador
            <select
              value={bonusHistoryProfileFilter}
              onChange={(e) => setBonusHistoryProfileFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji} {p.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Temporada
            <select
              value={bonusHistorySeasonFilter}
              onChange={(e) => setBonusHistorySeasonFilter(e.target.value)}
            >
              <option value="all">Todas</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.emoji} {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {bonusMalusHistory.length === 0 ? (
          <div className="empty-state">
            Todavía no hay Bonus/Malus para los filtros seleccionados.
          </div>
        ) : (
          <div className="bonus-history-list">
            {bonusMalusHistory.map((item) => (
              <div className="bonus-history-row" key={item.id}>
                <div className="bonus-history-main">
                  <div className="bonus-history-user">
                    <span className="bonus-history-avatar">{item.profileEmoji}</span>
                    <div>
                      <strong>{item.profileName}</strong>
                      <small>
                        {item.seasonName}
                        {item.eventName ? ` · ${item.eventName}` : ""}
                      </small>
                    </div>
                  </div>

                  <div
                    className={`bonus-history-points ${
                      Number(item.points) >= 0 ? "positive" : "negative"
                    }`}
                  >
                    {Number(item.points) >= 0 ? "+" : ""}
                    {Number(item.points)}
                  </div>
                </div>

                <div className="bonus-history-reason">
                  {item.description || "Sin descripción"}
                </div>

                <div className="bonus-history-meta muted tiny">
                  {item.eventDate
                    ? new Date(`${item.eventDate}T12:00:00`).toLocaleDateString("es-AR")
                    : "Sin fecha"}
                  {item.created_at && (
                    <>
                      {" · cargado "}
                      {new Date(item.created_at).toLocaleString("es-AR")}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>📜 Reglamento completo</h2>
        <p className="muted">
          Estas son las reglas que usa la Liga de Juntadas para asistencia, votaciones, ranking y sanciones.
        </p>

        
        <div className="metric-explainer">
          <h3>📌 Qué significa cada número</h3>
          <div className="metric-explainer-grid">
            <div>
              <strong>Promedio general</strong>
              <small>
                Es el promedio puro de rendimiento obtenido a partir de las cuatro categorías:
                Colaboración, Limpieza, Comportamiento y Actitud. No incluye sanciones.
              </small>
            </div>
            <div>
              <strong>Promedio de ranking</strong>
              <small>
                Es el Promedio general menos las sanciones directas por no votar y por faltas no justificables.
                Este es el valor que define la posición en la tabla.
              </small>
            </div>
            <div>
              <strong>Puntos ajustados</strong>
              <small>
                Son un dato adicional para mostrar otros efectos de la temporada, como Bonus/Malus y ajustes.
                No ordenan el ranking principal.
              </small>
            </div>
          </div>
        </div>

<div className="rule-lines">
          <div>
            <span>🎚️</span>
            <div>
              <strong>Escala de votación</strong>
              <small>
                Cada categoría se vota con cinco opciones: 😡 Muy mala = 2, 😕 Mala = 4,
                😐 Regular = 6, 🙂 Buena = 8 y 🤩 Excelente = 10. Los números se usan internamente
                para hacer los cálculos.
              </small>
            </div>
          </div>

          <div>
            <span>🛒</span>
            <div>
              <strong>Categorías y pesos</strong>
              <small>
                Colaboración 30%, Limpieza 30%, Comportamiento 20% y Actitud 20%.
                El puntaje de cada juntada sale de esa combinación ponderada.
              </small>
            </div>
          </div>

          <div>
            <span>📊</span>
            <div>
            <span>🏁</span>
            <div>
              <strong>Promedio de ranking</strong>
              <small>
                Es el promedio bruto menos 1,0 por cada juntada en la que no completaste los votos dentro de 48 horas
                y menos 0,7 por cada ausencia no justificable. Ese valor define la posición en la tabla.
              </small>
            </div>
          </div>

          <div>
              <strong>Promedio general</strong>
              <small>
                El ranking principal se ordena por el promedio general de rendimiento de las juntadas
                donde el jugador recibió votos válidos. Faltar una fecha no agrega un cero al promedio.
              </small>
            </div>
          </div>

          <div>
            <span>🔒</span>
            <div>
              <strong>Visibilidad del ranking</strong>
              <small>
                Para evitar que los resultados condicionen los votos, un usuario presente con votos
                pendientes no puede ver las actualizaciones de promedios ni puntajes. El ranking se
                desbloquea automáticamente cuando completa todos sus votos obligatorios de las
                juntadas cuya votación siga abierta. El Admin siempre puede verlo.
              </small>
            </div>
          </div>

          <div>
            <span>🏆</span>
            <div>
              <strong>Orden del ranking</strong>
              <small>
                Se ordena de mayor a menor promedio general. Si hay empate, primero se usa el porcentaje
                de asistencia y luego los puntos ajustados como desempate.
              </small>
            </div>
          </div>

          <div>
            <span>➕</span>
            <div>
              <strong>Puntos ajustados</strong>
              <small>
                Los puntos ajustados son un dato adicional. Reflejan asistencia, Bonus/Malus,
                faltas no justificables y penalizaciones por no votar, pero no determinan
                directamente la posición principal.
              </small>
            </div>
          </div>

          <div>
            <span>✅</span>
            <div>
              <strong>Asistencia</strong>
              <small>
                Cada persona queda marcada como Presente, Justificable o No justificable.
                El porcentaje de asistencia se calcula sobre las juntadas donde ya tiene estado cargado.
              </small>
            </div>
          </div>

          <div>
            <span>🟡</span>
            <div>
              <strong>Ausencia justificable</strong>
              <small>
                Cuenta como ausencia para el porcentaje de asistencia, pero no descuenta puntos.
              </small>
            </div>
          </div>

          <div>
            <span>🔴</span>
            <div>
              <strong>Ausencia no justificable (−0,7 al promedio)</strong>
              <small>
                Cuenta como ausencia y aplica una penalización severa de −0,7 puntos directos sobre el promedio de ranking por cada ausencia no justificable.
              </small>
            </div>
          </div>

          <div>
            <span>🚫</span>
            <div>
              <strong>Quiénes pueden votar</strong>
              <small>
                Solo pueden votar quienes estuvieron presentes en esa juntada y únicamente pueden
                puntuar a otros asistentes presentes. Nadie puede votarse a sí mismo.
              </small>
            </div>
          </div>

          <div>
            <span>⏳</span>
            <div>
              <strong>Plazo de votación</strong>
              <small>
                Una vez que el Admin cierra la juntada, se habilita una ventana de 48 horas para votar.
                En el inicio del ranking aparece un timer por cada juntada con votación abierta.
              </small>
            </div>
          </div>

          <div>
            <span>−5</span>
            <div>
              <strong>Votación incompleta (−1,0 al promedio)</strong>
              <small>
                Si un asistente no completa todos los votos obligatorios dentro de las 48 horas,
                recibe una penalización severa de −1,0 punto directo sobre su promedio de ranking por cada juntada incumplida.
              </small>
            </div>
          </div>

          <div>
            <span>🗳️</span>
            <div>
              <strong>Votaciones pendientes</strong>
              <small>
                En el inicio del ranking se muestra quién falta votar, en qué juntada y cuántos votos
                le faltan. Si el plazo venció, también se indica la penalización.
              </small>
            </div>
          </div>

          <div>
            <span>✏️</span>
            <div>
              <strong>Edición de votos</strong>
              <small>
                Un voto ya guardado puede editarse todas las veces que sea necesario mientras siga abierta
                la ventana de 48 horas. Al vencer el plazo queda bloqueado y pasa a ser solo de lectura.
              </small>
            </div>
          </div>

          <div>
            <span>⚠️</span>
            <div>
              <strong>Voto atípico</strong>
              <small>
                Si una nota se aleja más de 3 puntos del promedio del resto, queda marcada para control
                del Admin, aunque puede guardarse.
              </small>
            </div>
          </div>

          <div>
            <span>🔴</span>
            <div>
              <strong>Voto dudoso</strong>
              <small>
                Si una nota se aleja más de 4 puntos del promedio del resto, con suficientes votos
                comparables, o si el voto tiene un patrón extremo como “Muy mala” en todo o
                “Excelente” en todo, exige explicación y queda pendiente de aprobación.
              </small>
            </div>
          </div>

          <div>
            <span>👑</span>
            <div>
              <strong>Revisión del Admin</strong>
              <small>
                Un voto dudoso pendiente no entra en el ranking. El Admin puede aprobarlo o rechazarlo.
                Si se aprueba, computa normalmente. Si se rechaza, queda registrado pero no suma.
              </small>
            </div>
          </div>

          <div>
            <span>✂️</span>
            <div>
              <strong>Promedio recortado</strong>
              <small>
                Cuando hay 5 o más votos válidos para una categoría de una persona en una juntada,
                se elimina un valor mínimo y un valor máximo antes de calcular el promedio.
                Esto reduce el efecto de votos extremos.
              </small>
            </div>
          </div>

          <div>
            <span>⚡</span>
            <div>
              <strong>Bonus / Malus</strong>
              <small>
                Solo el Admin puede asignarlos y siempre llevan una descripción. Se acumulan durante
                la temporada y forman parte de los puntos ajustados. No cambian el promedio general,
                los promedios de categorías ni el porcentaje de asistencia.
              </small>
            </div>
          </div>

          <div>
            <span>🕘</span>
            <div>
              <strong>Votos históricos</strong>
              <small>
                Los votos anteriores al sistema de revisión siguen siendo válidos y se consideran
                aprobados. Si tenían valores numéricos 1–10, se muestran con la descripción más cercana
                sin modificar su valor original.
              </small>
            </div>
          </div>

          <div>
            <span>🔒</span>
            <div>
              <strong>Cierre de juntada</strong>
              <small>
                El Admin puede cerrar una juntada únicamente cuando la asistencia de todos ya fue cargada.
                Una juntada cerrada no se puede editar desde la interfaz mientras la votación está en curso.
              </small>
            </div>
          </div>
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
