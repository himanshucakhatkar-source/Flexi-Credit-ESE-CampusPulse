import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const owner = { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true };

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, default: null },
  role: { type: String, enum: ['student', 'admin'], default: 'student' }
}, { timestamps: true });

const subjectSchema = new Schema({
  userId: owner,
  name: { type: String, required: true, trim: true, maxlength: 100 },
  attendanceTarget: { type: Number, default: 75, min: 1, max: 100 }
}, { timestamps: true });
subjectSchema.index({ userId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

const sessionSchema = new Schema({
  userId: owner,
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  sessionDate: { type: String, required: true },
  status: { type: String, enum: ['attended', 'absent', 'cancelled'], required: true }
}, { timestamps: true });
sessionSchema.index({ subjectId: 1, sessionDate: 1 }, { unique: true });
sessionSchema.index({ userId: 1, subjectId: 1 });

const assignmentSchema = new Schema({
  userId: owner,
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, default: '', maxlength: 2000 },
  dueDate: { type: String, required: true },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  status: { type: String, enum: ['pending', 'completed'], default: 'pending' }
}, { timestamps: true });
assignmentSchema.index({ userId: 1, dueDate: 1, status: 1 });

const calendarEventSchema = new Schema({
  userId: owner,
  title: { type: String, required: true, trim: true, maxlength: 140 },
  eventDate: { type: String, required: true },
  eventType: { type: String, enum: ['holiday', 'ca'], required: true },
  description: { type: String, default: '', maxlength: 2000 }
}, { timestamps: true });
calendarEventSchema.index({ userId: 1, eventDate: 1 });

export const User = model('User', userSchema);
export const Subject = model('Subject', subjectSchema);
export const ClassSession = model('ClassSession', sessionSchema);
export const Assignment = model('Assignment', assignmentSchema);
export const CalendarEvent = model('CalendarEvent', calendarEventSchema);
