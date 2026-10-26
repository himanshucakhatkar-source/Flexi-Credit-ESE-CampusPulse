import { useCallback, useEffect, useMemo, useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from '@firebase/auth';
import { firebaseAuth } from './firebase.js';

const navItems = [
  ['dashboard', '⌂', 'Overview'],
  ['subjects', '▤', 'Subjects'],
  ['attendance', '◷', 'Attendance'],
  ['assignments', '✓', 'Assignments'],
  ['calendar', '▦', 'Calendar']
];

const pageLabels = {
  dashboard: ['YOUR ACADEMIC SNAPSHOT', 'Overview', 'A little structure goes a long way.'],
  subjects: ['BUILD YOUR SEMESTER', 'Subjects', 'Keep your classes and attendance targets together.'],
  attendance: ['SHOW UP WITH CONFIDENCE', 'Attendance', 'Track each class and see where you stand.'],
  assignments: ['MAKE SPACE FOR THE WORK', 'Assignments', 'See what is due and make your next move.'],
  calendar: ['LOOK AHEAD', 'Calendar', 'Keep important academic dates close.']
};

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error?.message || 'That request could not be completed.');
  }
  return response.status === 204 ? null : response.json();
}

function AuthScreen({ onAuthenticated, startupError }) {
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Sign in to keep your classes, assignments, and plans together.');
  const [isError, setIsError] = useState(false);

  const finishAuth = (user) => {
    setIsError(false);
    setMessage('You’re signed in. Loading your workspace…');
    onAuthenticated(user);
  };

  async function submitCredentials(event) {
    event.preventDefault();
    setBusy(true);
    setIsError(false);
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const result = await api(registering ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      finishAuth(result.user);
    } catch (error) {
      setMessage(error.message);
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    setIsError(false);
    try {
      const result = await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
      const idToken = await result.user.getIdToken();
      const response = await api('/api/auth/firebase', { method: 'POST', body: JSON.stringify({ id_token: idToken }) });
      const session = await api('/api/auth/me');
      if (!session.user) throw new Error('Google accepted your account, but CampusPulse could not save the sign-in session.');
      finishAuth(response.user);
    } catch (error) {
      const messages = {
        'auth/unauthorized-domain': 'Add this site to Firebase Authentication → Settings → Authorized domains, then try again.',
        'auth/operation-not-allowed': 'Google sign-in is not enabled in Firebase Authentication.',
        'auth/popup-blocked': 'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.',
        'auth/popup-closed-by-user': 'The Google sign-in window was closed before sign-in finished.'
      };
      setMessage(messages[error.code] || error.message || 'Google sign-in could not be completed.');
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-screen" aria-labelledby="auth-title">
      <div className="auth-card">
        <a className="wordmark auth-wordmark" href="/">Campus<span>Pulse</span></a>
        <p className="eyebrow">Your semester, in focus</p>
        <h1 id="auth-title">{registering ? 'Create your account' : 'Welcome back'}</h1>
        {startupError && <p className="auth-copy auth-message error" role="alert">{startupError} Make sure MongoDB is running and restart the app.</p>}
        <p className={`auth-copy auth-message${isError ? ' error' : ''}`} role={isError ? 'alert' : 'status'}>{message}</p>
        <form className="auth-form" onSubmit={submitCredentials}>
          <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
          <label>Password<input name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} minLength="8" placeholder="At least 8 characters" required /></label>
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}</button>
        </form>
        <div className="auth-divider"><span>or</span></div>
        <button className="button button-google" type="button" onClick={signInWithGoogle} disabled={busy}><span className="google-mark">G</span>{busy ? 'Connecting…' : 'Continue with Google'}</button>
        <p className="auth-switch">
          {registering ? 'Already have an account?' : 'New to CampusPulse?'}{' '}
          <button className="text-button" type="button" disabled={busy} onClick={() => {
            setRegistering(value => !value);
            setMessage(registering ? 'Sign in to keep your classes, assignments, and plans together.' : 'Set up your private academic workspace in a moment.');
            setIsError(false);
          }}>{registering ? 'Sign in' : 'Create an account'}</button>
        </p>
        <p className="auth-footnote">Your academic workspace stays private to your account.</p>
      </div>
      <div className="auth-visual" aria-hidden="true">
        <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
        <div className="visual-content"><span className="visual-kicker">A calmer semester starts here</span><p>Small progress.<br /><strong>Clearer weeks.</strong></p><div className="visual-note"><span className="note-dot" />Classes, attendance, and due dates in one place</div></div>
        <div className="visual-spark spark-one">✦</div><div className="visual-spark spark-two">✳</div>
      </div>
    </section>
  );
}

function AttendanceBadge({ attendance }) {
  if (attendance.percentage == null) return <span className="badge">No sessions</span>;
  const mood = attendance.percentage >= attendance.target ? 'good' : 'warning';
  return <span className={`badge ${mood}`}>{Math.round(attendance.percentage)}%</span>;
}

function Dashboard({ data, onNavigate }) {
  const pending = data.tasks.filter(task => task.status === 'pending');
  const overdue = pending.filter(task => task.due_date < today());
  const subjectCount = data.dashboard?.subject_count || 0;
  const overall = data.dashboard?.overall_attendance;
  return (
    <>
      <div className="stats-grid">
        <article className="stat-card"><div className="stat-top">Subjects <span className="stat-icon">▤</span></div><div className="stat-value">{subjectCount}</div><div className="stat-note">In your workspace</div></article>
        <article className="stat-card"><div className="stat-top">Overall attendance <span className="stat-icon">◷</span></div><div className="stat-value">{overall == null ? '—' : `${Math.round(overall)}%`}</div><div className="stat-note">Across your recorded classes</div></article>
        <article className="stat-card"><div className="stat-top">To do <span className="stat-icon">✓</span></div><div className="stat-value">{data.dashboard?.pending_assignments || 0}</div><div className="stat-note">Assignments still open</div></article>
        <article className="stat-card"><div className="stat-top">Past due <span className="stat-icon">!</span></div><div className={`stat-value${overdue.length ? ' priority-high' : ''}`}>{data.dashboard?.overdue_assignments || 0}</div><div className="stat-note">A good place to start</div></article>
      </div>
      <div className="dashboard-grid">
        <article className="panel"><div className="panel-heading"><div><h2>Subject pulse</h2><p className="panel-subtitle">Your attendance, at a glance</p></div><button className="subtle-link" onClick={() => onNavigate('subjects')}>All subjects →</button></div>
          {data.subjects.length ? data.subjects.map(subject => <div className="data-row" key={subject.id}><div className="row-main"><strong>{subject.name}</strong><div className="bar"><i style={{ width: `${Math.min(100, subject.attendance.percentage || 0)}%` }} /></div></div><div className="subject-attendance"><AttendanceBadge attendance={subject.attendance} /><div className="row-detail">{subject.attendance.held} classes · target {subject.attendance.target}%</div></div></div>) : <div className="empty-state">Add a subject to start seeing your attendance.</div>}
        </article>
        <article className="panel"><div className="panel-heading"><div><h2>Next up</h2><p className="panel-subtitle">A short list to keep you moving</p></div><button className="subtle-link" onClick={() => onNavigate('assignments')}>Assignments →</button></div>
          {pending.length ? pending.slice(0, 5).map(task => <div className="data-row" key={task.id}><div className="row-main"><strong>{task.title}</strong><div className="row-detail">Due {task.due_date}</div></div><span className={`badge priority-${task.priority}`}>{task.priority}</span></div>) : <div className="empty-state">You’re all caught up. Nice work.</div>}
        </article>
        <article className="panel"><div className="panel-heading"><div><h2>Coming up on your calendar</h2><p className="panel-subtitle">Holidays and assessment dates</p></div><button className="subtle-link" onClick={() => onNavigate('calendar')}>Open calendar →</button></div>
          {data.dashboard?.notifications?.length ? data.dashboard.notifications.map(event => <div className="data-row" key={event.id}><div className="row-main"><strong>{event.title}</strong><div className="row-detail">{event.event_date} · {event.event_type === 'ca' ? 'Assessment' : 'Holiday'}</div></div><span className="badge">{event.event_type === 'ca' ? 'CA' : 'Day off'}</span></div>) : <div className="empty-state">Add key dates so they don’t sneak up on you.</div>}
        </article>
        <article className="panel"><div className="panel-heading"><div><h2>A small nudge</h2><p className="panel-subtitle">Make today a little easier</p></div><span className="stat-icon">✦</span></div><p className="row-detail" style={{ fontSize: 12, lineHeight: 1.8 }}>Choose one task, give it a clear next step, and let the rest wait its turn.</p><button className="button button-primary" onClick={() => onNavigate('assignments')} style={{ marginTop: 10 }}>＋ Add an assignment</button></article>
      </div>
    </>
  );
}

function SubjectsPage({ subjects, refresh, notify }) {
  async function addSubject(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      await api('/api/subjects', { method: 'POST', body: JSON.stringify(values) });
      form.reset();
      form.elements.attendance_target.value = '75';
      await refresh();
      notify('Subject added.');
    } catch (error) { notify(error.message, true); }
  }

  async function removeSubject(id) {
    if (!window.confirm('Remove this subject and its attendance history?')) return;
    try { await api(`/api/subjects/${id}`, { method: 'DELETE' }); await refresh(); notify('Subject removed.'); }
    catch (error) { notify(error.message, true); }
  }

  return <div className="page-grid"><article className="panel form-panel"><h2>Add a subject</h2><p className="panel-subtitle">Set an attendance goal that works for you.</p><form className="stack-form" style={{ marginTop: 16 }} onSubmit={addSubject}><label>Subject name<input className="field-input" name="name" placeholder="e.g. Data Structures" required maxLength="100" /></label><label>Attendance target (%)<input className="field-input" name="attendance_target" type="number" min="1" max="100" defaultValue="75" required /></label><button className="button button-primary" type="submit">Add subject</button></form></article><article className="panel list-panel"><h2>Your subjects</h2><p className="panel-subtitle">{subjects.length} {subjects.length === 1 ? 'class' : 'classes'} in your list</p>{subjects.length ? subjects.map(subject => <div className="data-row" key={subject.id}><div className="row-main"><strong>{subject.name}</strong><div className="row-detail">Target {subject.attendance_target}% · {subject.attendance.held} classes held</div></div><div className="row-actions"><AttendanceBadge attendance={subject.attendance} /><button className="small-button danger" onClick={() => removeSubject(subject.id)}>Remove</button></div></div>) : <div className="empty-state">Your list is ready when you are. Add your first subject.</div>}</article></div>;
}

function AttendancePage({ subjects, notify, refresh }) {
  const [histories, setHistories] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await Promise.all(subjects.map(async subject => ({ subject, sessions: await api(`/api/subjects/${subject.id}/sessions`) })));
      setHistories(result);
    } catch (error) { notify(error.message, true); }
    finally { setLoading(false); }
  }, [subjects, notify]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function addSession(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const subjectId = values.subject_id;
    delete values.subject_id;
    try {
      await api(`/api/subjects/${subjectId}/sessions`, { method: 'POST', body: JSON.stringify(values) });
      await Promise.all([refresh(), loadHistory()]);
      notify('Attendance saved.');
    } catch (error) { notify(error.message, true); }
  }

  async function updateStatus(sessionId, status) {
    try {
      await api(`/api/sessions/${sessionId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await Promise.all([refresh(), loadHistory()]);
      notify('Attendance updated.');
    } catch (error) { notify(error.message, true); }
  }

  return <div className="page-grid"><article className="panel form-panel"><h2>Record a class</h2><p className="panel-subtitle">Log attendance while it’s fresh.</p><form className="stack-form" style={{ marginTop: 16 }} onSubmit={addSession}><label>Subject<select className="field-input" name="subject_id" required disabled={!subjects.length}>{subjects.map(subject => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label><label>Date<input className="field-input" name="session_date" type="date" defaultValue={today()} required /></label><label>Attendance status<select className="field-input" name="status"><option value="attended">Attended</option><option value="absent">Absent</option><option value="cancelled">Cancelled</option></select></label><button className="button button-primary" type="submit" disabled={!subjects.length}>Save class</button></form></article><article className="panel list-panel"><h2>Attendance outlook</h2><p className="panel-subtitle">Your current standing and class history</p>{loading ? <div className="empty-state">Loading attendance…</div> : histories.length ? histories.map(({ subject, sessions }) => <div className="data-row" key={subject.id}><div className="row-main"><strong>{subject.name}</strong><div className="row-detail">{subject.attendance.attended} attended · {subject.attendance.held} held · target {subject.attendance.target}%</div><div className="bar"><i style={{ width: `${Math.min(100, subject.attendance.percentage || 0)}%` }} /></div>{sessions.map(item => <div className="row-detail attendance-session" key={item.id}><span>{item.session_date}</span><select className="event-status" value={item.status} aria-label={`Attendance on ${item.session_date}`} onChange={event => updateStatus(item.id, event.target.value)}><option value="attended">Attended</option><option value="absent">Absent</option><option value="cancelled">Cancelled</option></select></div>)}</div><AttendanceBadge attendance={subject.attendance} /></div>) : <div className="empty-state">Add a subject before recording attendance.</div>}</article></div>;
}

function AssignmentsPage({ tasks, refresh, notify }) {
  async function addTask(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try { await api('/api/tasks', { method: 'POST', body: JSON.stringify(values) }); form.reset(); await refresh(); notify('Assignment added.'); }
    catch (error) { notify(error.message, true); }
  }

  async function updateTask(task) {
    try {
      await api(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: task.status === 'completed' ? 'pending' : 'completed' }) });
      await refresh();
      notify('Assignment updated.');
    } catch (error) { notify(error.message, true); }
  }

  async function deleteTask(id) {
    if (!window.confirm('Delete this assignment?')) return;
    try { await api(`/api/tasks/${id}`, { method: 'DELETE' }); await refresh(); notify('Assignment removed.'); }
    catch (error) { notify(error.message, true); }
  }

  return <div className="page-grid"><article className="panel form-panel"><h2>Add an assignment</h2><p className="panel-subtitle">Get it out of your head and onto your list.</p><form className="stack-form" style={{ marginTop: 16 }} onSubmit={addTask}><label>Assignment title<input className="field-input" name="title" placeholder="e.g. Lab report" required maxLength="160" /></label><label>Details<textarea name="description" placeholder="Optional notes" /></label><div className="field-grid"><label>Due date<input className="field-input" name="due_date" type="date" required /></label><label>Priority<select className="field-input" name="priority"><option value="medium">Medium</option><option value="high">High</option><option value="low">Low</option></select></label></div><button className="button button-primary" type="submit">Add assignment</button></form></article><article className="panel list-panel"><h2>Your assignments</h2><p className="panel-subtitle">{tasks.filter(task => task.status === 'pending').length} open · {tasks.filter(task => task.status === 'completed').length} completed</p>{tasks.length ? tasks.map(task => <div className="data-row" key={task.id}><div className="row-main"><strong className={task.status === 'completed' ? 'completed-title' : ''}>{task.title}</strong><div className="row-detail">Due {task.due_date}{task.description ? ` · ${task.description}` : ''}</div></div><div className="row-actions"><span className={`badge priority-${task.priority}`}>{task.priority}</span><button className="small-button" onClick={() => updateTask(task)}>{task.status === 'completed' ? 'Reopen' : 'Done'}</button><button className="small-button danger" onClick={() => deleteTask(task.id)}>Delete</button></div></div>) : <div className="empty-state">No assignments yet. Add one when you’re ready.</div>}</article></div>;
}

function CalendarPage({ events, refresh, notify }) {
  async function addEvent(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try { await api('/api/calendar', { method: 'POST', body: JSON.stringify(values) }); form.reset(); await refresh(); notify('Date added to your calendar.'); }
    catch (error) { notify(error.message, true); }
  }

  async function editEvent(item) {
    const title = window.prompt('Event title', item.title);
    if (title === null || !title.trim()) return;
    const eventDate = window.prompt('Date (YYYY-MM-DD)', item.event_date);
    if (eventDate === null || !eventDate.trim()) return;
    try {
      await api(`/api/calendar/${item.id}`, { method: 'PATCH', body: JSON.stringify({ ...item, title, event_date: eventDate }) });
      await refresh();
      notify('Calendar date updated.');
    } catch (error) { notify(error.message, true); }
  }

  async function deleteEvent(id) {
    if (!window.confirm('Remove this calendar date?')) return;
    try { await api(`/api/calendar/${id}`, { method: 'DELETE' }); await refresh(); notify('Date removed.'); }
    catch (error) { notify(error.message, true); }
  }

  return <div className="page-grid"><article className="panel form-panel"><h2>Add an important date</h2><p className="panel-subtitle">Keep assessments and days off on your radar.</p><form className="stack-form" style={{ marginTop: 16 }} onSubmit={addEvent}><label>Event title<input className="field-input" name="title" placeholder="e.g. Midterm assessment" required maxLength="140" /></label><div className="field-grid"><label>Date<input className="field-input" name="event_date" type="date" required /></label><label>Type<select className="field-input" name="event_type"><option value="ca">Assessment</option><option value="holiday">Holiday</option></select></label></div><label>Notes<textarea name="description" placeholder="Optional details" /></label><button className="button button-primary" type="submit">Add to calendar</button></form></article><article className="panel list-panel"><h2>Your calendar</h2><p className="panel-subtitle">{events.length} dates saved</p>{events.length ? events.map(item => { const date = new Date(`${item.event_date}T12:00:00`); return <div className="calendar-event" key={item.id}><div className="date-tile"><strong>{date.getDate()}</strong><span>{date.toLocaleString(undefined, { month: 'short' })}</span></div><div><strong>{item.title}</strong><p>{item.event_type === 'ca' ? 'Assessment' : 'Holiday'}{item.description ? ` · ${item.description}` : ''}</p></div><div className="row-actions"><button className="small-button" onClick={() => editEvent(item)}>Edit</button><button className="small-button danger" onClick={() => deleteEvent(item.id)}>Remove</button></div></div>; }) : <div className="empty-state">Add the dates you want to remember.</div>}</article></div>;
}

function Workspace({ user, onSignOut }) {
  const [page, setPage] = useState('dashboard');
  const [data, setData] = useState({ dashboard: null, subjects: [], tasks: [], events: [] });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, isError = false) => {
    setToast({ message, isError });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const refresh = useCallback(async () => {
    const [dashboard, subjects, tasks, events] = await Promise.all([
      api('/api/dashboard'), api('/api/subjects'), api('/api/tasks'), api('/api/calendar')
    ]);
    setData({ dashboard, subjects, tasks, events });
  }, []);

  useEffect(() => {
    refresh().catch(error => notify(error.message, true)).finally(() => setLoading(false));
  }, [refresh, notify]);

  const currentLabels = pageLabels[page];
  const initials = useMemo(() => (user.email || 'C').slice(0, 1).toUpperCase(), [user.email]);

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); onSignOut(); }
    catch (error) { notify(error.message, true); }
  }

  if (loading) return <div className="loading-screen">Loading your academic workspace…</div>;

  return <div className="application">
    <aside className="sidebar">
      <a className="wordmark" href="#dashboard" onClick={event => { event.preventDefault(); setPage('dashboard'); }}>Campus<span>Pulse</span></a>
      <p className="sidebar-caption">STUDENT WORKSPACE</p>
      <nav className="main-nav" aria-label="Main navigation">{navItems.map(([id, icon, label]) => <button className={`nav-link${page === id ? ' active' : ''}`} key={id} onClick={() => setPage(id)}><span className="nav-icon">{icon}</span>{label}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="sidebar-tip"><span className="tip-icon">✦</span><strong>One step at a time</strong><span>Keep your academic week visible and manageable.</span></div>
        <div className="profile-row"><div className="avatar">{initials}</div><div className="profile-copy"><strong>{user.email}</strong><span>{user.role === 'admin' ? 'Administrator' : 'Student account'}</span></div><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={logout}>↗</button></div>
      </div>
    </aside>
    <main className="main-content">
      <header className="page-header"><div><p className="eyebrow">{currentLabels[0]}</p><h1>{currentLabels[1]}</h1><p className="page-subtitle">{currentLabels[2]}</p></div>{page !== 'calendar' && <button className="button button-primary header-action" onClick={() => setPage('assignments')}><span>＋</span> Add assignment</button>}</header>
      {toast && <div className="toast-region" role="status" aria-live="polite"><div className={`toast${toast.isError ? ' error' : ''}`}>{toast.message}</div></div>}
      <section aria-live="polite">
        {page === 'dashboard' && data.dashboard && <Dashboard data={data} onNavigate={setPage} />}
        {page === 'subjects' && <SubjectsPage subjects={data.subjects} refresh={refresh} notify={notify} />}
        {page === 'attendance' && <AttendancePage subjects={data.subjects} refresh={refresh} notify={notify} />}
        {page === 'assignments' && <AssignmentsPage tasks={data.tasks} refresh={refresh} notify={notify} />}
        {page === 'calendar' && <CalendarPage events={data.events} refresh={refresh} notify={notify} />}
      </section>
      <footer className="app-footer">CampusPulse <span>·</span> Make room for what matters.</footer>
    </main>
  </div>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [startupError, setStartupError] = useState('');

  useEffect(() => {
    api('/api/auth/me').then(result => setUser(result.user)).catch(() => {
      setUser(null);
      setStartupError('Cannot reach the CampusPulse API.');
    }).finally(() => setCheckingSession(false));
  }, []);

  if (checkingSession) return <div className="loading-screen">Preparing CampusPulse…</div>;
  return user ? <Workspace user={user} onSignOut={() => setUser(null)} /> : <AuthScreen onAuthenticated={setUser} startupError={startupError} />;
}
