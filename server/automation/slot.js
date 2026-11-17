'use strict';

const ZONE = 'Europe/London';
function slotAt(date = new Date()) {
  const parts = londonParts(date);
  const hour = Number(parts.hour);
  if (hour !== 6 && hour !== 18) throw new Error('Outside permitted 06:00/18:00 UK slot');
  return { date: `${parts.year}-${parts.month}-${parts.day}`, slot: hour === 6 ? 'morning' : 'evening' };
}

function londonWeekday(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, weekday: 'short' }).format(date).toLowerCase().slice(0, 3);
}

// The timer may still fire at both slots; only configured slots and days generate or publish.
function slotScheduled(date, slot, schedule) {
  return schedule.slots.includes(slot) && schedule.days.includes(londonWeekday(date));
}

function londonParts(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return parts;
}

function londonDate(date = new Date()) {
  const parts = londonParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}
module.exports = { slotAt, londonDate, londonWeekday, slotScheduled, ZONE };
