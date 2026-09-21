export type LiteratureScheduleFrequency = "DAILY" | "WEEKLY" | "MONTHLY";

export interface LiteratureCalendarRecord {
  calendarId: string;
  searchProfileKey: string;
  frequency: LiteratureScheduleFrequency;
  executionTime: string;
  timezone: string;
  executionDay?: string;
  dayOfMonth?: number;
  graceMinutes?: number;
  catchUpHours?: number;
  missedSearchDetection?: boolean;
  status?: string;
}

export interface ScheduleOccurrenceAssessment {
  action: "NOT_DUE" | "DUE" | "MISSED";
  scheduledFor?: Date;
  latenessMinutes?: number;
  missedThresholdExceeded?: boolean;
}

const DAY_INDEX: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "long",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    weekday: value("weekday").toUpperCase(),
  };
}

function zonedLocalToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  timeZone: string;
}): Date {
  let guess = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    0,
    0,
  );

  for (let i = 0; i < 2; i += 1) {
    const observed = localParts(new Date(guess), input.timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      0,
      0,
    );
    const desiredAsUtc = Date.UTC(
      input.year,
      input.month - 1,
      input.day,
      input.hour,
      input.minute,
      0,
      0,
    );
    guess += desiredAsUtc - observedAsUtc;
  }

  return new Date(guess);
}

function parseTime(value: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error("executionTime must use HH:MM.");
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function previousMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function latestScheduledLocalDate(
  record: LiteratureCalendarRecord,
  now: Date,
): { year: number; month: number; day: number } {
  const local = localParts(now, record.timezone);
  const time = parseTime(record.executionTime);

  if (record.frequency === "DAILY") {
    const candidate = zonedLocalToUtc({
      year: local.year,
      month: local.month,
      day: local.day,
      hour: time.hour,
      minute: time.minute,
      timeZone: record.timezone,
    });
    if (candidate <= now) return { year: local.year, month: local.month, day: local.day };
    const prior = new Date(Date.UTC(local.year, local.month - 1, local.day - 1));
    return {
      year: prior.getUTCFullYear(),
      month: prior.getUTCMonth() + 1,
      day: prior.getUTCDate(),
    };
  }

  if (record.frequency === "WEEKLY") {
    const target = DAY_INDEX[String(record.executionDay || "").toUpperCase()];
    if (target === undefined) throw new Error("Weekly schedule requires executionDay.");
    const current = DAY_INDEX[local.weekday];
    let delta = (current - target + 7) % 7;
    if (delta === 0) {
      const today = zonedLocalToUtc({
        year: local.year,
        month: local.month,
        day: local.day,
        hour: time.hour,
        minute: time.minute,
        timeZone: record.timezone,
      });
      if (today > now) delta = 7;
    }
    const date = new Date(Date.UTC(local.year, local.month - 1, local.day - delta));
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
  }

  const requestedDay = Math.max(1, Math.min(31, Number(record.dayOfMonth || 1)));
  let year = local.year;
  let month = local.month;
  let day = Math.min(requestedDay, daysInMonth(year, month));
  const candidate = zonedLocalToUtc({
    year,
    month,
    day,
    hour: time.hour,
    minute: time.minute,
    timeZone: record.timezone,
  });

  if (candidate > now) {
    const prior = previousMonth(year, month);
    year = prior.year;
    month = prior.month;
    day = Math.min(requestedDay, daysInMonth(year, month));
  }

  return { year, month, day };
}

export function assessScheduleOccurrence(
  record: LiteratureCalendarRecord,
  now = new Date(),
): ScheduleOccurrenceAssessment {
  if (String(record.status || "ACTIVE").toUpperCase() !== "ACTIVE") {
    return { action: "NOT_DUE" };
  }

  const localDate = latestScheduledLocalDate(record, now);
  const time = parseTime(record.executionTime);
  const scheduledFor = zonedLocalToUtc({
    ...localDate,
    hour: time.hour,
    minute: time.minute,
    timeZone: record.timezone,
  });
  const latenessMinutes = Math.floor((now.getTime() - scheduledFor.getTime()) / 60000);
  if (latenessMinutes < 0) return { action: "NOT_DUE" };

  const graceMinutes = Math.max(5, Number(record.graceMinutes || 90));
  const catchUpMinutes = Math.max(
    graceMinutes,
    Number(record.catchUpHours || 72) * 60,
  );

  if (latenessMinutes > catchUpMinutes) {
    return {
      action: "MISSED",
      scheduledFor,
      latenessMinutes,
      missedThresholdExceeded: true,
    };
  }

  return {
    action: "DUE",
    scheduledFor,
    latenessMinutes,
    missedThresholdExceeded: latenessMinutes > graceMinutes,
  };
}

export function profileDateWindow(input: {
  scheduledFor: Date;
  lookbackDays: number;
}): { dateFrom: string; dateTo: string } {
  const to = new Date(input.scheduledFor);
  const from = new Date(to.getTime() - Math.max(1, input.lookbackDays) * 86400000);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}
