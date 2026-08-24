"use client";

import { useEffect, useMemo, useState } from "react";

type User = { id: string; name: string; email: string; role: "PATIENT" | "DOCTOR" | "ADMIN"; doctor?: any };

type Recommendation = { doctorId: string; doctorName: string; specialisation: string; start: string; end: string; score: number; reasons: string[] };

type Appointment = any;

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => d.user ? setUser(d.user) : (location.href = "/"));
  }, []);
  if (!user) return <main className="shell"><div className="card">Loading CareFlow...</div></main>;
  return <main className="shell"><Header user={user} />{user.role === "PATIENT" ? <PatientPortal /> : user.role === "DOCTOR" ? <DoctorPortal /> : <AdminPortal />}</main>;
}

function Header({ user }: { user: User }) {
  return <div className="topbar"><div><div className="brand">Care<span>Flow</span></div><span className="muted small">Care coordination</span></div><div className="nav"><span className="muted">{user.name} · {user.role}</span><button className="btn danger" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); location.href = "/"; }}>Logout</button></div></div>;
}

function PatientPortal() {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [spec, setSpec] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [preference, setPreference] = useState("morning");
  const [slots, setSlots] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [slot, setSlot] = useState<any>(null);
  const [symptoms, setSymptoms] = useState("");
  const [message, setMessage] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [busy, setBusy] = useState(false);

  const loadAppointments = async () => { const d = await fetch("/api/appointments").then((r) => r.json()); setAppointments(d.appointments || []); };
  useEffect(() => { loadAppointments(); }, []);

  const search = async () => {
    const d = await fetch(`/api/doctors?specialisation=${encodeURIComponent(spec)}`).then((r) => r.json());
    setDoctors(d.doctors || []);
    setRecommendations([]);
  };

  const loadSlots = async () => {
    if (!selected) return;
    const d = await fetch(`/api/doctors/${selected.id}/slots?date=${date}`).then((r) => r.json());
    setSlots(d.slots || []);
    setSlot(null);
  };

  const findBest = async () => {
    setBusy(true); setMessage("Checking available appointments...");
    const q = new URLSearchParams({ date, preference, days: "7", limit: "5" });
    if (selected) q.set("doctorId", selected.id); else if (spec) q.set("specialisation", spec);
    const d = await fetch(`/api/recommendations/slots?${q}`).then((r) => r.json());
    setRecommendations(d.recommendations || []); setMessage((d.recommendations || []).length ? "Best matching appointments are shown below." : "No matching slots found. Try another date or preference."); setBusy(false);
  };

  const chooseRecommendation = (r: Recommendation) => {
    const doctor = doctors.find((d) => d.id === r.doctorId);
    setSelected(doctor || { id: r.doctorId, user: { name: r.doctorName }, specialisation: r.specialisation });
    setDate(r.start.slice(0, 10));
    setSlot({ start: r.start, end: r.end });
    setMessage("Best-match slot selected. Add symptoms and confirm.");
  };

  async function book() {
    if (!selected || !slot || !symptoms.trim()) return setMessage("Symptoms are required before confirmation.");
    setBusy(true); setMessage("Creating a temporary slot hold and preparing the visit summary...");
    const r = await fetch("/api/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doctorId: selected.id, startTime: slot.start, symptoms }) });
    const d = await r.json();
    if (!r.ok) { setMessage(d.error); setBusy(false); return; }
    const c = await fetch(`/api/appointments/${d.appointmentId}/confirm`, { method: "POST" });
    const cd = await c.json();
    setMessage(c.ok ? `Appointment confirmed. Visit summary: ${d.preVisit.urgency} priority. Calendar and notification jobs queued.` : cd.error);
    setSymptoms(""); setBusy(false); await loadAppointments();
  }

  return <>
    <div className="topbar"><div><span className="badge">PATIENT PORTAL</span><h1 className="portalTitle">Plan your care</h1></div><button className="btn secondary" onClick={() => location.href = "/api/google/calendar/connect"}>Connect Google Calendar</button></div>

    <section className="card" style={{ marginBottom: 18 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><div><h2 className="sectionTitle">Find an appointment</h2><p className="muted small">We compare available appointments using your preferred time and earliest availability.</p></div><span className="badge">Recommended</span></div>
      <div className="grid" style={{ marginTop: 10 }}>
        <div><label>Specialisation</label><input placeholder="e.g. Cardiology" value={spec} onChange={(e) => setSpec(e.target.value)} /></div>
        <div><label>Starting date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label>Preferred time</label><select value={preference} onChange={(e) => setPreference(e.target.value)}><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option><option value="any">Any time</option></select></div>
      </div>
      <div className="row" style={{ marginTop: 12 }}><button className="btn secondary" onClick={search}>Search doctors</button><button className="btn" onClick={findBest} disabled={busy}>Find my best slot</button></div>
      {recommendations.length > 0 && <div className="grid" style={{ marginTop: 14 }}>{recommendations.map((r) => <div className="appointment recommendation" key={`${r.doctorId}-${r.start}`}><div className="row" style={{ justifyContent: "space-between" }}><b>{r.doctorName}</b><span className="badge">Score {r.score}</span></div><div className="muted small">{r.specialisation} · {new Date(r.start).toLocaleString()}</div><p className="small">{r.reasons.join(" · ")}</p><button className="btn secondary" onClick={() => chooseRecommendation(r)}>Use this slot</button></div>)}</div>}
      {message && <div className="notice" style={{ marginTop: 12 }}>{message}</div>}
    </section>

    <div className="grid">
      <section className="card"><h3>1. Choose a doctor</h3>{doctors.length === 0 ? <p className="muted small">Search by specialisation to see available doctors.</p> : doctors.map((d) => <div className="appointment" key={d.id}><b>{d.user.name}</b><div className="muted small">{d.specialisation} · {d.slotDuration} min</div><button className="btn secondary" onClick={() => { setSelected(d); setSlot(null); }}>Choose</button></div>)}</section>
      <section className="card"><h3>2. Slot + symptom intake</h3>{!selected ? <p className="muted">Choose a doctor or use Find an appointment.</p> : <><b>{selected.user.name}</b><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /><button className="btn secondary" style={{ marginTop: 8 }} onClick={loadSlots}>Load slots</button><div className="row" style={{ marginTop: 12 }}>{slots.filter((s) => s.available).map((s) => <button className={`slot ${slot?.start === s.start ? "selected" : ""}`} key={s.start} onClick={() => setSlot(s)}>{new Date(s.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</button>)}</div>{slot && <><label>Symptoms</label><textarea rows={5} value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="Describe the symptoms you want the doctor to know before the visit..." /><button className="btn" disabled={busy} onClick={book}>Hold & confirm appointment</button></>}</>}</section>
    </div>

    <section className="card" style={{ marginTop: 18 }}><div className="row" style={{ justifyContent: "space-between" }}><h3 style={{ margin: 0 }}>My appointments</h3><span className="badge">Appointment history</span></div>{appointments.length === 0 ? <p className="muted">No appointments.</p> : appointments.map((a) => <PatientAppointment key={a.id} appointment={a} onRefresh={loadAppointments} />)}</section>
  </>;
}

function PatientAppointment({ appointment: a, onRefresh }: { appointment: Appointment; onRefresh: () => Promise<void> }) {
  const [altMessage, setAltMessage] = useState("");
  const [accepting, setAccepting] = useState(false);
  const alternatives = a.alternatives || [];
  const plan = a.reminderTier === "CONFIRMATION_REQUIRED" ? ["24h reminder", "2h confirmation reminder"] : ["24h reminder"];
  async function accept(alternativeId: string) {
    setAccepting(true); setAltMessage("Moving your appointment...");
    const r = await fetch(`/api/appointments/${a.id}/alternatives/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alternativeId }) });
    const d = await r.json(); setAltMessage(r.ok ? "Alternative confirmed. Your calendar and notifications will be updated." : d.error); setAccepting(false); await onRefresh();
  }
  return <div className="appointment"><div className="row" style={{ justifyContent: "space-between" }}><div><b>{a.doctor.user.name}</b> · {a.status}<div className="muted small">{new Date(a.startTime).toLocaleString()}</div></div>{a.reminderTier && <span className="badge">{a.reminderTier === "CONFIRMATION_REQUIRED" ? "Extra reminders" : "Standard reminders"}</span>}</div>{a.preVisit && <div className="notice" style={{ marginTop: 8 }}><b>Visit summary</b><br />Urgency: <b>{a.preVisit.urgency}</b><br />{a.preVisit.chiefComplaint}</div>}{a.postVisit?.summary && <div style={{ marginTop: 8 }}><b>Patient-friendly summary</b><p>{a.postVisit.summary.summary}</p>{a.postVisit.summary.medicationSchedule?.length > 0 && <p className="small"><b>Medication:</b> {a.postVisit.summary.medicationSchedule.join(" · ")}</p>}</div>}{a.status === "CANCELLED" && alternatives.length > 0 && <div className="alternativeBox"><h4 style={{ marginTop: 0 }}>Alternative appointments</h4>{alternatives.map((alt: any) => <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", padding: "10px 0" }} key={alt.id}><span>{new Date(alt.suggestedStart).toLocaleString()}</span><button className="btn secondary" disabled={accepting} onClick={() => accept(alt.id)}>Accept</button></div>)}{altMessage && <p className="small">{altMessage}</p>}</div>}{a.status === "CONFIRMED" && <div className="small muted" style={{ marginTop: 8 }}>Reminder plan: {plan.join(" + ")}. Reminder rules use appointment logistics and attendance history only.</div>}</div>;
}

function DoctorPortal() {
  const [apps, setApps] = useState<Appointment[]>([]), [active, setActive] = useState<Appointment | null>(null), [notes, setNotes] = useState(""), [prescription, setPrescription] = useState(""), [message, setMessage] = useState("");
  const load = async () => { const d = await fetch("/api/appointments").then((r) => r.json()); setApps(d.appointments || []); };
  useEffect(() => { load(); }, []);
  async function save() { if (!active) return; const r = await fetch(`/api/appointments/${active.id}/post-visit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes, prescription }) }); const d = await r.json(); setMessage(r.ok ? d.summary.summary : d.error); await load(); }
  const high = apps.filter((a) => a.preVisit?.urgency === "High").length;
  return <><div className="topbar"><div><span className="badge">DOCTOR PORTAL</span><h1 className="portalTitle">Patient queue</h1></div><button className="btn secondary" onClick={() => location.href = "/api/google/calendar/connect"}>Connect Calendar</button></div><div className="grid" style={{ marginBottom: 18 }}><div className="card"><div className="muted small">Upcoming / recorded</div><div className="stat">{apps.length}</div></div><div className="card"><div className="muted small">High-priority visit summaries</div><div className="stat">{high}</div><div className="small muted">Decision support only — not a diagnosis</div></div></div><div className="grid">{apps.map((a) => <div className={`card ${a.preVisit?.urgency === "High" ? "priorityCard" : ""}`} key={a.id}><div className="row" style={{ justifyContent: "space-between" }}><b>{a.patient.name}</b>{a.preVisit && <span className="badge">{a.preVisit.urgency} urgency</span>}</div><div className="muted small">{new Date(a.startTime).toLocaleString()} · {a.status}</div>{a.preVisit && <div className="notice" style={{ marginTop: 10 }}><b>Visit summary</b><br />Chief complaint: {a.preVisit.chiefComplaint}<br />Suggested questions: {(a.preVisit.questions as string[]).join(" • ")}</div>}<button className="btn" style={{ marginTop: 10 }} onClick={() => { setActive(a); setMessage(""); }}>Post-visit</button></div>)}</div>{active && <div className="card" style={{ marginTop: 18 }}><h3>Post-visit: {active.patient.name}</h3><label>Clinical notes</label><textarea rows={7} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Record the visit without adding unsupported facts." /><label>Prescription</label><textarea rows={4} value={prescription} onChange={(e) => setPrescription(e.target.value)} placeholder="Medicine - 2 times/day" /><button className="btn" onClick={save}>Generate patient-friendly summary</button>{message && <div className="notice" style={{ marginTop: 10 }}>{message}</div>}</div>}</>;
}

function AdminPortal() {
  const [message, setMessage] = useState(""), [name, setName] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState("Doctor@12345"), [spec, setSpec] = useState("General Medicine");
  const [doctors, setDoctors] = useState<any[]>([]), [leaveDoctor, setLeaveDoctor] = useState(""), [leaveStart, setLeaveStart] = useState(""), [leaveEnd, setLeaveEnd] = useState(""), [leaveMessage, setLeaveMessage] = useState("");
  const [health, setHealth] = useState<any>(null), [attendance, setAttendance] = useState<any>(null);
  useEffect(() => { fetch("/api/doctors").then((r) => r.json()).then((d) => { setDoctors(d.doctors || []); if (d.doctors?.[0]) setLeaveDoctor(d.doctors[0].id); }); refreshHealth(); }, []);
  async function refreshHealth() { const [h, a] = await Promise.all([fetch("/api/admin/notifications").then((r) => r.json()), fetch("/api/admin/attendance").then((r) => r.json())]); if (h.notificationCounts) setHealth(h); if (a.attendanceRate !== undefined) setAttendance(a); }
  async function create(e: React.FormEvent) { e.preventDefault(); const workingHours = { mon: { start: "09:00", end: "17:00" }, tue: { start: "09:00", end: "17:00" }, wed: { start: "09:00", end: "17:00" }, thu: { start: "09:00", end: "17:00" }, fri: { start: "09:00", end: "17:00" }, sat: null, sun: null }; const r = await fetch("/api/admin/doctors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password, specialisation: spec, slotDuration: 30, workingHours }) }); const d = await r.json(); setMessage(r.ok ? `Created doctor: ${d.user.name}` : d.error); if (r.ok) { setDoctors((prev) => [...prev, { id: d.doctor.id, user: d.user, specialisation: spec, slotDuration: 30 }]); } }
  async function createLeave(e: React.FormEvent) { e.preventDefault(); setLeaveMessage("Applying leave and finding alternative appointments..."); const r = await fetch("/api/admin/leaves", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doctorId: leaveDoctor, startDate: new Date(leaveStart).toISOString(), endDate: new Date(leaveEnd).toISOString(), reason: "Doctor unavailable" }) }); const d = await r.json(); setLeaveMessage(r.ok ? `Leave created. ${d.affectedAppointments?.length || 0} existing appointment(s) received alternative-slot suggestions.` : d.error); await refreshHealth(); }
  const sent = useMemo(() => health?.notificationCounts?.find((x: any) => x.status === "SENT")?._count?._all || 0, [health]);
  const failed = useMemo(() => health?.notificationCounts?.find((x: any) => x.status === "FAILED")?._count?._all || 0, [health]);
  return <><div className="topbar"><div><span className="badge">ADMIN PORTAL</span><h1 className="portalTitle">Clinic control center</h1></div><button className="btn secondary" onClick={refreshHealth}>Refresh health</button></div><div className="grid"><div className="card"><div className="muted small">Email notifications sent</div><div className="stat">{sent}</div></div><div className="card"><div className="muted small">Failed after retries</div><div className="stat">{failed}</div></div><div className="card"><div className="muted small">Attendance rate</div><div className="stat">{attendance?.attendanceRate == null ? "—" : `${attendance.attendanceRate}%`}</div></div></div><div className="grid" style={{ marginTop: 18 }}><section className="card"><h3>Create doctor profile</h3><form className="stack" onSubmit={create}><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} required /><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /><label>Password</label><input value={password} onChange={(e) => setPassword(e.target.value)} required /><label>Specialisation</label><input value={spec} onChange={(e) => setSpec(e.target.value)} required /><button className="btn">Create doctor</button></form>{message && <p className="small">{message}</p>}</section><section className="card"><h3>Doctor leave + conflict resolver</h3><p className="muted small">Existing bookings are cancelled safely, patients are notified, calendars are queued for deletion, and CareFlow finds alternative slots.</p><form className="stack" onSubmit={createLeave}><label>Doctor</label><select value={leaveDoctor} onChange={(e) => setLeaveDoctor(e.target.value)}>{doctors.map((d) => <option key={d.id} value={d.id}>{d.user.name} — {d.specialisation}</option>)}</select><label>Leave starts</label><input type="datetime-local" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} required /><label>Leave ends</label><input type="datetime-local" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} required /><button className="btn">Mark leave & resolve conflicts</button></form>{leaveMessage && <div className="notice" style={{ marginTop: 10 }}>{leaveMessage}</div>}</section></div><section className="card" style={{ marginTop: 18 }}><div className="row" style={{ justifyContent: "space-between" }}><h3 style={{ margin: 0 }}>Notification reliability</h3><span className="badge">DELIVERY STATUS</span></div><p className="muted small">Email and calendar operations run separately from the appointment transaction, so delivery failures can be retried without changing the booking.</p>{health?.failedNotifications?.length === 0 && health?.failedCalendar?.length === 0 ? <p className="successText">No failed integrations currently require investigation.</p> : <div className="grid">{health?.failedNotifications?.map((n: any) => <div className="appointment" key={n.id}><b>Email failure</b><div className="small">{n.user.name} · {n.subject}</div><div className="muted small">Attempts: {n.attempts} · {n.lastError}</div></div>)}{health?.failedCalendar?.map((c: any) => <div className="appointment" key={c.id}><b>Calendar failure</b><div className="small">{c.user.name} · {c.operation}</div><div className="muted small">Attempts: {c.attempts} · {c.lastError}</div></div>)}</div>}</section></>;
}
