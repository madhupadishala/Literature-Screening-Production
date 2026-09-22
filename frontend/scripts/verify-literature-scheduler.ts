import assert from "node:assert/strict";

import {
  assessScheduleOccurrence,
  profileDateWindow,
} from "../lib/literature/scheduler/schedule-engine";

const weekly = assessScheduleOccurrence(
  {
    calendarId: "CAL-WEEKLY",
    searchProfileKey: "SP-1",
    frequency: "WEEKLY",
    executionDay: "MONDAY",
    executionTime: "09:00",
    timezone: "Asia/Kolkata",
    graceMinutes: 90,
    catchUpHours: 72,
    status: "ACTIVE",
  },
  new Date("2026-09-21T04:15:00.000Z"),
);
assert.equal(weekly.action, "DUE");
assert.equal(weekly.scheduledFor?.toISOString(), "2026-09-21T03:30:00.000Z");
assert.equal(weekly.latenessMinutes, 45);
assert.equal(weekly.missedThresholdExceeded, false);

const catchup = assessScheduleOccurrence(
  {
    calendarId: "CAL-WEEKLY",
    searchProfileKey: "SP-1",
    frequency: "WEEKLY",
    executionDay: "MONDAY",
    executionTime: "09:00",
    timezone: "Asia/Kolkata",
    graceMinutes: 30,
    catchUpHours: 72,
    status: "ACTIVE",
  },
  new Date("2026-09-21T06:30:00.000Z"),
);
assert.equal(catchup.action, "DUE");
assert.equal(catchup.missedThresholdExceeded, true);

const missed = assessScheduleOccurrence(
  {
    calendarId: "CAL-DAILY",
    searchProfileKey: "SP-1",
    frequency: "DAILY",
    executionTime: "09:00",
    timezone: "Asia/Kolkata",
    catchUpHours: 2,
    status: "ACTIVE",
  },
  new Date("2026-09-21T08:30:00.000Z"),
);
assert.equal(missed.action, "MISSED");

const monthly = assessScheduleOccurrence(
  {
    calendarId: "CAL-MONTHLY",
    searchProfileKey: "SP-1",
    frequency: "MONTHLY",
    dayOfMonth: 31,
    executionTime: "09:00",
    timezone: "UTC",
    status: "ACTIVE",
  },
  new Date("2026-09-30T10:00:00.000Z"),
);
assert.equal(monthly.action, "DUE");
assert.equal(monthly.scheduledFor?.toISOString(), "2026-09-30T09:00:00.000Z");

const window = profileDateWindow({
  scheduledFor: new Date("2026-09-21T03:30:00.000Z"),
  lookbackDays: 7,
});
assert.deepEqual(window, { dateFrom: "2026-09-14", dateTo: "2026-09-21" });

console.log("Sprint 7 literature scheduler deterministic verification passed.");
