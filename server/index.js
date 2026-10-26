import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import MongoStore from 'connect-mongo';
import express from 'express';
import session from 'express-session';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import mongoose from 'mongoose';
import { connectDatabase } from './db.js';
import { Assignment, CalendarEvent, ClassSession, Subject, User } from './models.js';

const app = express();
const port = Number(process.env.PORT || 5000);
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campuspulse';
const projectId = process.env.FIREBASE_PROJECT_ID || 'campuspulse-820aa';
const firebaseIssuer = `https://securetoken.google.com/${projectId}`;
const firebaseKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const adminEmails = new Set((process.env.ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || process.env.SECRET_KEY || (isProduction ? '' : crypto.randomBytes(32).toString('hex'));
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(rootDir, '../dist/client');

if (!sessionSecret) throw new Error('Set SESSION_SECRET before starting CampusPulse in production.');

app.disable('x-powered-by');
app.set('trust proxy', isProduction ? 1 : false);
app.use(express.json({ limit: '32kb' }));
app.use(session({
  name: 'campuspulse.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: mongoUri, collectionName: 'sessions', ttl: 7 * 24 * 60 * 60 }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const sendError = (res, message, status = 400, code = 'VALIDATION_ERROR') => res.status(status).json({ error: { code, message } });
const publicUser = user => ({ id: String(user._id), email: user.email, role: user.role });
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const validDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

async function saveLoginSession(req, user) {
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  req.session.userId = String(user._id);
  await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
}

async function applyAdminRole(user) {
  if (adminEmails.has(user.email) && user.role !== 'admin') {
    user.role = 'admin';
    await user.save();
  }
  return user;
}

const requireAuth = asyncRoute(async (req, res, next) => {
  const userId = req.session.userId;
  if (!userId) return sendError(res, 'Sign in to continue.', 401, 'UNAUTHENTICATED');
  const user = await User.findById(userId);
  if (!user) {
    req.session.destroy(() => {});
    return sendError(res, 'Sign in to continue.', 401, 'UNAUTHENTICATED');
  }
  req.user = user;
  next();
});

const requireAdmin = (req, res, next) => req.user.role === 'admin'
  ? next()
  : sendError(res, 'Administrator access required.', 403, 'FORBIDDEN');

function calculateAttendance(sessions, target) {
  const attended = sessions.filter(item => item.status === 'attended').length;
  const held = sessions.filter(item => item.status === 'attended' || item.status === 'absent').length;
  const percentage = held ? attended / held * 100 : null;
  const classesNeeded = percentage === null ? null : percentage >= target ? 0 : target >= 100 ? null : Math.ceil((target * held - 100 * attended) / (100 - target));
  return { attended, held, percentage, target, classes_needed: classesNeeded, target_unreachable: percentage !== null && percentage < target && target >= 100 };
}

async function subjectJson(subject) {
  const sessions = await ClassSession.find({ userId: subject.userId, subjectId: subject._id }).sort({ sessionDate: 1 }).lean();
  return {
    id: String(subject._id),
    name: subject.name,
    attendance_target: subject.attendanceTarget,
    attendance: calculateAttendance(sessions, subject.attendanceTarget)
  };
}

function assignmentJson(item) {
  return { id: String(item._id), title: item.title, description: item.description, due_date: item.dueDate, priority: item.priority, status: item.status };
}

function eventJson(item) {
  return { id: String(item._id), title: item.title, event_date: item.eventDate, event_type: item.eventType, description: item.description };
}

app.get('/api/health', (_req, res) => res.json({ ok: true, database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return sendError(res, 'Enter a valid email address.');
  if (password.length < 8) return sendError(res, 'Use a password with at least 8 characters.');
  const existing = await User.findOne({ email });
  if (existing) return sendError(res, 'An account with this email already exists.', 409, 'CONFLICT');
  const user = await User.create({ email, passwordHash: await bcrypt.hash(password, 12), role: adminEmails.has(email) ? 'admin' : 'student' });
  await saveLoginSession(req, user);
  res.status(201).json({ user: publicUser(user) });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const user = await User.findOne({ email });
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) return sendError(res, 'Email or password is incorrect.', 401, 'INVALID_CREDENTIALS');
  await applyAdminRole(user);
  await saveLoginSession(req, user);
  res.json({ user: publicUser(user) });
}));

app.post('/api/auth/firebase', asyncRoute(async (req, res) => {
  const token = String(req.body.id_token || '');
  if (!token) return sendError(res, 'Firebase ID token is required.', 401, 'INVALID_TOKEN');
  let payload;
  try {
    ({ payload } = await jwtVerify(token, firebaseKeys, { audience: projectId, issuer: firebaseIssuer }));
  } catch (error) {
    console.warn('Firebase token verification failed:', error.code || error.name || 'verification error');
    return sendError(res, 'Google account was selected, but Firebase could not verify the sign-in token. Check the server connection and Firebase project ID.', 401, 'INVALID_TOKEN');
  }
  const email = normalizeEmail(payload.email);
  if (!payload.sub || !email || payload.email_verified !== true) return sendError(res, 'Use a verified Google email address.', 401, 'INVALID_TOKEN');
  let user = await User.findOne({ email });
  if (!user) {
    try {
      user = await User.create({ email, role: adminEmails.has(email) ? 'admin' : 'student' });
    } catch (error) {
      if (error.code !== 11000) throw error;
      user = await User.findOne({ email });
    }
  }
  await applyAdminRole(user);
  await saveLoginSession(req, user);
  res.json({ user: publicUser(user) });
}));

app.post('/api/auth/logout', (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('campuspulse.sid', { httpOnly: true, sameSite: 'lax', secure: isProduction });
    res.json({ message: 'Signed out.' });
  });
});

app.get('/api/auth/me', asyncRoute(async (req, res) => {
  const user = req.session.userId ? await User.findById(req.session.userId) : null;
  res.json({ user: user ? publicUser(user) : null });
}));

app.get('/api/admin/users', requireAuth, requireAdmin, asyncRoute(async (_req, res) => {
  const users = await User.find().select('email role createdAt').sort({ email: 1 }).lean();
  res.json(users.map(item => ({ id: String(item._id), email: item.email, role: item.role, created_at: item.createdAt })));
}));

app.get('/api/subjects', requireAuth, asyncRoute(async (req, res) => {
  const subjects = await Subject.find({ userId: req.user._id }).sort({ name: 1 });
  res.json(await Promise.all(subjects.map(subjectJson)));
}));

app.post('/api/subjects', requireAuth, asyncRoute(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const target = Number(req.body.attendance_target ?? 75);
  if (!name) return sendError(res, 'Subject name is required.');
  if (!Number.isFinite(target) || target <= 0 || target > 100) return sendError(res, 'Attendance target must be between 1 and 100.');
  try {
    const subject = await Subject.create({ userId: req.user._id, name, attendanceTarget: target });
    res.status(201).json(await subjectJson(subject));
  } catch (error) {
    if (error.code === 11000) return sendError(res, 'That subject already exists.', 409, 'CONFLICT');
    throw error;
  }
}));

app.delete('/api/subjects/:subjectId', requireAuth, asyncRoute(async (req, res) => {
  const subject = await Subject.findOneAndDelete({ _id: req.params.subjectId, userId: req.user._id });
  if (!subject) return sendError(res, 'Subject not found.', 404, 'NOT_FOUND');
  await ClassSession.deleteMany({ subjectId: subject._id, userId: req.user._id });
  res.status(204).end();
}));

app.get('/api/subjects/:subjectId/sessions', requireAuth, asyncRoute(async (req, res) => {
  const subject = await Subject.findOne({ _id: req.params.subjectId, userId: req.user._id });
  if (!subject) return sendError(res, 'Subject not found.', 404, 'NOT_FOUND');
  const sessions = await ClassSession.find({ subjectId: subject._id, userId: req.user._id }).sort({ sessionDate: 1 }).lean();
  res.json(sessions.map(item => ({ id: String(item._id), session_date: item.sessionDate, status: item.status })));
}));

app.post('/api/subjects/:subjectId/sessions', requireAuth, asyncRoute(async (req, res) => {
  const subject = await Subject.findOne({ _id: req.params.subjectId, userId: req.user._id });
  if (!subject) return sendError(res, 'Subject not found.', 404, 'NOT_FOUND');
  const { session_date: sessionDate, status } = req.body;
  if (!validDate(sessionDate) || !['attended', 'absent', 'cancelled'].includes(status)) return sendError(res, 'Enter a valid date and attendance status.');
  try {
    const item = await ClassSession.create({ userId: req.user._id, subjectId: subject._id, sessionDate, status });
    res.status(201).json({ id: String(item._id), session_date: item.sessionDate, status: item.status });
  } catch (error) {
    if (error.code === 11000) return sendError(res, 'Attendance is already recorded for that date.', 409, 'CONFLICT');
    throw error;
  }
}));

app.patch('/api/sessions/:sessionId', requireAuth, asyncRoute(async (req, res) => {
  const status = req.body.status;
  if (!['attended', 'absent', 'cancelled'].includes(status)) return sendError(res, 'Choose a valid attendance status.');
  const item = await ClassSession.findOneAndUpdate({ _id: req.params.sessionId, userId: req.user._id }, { status }, { new: true });
  if (!item) return sendError(res, 'Attendance session not found.', 404, 'NOT_FOUND');
  res.json({ id: String(item._id), session_date: item.sessionDate, status: item.status });
}));

app.get('/api/tasks', requireAuth, asyncRoute(async (req, res) => {
  const items = await Assignment.find({ userId: req.user._id }).sort({ status: 1, dueDate: 1 });
  res.json(items.map(assignmentJson));
}));

app.post('/api/tasks', requireAuth, asyncRoute(async (req, res) => {
  const title = String(req.body.title || '').trim();
  const dueDate = req.body.due_date;
  const priority = req.body.priority || 'medium';
  if (!title || !validDate(dueDate)) return sendError(res, 'Task title and a valid due date are required.');
  if (!['low', 'medium', 'high'].includes(priority)) return sendError(res, 'Choose a valid priority.');
  const item = await Assignment.create({ userId: req.user._id, title, description: String(req.body.description || '').trim(), dueDate, priority });
  res.status(201).json(assignmentJson(item));
}));

app.patch('/api/tasks/:taskId', requireAuth, asyncRoute(async (req, res) => {
  const item = await Assignment.findOne({ _id: req.params.taskId, userId: req.user._id });
  if (!item) return sendError(res, 'Assignment not found.', 404, 'NOT_FOUND');
  const title = String(req.body.title ?? item.title).trim();
  const dueDate = req.body.due_date ?? item.dueDate;
  const priority = req.body.priority ?? item.priority;
  const status = req.body.status ?? item.status;
  if (!title || !validDate(dueDate) || !['low', 'medium', 'high'].includes(priority) || !['pending', 'completed'].includes(status)) return sendError(res, 'Assignment details are invalid.');
  item.title = title;
  item.description = String(req.body.description ?? item.description).trim();
  item.dueDate = dueDate;
  item.priority = priority;
  item.status = status;
  await item.save();
  res.json(assignmentJson(item));
}));

app.delete('/api/tasks/:taskId', requireAuth, asyncRoute(async (req, res) => {
  const item = await Assignment.findOneAndDelete({ _id: req.params.taskId, userId: req.user._id });
  if (!item) return sendError(res, 'Assignment not found.', 404, 'NOT_FOUND');
  res.status(204).end();
}));

app.get('/api/calendar', requireAuth, asyncRoute(async (req, res) => {
  const items = await CalendarEvent.find({ userId: req.user._id }).sort({ eventDate: 1 });
  res.json(items.map(eventJson));
}));

app.post('/api/calendar', requireAuth, asyncRoute(async (req, res) => {
  const title = String(req.body.title || '').trim();
  const eventDate = req.body.event_date;
  const eventType = req.body.event_type;
  if (!title || !validDate(eventDate) || !['holiday', 'ca'].includes(eventType)) return sendError(res, 'Enter a title, valid date, and event type.');
  const item = await CalendarEvent.create({ userId: req.user._id, title, eventDate, eventType, description: String(req.body.description || '').trim() });
  res.status(201).json(eventJson(item));
}));

app.patch('/api/calendar/:eventId', requireAuth, asyncRoute(async (req, res) => {
  const item = await CalendarEvent.findOne({ _id: req.params.eventId, userId: req.user._id });
  if (!item) return sendError(res, 'Calendar event not found.', 404, 'NOT_FOUND');
  const title = String(req.body.title ?? item.title).trim();
  const eventDate = req.body.event_date ?? item.eventDate;
  const eventType = req.body.event_type ?? item.eventType;
  if (!title || !validDate(eventDate) || !['holiday', 'ca'].includes(eventType)) return sendError(res, 'Calendar event details are invalid.');
  item.title = title;
  item.eventDate = eventDate;
  item.eventType = eventType;
  item.description = String(req.body.description ?? item.description).trim();
  await item.save();
  res.json(eventJson(item));
}));

app.delete('/api/calendar/:eventId', requireAuth, asyncRoute(async (req, res) => {
  const item = await CalendarEvent.findOneAndDelete({ _id: req.params.eventId, userId: req.user._id });
  if (!item) return sendError(res, 'Calendar event not found.', 404, 'NOT_FOUND');
  res.status(204).end();
}));

app.get('/api/dashboard', requireAuth, asyncRoute(async (req, res) => {
  const [subjects, tasks, events] = await Promise.all([
    Subject.find({ userId: req.user._id }).sort({ name: 1 }),
    Assignment.find({ userId: req.user._id }).sort({ dueDate: 1 }),
    CalendarEvent.find({ userId: req.user._id, eventDate: { $gte: new Date().toISOString().slice(0, 10) } }).sort({ eventDate: 1 }).limit(5)
  ]);
  const subjectsWithAttendance = await Promise.all(subjects.map(subjectJson));
  const pending = tasks.filter(item => item.status === 'pending');
  const attendance = subjectsWithAttendance.reduce((total, item) => ({ attended: total.attended + item.attendance.attended, held: total.held + item.attendance.held }), { attended: 0, held: 0 });
  const today = new Date().toISOString().slice(0, 10);
  res.json({
    subject_count: subjects.length,
    overall_attendance: attendance.held ? attendance.attended / attendance.held * 100 : null,
    pending_assignments: pending.length,
    overdue_assignments: pending.filter(item => item.dueDate < today).length,
    subjects: subjectsWithAttendance,
    upcoming: pending.slice(0, 5).map(assignmentJson),
    notifications: events.map(eventJson)
  });
}));

if (isProduction) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => req.method === 'GET' && !req.path.startsWith('/api/')
    ? res.sendFile(path.join(clientDist, 'index.html'))
    : next());
}

app.use((error, _req, res, _next) => {
  if (error?.name === 'CastError' || error?.name === 'ValidationError') return sendError(res, 'The submitted data is invalid.');
  console.error('Request failed:', error?.message || error);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' } });
});

await connectDatabase(mongoUri);
const host = isProduction ? '0.0.0.0' : '127.0.0.1';
app.listen(port, host, () => console.log(`CampusPulse API listening on ${host}:${port}`));
