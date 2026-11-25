/** Every number shown by the app (result counters, ayah / hadith / page numbers, percentages) is written with English digits 0-9, by the owner's request. */
export const toAr = (n: number | string) => String(n).replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
export const GRADE_KEY: Record<string, string> = { صح: 'صحيح', ح: 'حسن', ض: 'ضعيف', 'صح ح': 'صحيح، حسن' };
