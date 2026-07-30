// departmentHeadFilter — pure pre-filter behind the DepartmentsPage
// «Руководитель» select.
//
// Type contract (the bug this encodes against): RowOpenPage re-applies the
// same filter state generically with a STRICT compare
// (`row.head_user_id !== value`) and skips only `null`/`''` values. Rows
// carry numeric `head_user_id` (or null for "no head"), so:
//
//   - real-user option values MUST be numbers — a String(user_id) value
//     strict-compares unequal to every numeric row and empties the list;
//   - the "Без руководителя" option MUST be the `null` sentinel below — a
//     string sentinel would hit the same strict compare, while `null` is
//     skipped by RowOpenPage, leaving this pre-filter the sole authority
//     for the no-head case.
//
// `''` (the "Все руководители" empty option) and `undefined` (state key not
// yet registered — the head filter is spliced into the filter list only
// after users load) both mean "filter not set".

export const NO_HEAD_FILTER = null;

export function filterDepartmentsByHead(departments, value) {
  if (value === '' || value === undefined) return departments;
  if (value === NO_HEAD_FILTER) {
    return departments.filter((d) => d.head_user_id == null);
  }
  return departments.filter((d) => d.head_user_id === value);
}
