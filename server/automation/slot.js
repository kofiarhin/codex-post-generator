'use strict';

const ZONE = 'Europe/London';
function slotAt(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const hour = Number(parts.hour);
  if (hour !== 6 && hour !== 18) throw new Error('Outside permitted 06:00/18:00 UK slot');
  return { date: `${parts.year}-${parts.month}-${parts.day}`, slot: hour === 6 ? 'morning' : 'evening' };
}
module.exports = { slotAt, ZONE };
