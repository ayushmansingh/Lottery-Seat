/* ============================================================
   Seat map data — transcribed from the office floor-plan image.
   Grid: 23 columns × 20 rows. Each seat occupies one cell.
   The lottery runs only on the "online" (Online Product) seats.
   ============================================================ */

const CATEGORIES = {
  online:   { label: 'Online Product' },
  catrev:   { label: 'Category & Revenue' },
  newlobs:  { label: 'New LoBs' },
  catalog:  { label: 'New LoBs – Catalog' },
  vinay:    { label: "Vinay's Span" },
  deepti:   { label: "Deepti's Span" },
  sme:      { label: 'SMEs' },
  mis:      { label: 'MIS' },
  hotels:   { label: 'Hotels' },
  sales:    { label: 'Sales' },
  mgr:      { label: 'Mgr / Director' },
  reserved: { label: 'Reserved' },
  visa:     { label: 'Visa' },
};

const LOTTERY_CAT = 'online';
const GRID_COLS = 23;
const GRID_ROWS = 20;

const SEATS = [];
function S(id, c, r, cat) { SEATS.push({ id, c, r, cat }); }
function rowS(firstNum, count, c0, r, cat) {
  for (let i = 0; i < count; i++) S('HS-' + (firstNum + i), c0 + i, r, cat);
}

/* ── Top band of desks ─────────────────────────────────────── */
S('Mgr/Dir-1', 3, 1, 'mgr');  S('Mgr/Dir-2', 4, 1, 'mgr');
S('HS-65', 3, 3, 'sales');    S('HS-66', 4, 3, 'sales');
S('HS-67', 6, 1, 'sales');    S('HS-70', 7, 1, 'sales');
S('HS-68', 6, 2, 'sales');    S('HS-71', 7, 2, 'sales');
S('HS-69', 6, 3, 'sales');
S('HS-72', 8, 1, 'sales');    S('HS-75', 9, 1, 'sales');
S('HS-73', 8, 2, 'sales');    S('HS-76', 9, 2, 'sales');
S('HS-74', 8, 3, 'sales');    S('HS-77', 9, 3, 'sales');
S('HS-78', 10, 1, 'sales');   S('HS-81', 11, 1, 'sales');
S('HS-79', 10, 2, 'sales');   S('HS-82', 11, 2, 'sales');
S('HS-80', 10, 3, 'sales');   S('HS-83', 11, 3, 'sales');
S('HS-84', 13, 1, 'sales');   S('HS-86', 14, 1, 'sales');
S('HS-85', 13, 2, 'sales');   S('HS-87', 14, 2, 'sales');
S('HS-88', 16, 1, 'sales');   S('HS-91', 17, 1, 'sales');
S('HS-89', 16, 2, 'sales');   S('HS-92', 17, 2, 'sales');
S('HS-90', 16, 3, 'sales');   S('HS-93', 17, 3, 'sales');
S('Mgr/Dir-3', 19, 1, 'mgr'); S('Mgr/Dir-4', 20, 1, 'mgr');
S('HS-94', 19, 3, 'sales');   S('HS-95', 20, 3, 'sales');

/* ── Left cluster ──────────────────────────────────────────── */
rowS(59, 6, 3, 5, 'vinay');
rowS(53, 6, 3, 7, 'vinay');
S('HS-47', 3, 8, 'online');   rowS(48, 5, 4, 8, 'vinay');
rowS(42, 4, 3, 10, 'online'); S('HS-46', 8, 10, 'online');
rowS(37, 4, 3, 11, 'online'); S('HS-41', 8, 11, 'online');
rowS(31, 3, 3, 13, 'catrev'); rowS(34, 3, 6, 13, 'online');
rowS(25, 6, 3, 14, 'catrev');
S('HS-19', 3, 16, 'sales');   S('HS-20', 4, 16, 'sales'); rowS(21, 4, 5, 16, 'catrev');
rowS(13, 6, 3, 17, 'catrev');
S('HS-9', 3, 19, 'newlobs');  S('HS-10', 4, 19, 'newlobs');
S('HS-11', 5, 19, 'catalog'); S('HS-12', 6, 19, 'catalog');
S('HS-5', 3, 20, 'sales');    rowS(6, 3, 4, 20, 'newlobs');

/* ── Middle cluster ────────────────────────────────────────── */
S('HS-96', 10, 5, 'deepti');  S('HS-97', 11, 5, 'deepti'); rowS(98, 3, 12, 5, 'sme');
rowS(101, 5, 10, 7, 'deepti');  rowS(106, 5, 10, 8, 'deepti');
rowS(111, 4, 10, 10, 'deepti'); rowS(115, 4, 10, 11, 'deepti');
rowS(119, 5, 10, 13, 'deepti'); rowS(124, 5, 10, 14, 'deepti');
rowS(129, 5, 10, 16, 'deepti'); rowS(134, 5, 10, 17, 'sales');
S('HS-139', 10, 19, 'sales'); S('HS-140', 11, 19, 'sales');
S('HS-141', 12, 19, 'mis');   S('HS-142', 13, 19, 'mis');
S('HS-143', 10, 20, 'mis');   rowS(144, 3, 11, 20, 'mis');

/* ── Right cluster ─────────────────────────────────────────── */
S('HS-147', 16, 5, 'sales'); S('HS-148', 16, 7, 'sales'); S('HS-149', 16, 8, 'sales');
S('HS-150', 17, 5, 'reserved'); S('HS-154', 18, 5, 'reserved');
S('HS-151', 17, 6, 'reserved'); S('HS-155', 18, 6, 'reserved');
S('HS-152', 17, 7, 'reserved'); S('HS-156', 18, 7, 'reserved');
S('HS-153', 17, 8, 'reserved'); S('HS-157', 18, 8, 'reserved');
rowS(158, 4, 16, 11, 'sme');
rowS(162, 4, 16, 13, 'hotels'); rowS(166, 4, 16, 14, 'hotels');
rowS(170, 4, 16, 16, 'hotels'); rowS(174, 4, 16, 17, 'hotels');
rowS(178, 4, 16, 19, 'hotels'); rowS(182, 4, 16, 20, 'hotels');

/* ── Far-right cluster ─────────────────────────────────────── */
S('HS-186', 22, 11, 'hotels'); S('HS-187', 23, 11, 'hotels');
rowS(188, 3, 21, 13, 'hotels'); rowS(191, 3, 21, 14, 'hotels');
S('HS-194', 21, 16, 'visa'); S('Mgr/Dir-5', 23, 16, 'mgr');
S('HS-195', 21, 17, 'visa'); S('Mgr/Dir-6', 23, 17, 'mgr');

/* ── Non-seat blocks ───────────────────────────────────────── */
const BLOCKS = [
  { label: 'Meeting Room · 10 seater', c1: 22, c2: 23, r1: 1, r2: 3, cls: 'room' },
  { label: 'Visa Desk',                c1: 22, c2: 23, r1: 19, r2: 20, cls: 'visadesk' },
  { label: 'Cubi-3', c1: 1, c2: 1, r1: 10, r2: 10, cls: 'cubi' },
  { label: 'Cubi-4', c1: 2, c2: 2, r1: 10, r2: 10, cls: 'cubi' },
  { label: 'Cubi-1', c1: 1, c2: 1, r1: 13, r2: 13, cls: 'cubi' },
  { label: 'Cubi-2', c1: 2, c2: 2, r1: 13, r2: 13, cls: 'cubi' },
];

const DESIGNATIONS = {
  'Prateek Singal':    'Vice President - Product Management',
  'Swati Dogra':       'Vice President - Product Management',
  'Sarvesh Sidhu':     'Lead Product Manager',
  'Richa Tudu':        'Product Manager',
  'Ayushman Singh':    'Associate Product Manager',
  'Rohit Ramapriya':   'Senior Product Analyst',
  'Ashish Kadian':     'Associate Director - Product Management',
  'Abhilasha Akhouri': 'Lead Product Manager',
  'Shivam Goel':       'Associate Product Manager',
  'Amol Sawant':       'Associate Product Manager',
  'Saket Dimri':       'Associate Product Manager',
  'Rashi Srivastava':  'Senior Product Analyst',
  'Sumaira Mehta':     'Senior Product Analyst',
  'Samridh Gupta':     'Senior Manager - Product Management',
  'Kiratpal Singh':    'Intern',
};

const DEFAULT_PARTICIPANTS = Object.keys(DESIGNATIONS);
