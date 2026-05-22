export type DailyRunSchedule = {
  time: string;
  timezone: string;
};

export type RunSummary = {
  status: string;
  startedAt?: number;
  finishedAt?: number;
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

type ParsedTime = {
  hour: number;
  minute: number;
};

const timeFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

const getPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes, fallback = "0"): string =>
  parts.find((part) => part.type === type)?.value ?? fallback;

export const parseDailyRunTime = (value: string): ParsedTime | null => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;

  return { hour, minute };
};

export const getZonedParts = (date: Date, timeZone: string): ZonedParts => {
  const parts = timeFormatter(timeZone).formatToParts(date);
  return {
    year: Number(getPart(parts, "year")),
    month: Number(getPart(parts, "month")),
    day: Number(getPart(parts, "day")),
    hour: Number(getPart(parts, "hour")),
    minute: Number(getPart(parts, "minute"))
  };
};

export const getDateKeyInTimezone = (date: Date, timeZone: string): string => {
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
};

export const getMinutesInTimezone = (date: Date, timeZone: string): number => {
  const parts = getZonedParts(date, timeZone);
  return parts.hour * 60 + parts.minute;
};

export const isRunInProgress = (run: RunSummary): boolean => run.status === "queued" || run.status === "running";

export const didRunToday = (run: RunSummary, dateKey: string, timeZone: string): boolean => {
  if (run.startedAt && getDateKeyInTimezone(new Date(run.startedAt), timeZone) === dateKey) return true;
  if (run.finishedAt && getDateKeyInTimezone(new Date(run.finishedAt), timeZone) === dateKey) return true;
  return false;
};

export const shouldTriggerDailyRun = (runs: RunSummary[], now: Date, schedule: DailyRunSchedule): boolean => {
  const parsedTime = parseDailyRunTime(schedule.time);
  if (!parsedTime) return false;

  const nowMinutes = getMinutesInTimezone(now, schedule.timezone);
  const scheduledMinutes = parsedTime.hour * 60 + parsedTime.minute;
  if (nowMinutes < scheduledMinutes) return false;

  if (runs.some(isRunInProgress)) return false;

  const todayKey = getDateKeyInTimezone(now, schedule.timezone);
  if (runs.some((run) => didRunToday(run, todayKey, schedule.timezone))) return false;

  return true;
};

export const formatDailyRunSchedule = (schedule: DailyRunSchedule): string => {
  const parsedTime = parseDailyRunTime(schedule.time);
  if (!parsedTime) return "disabled";

  return `${String(parsedTime.hour).padStart(2, "0")}:${String(parsedTime.minute).padStart(2, "0")} ${schedule.timezone}`;
};
