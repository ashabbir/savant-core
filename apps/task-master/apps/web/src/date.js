export function toDateTimeLocalValue(d) {
  if (!d) return '';
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const mm = pad(dt.getMonth() + 1);
  const dd = pad(dt.getDate());
  const hh = pad(dt.getHours());
  const min = pad(dt.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function toDateOnlyValue(d) {
  if (!d) return '';
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const mm = pad(dt.getMonth() + 1);
  const dd = pad(dt.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

export function dateOnlyToISO(dateStr) {
  if (!dateStr) return null;
  // Store at midnight local time
  const [y,m,d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m-1, d, 0, 0, 0);
  return dt.toISOString();
}
