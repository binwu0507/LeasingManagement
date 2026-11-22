import { Fragment, useState } from 'react';
import PropertyRow from './PropertyRow.jsx';
import { MONEY_COLUMNS, money, annualTotals, netIncome, netFormula } from '../finance.js';
import { useT } from '../i18n.jsx';

const SORT_VALUE = { net: netIncome };

export default function PropertyTable({ properties, onEdit, onDelete, onPayments, onRepairs }) {
  const t = useT();
  const [sort, setSort] = useState({ key: null, dir: 1 });

  // asc -> desc -> original order
  const toggleSort = (key) =>
    setSort((s) => (s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : { key: null, dir: 1 }));
  const arrow = (key) => (sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');
  const ariaSort = (key) => (sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none');
  const header = (key, label) => (
    <th className="num sortable" aria-sort={ariaSort(key)}>
      <button type="button" className="link" onClick={() => toggleSort(key)}>{t(label)}{arrow(key)}</button>
    </th>
  );

  if (properties.length === 0) {
    return <p id="empty-msg">{t('No properties yet. Click "Add Property…" to add one to this year.')}</p>;
  }

  const totals = annualTotals(properties);

  const valueOf = (p) => (SORT_VALUE[sort.key] ? SORT_VALUE[sort.key](p) : p[sort.key]);
  const shown = sort.key
    ? [...properties].sort((a, b) => {
        const x = valueOf(a), y = valueOf(b);
        const blankX = x === null || x === undefined, blankY = y === null || y === undefined;
        if (blankX || blankY) {
          return blankX === blankY ? 0 : blankX ? 1 : -1; // blanks always last
        }
        return (Number(x) - Number(y)) * sort.dir;
      })
    : properties;

  return (
    <table>
      <thead>
        <tr>
          <th>{t('Address')}</th>
          {MONEY_COLUMNS.map((col) => <Fragment key={col.field}>{header(col.field, col.header)}</Fragment>)}
          {header('net', 'Net / yr')}
          <th>{t('Actions')}</th>
        </tr>
      </thead>
      <tbody>
        {shown.map((p) => (
          <PropertyRow key={p.id} property={p} onEdit={onEdit} onDelete={onDelete} onPayments={onPayments} onRepairs={onRepairs} />
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>{t('Annual totals')}</td>
          {MONEY_COLUMNS.map((col) => (
            <td key={col.field} className="num">{money.format(totals[col.field])}</td>
          ))}
          <td className={`num net-cell ${totals.net < 0 ? 'loss' : 'gain'}`} title={netFormula(totals, t, totals.net)}>
            {money.format(totals.net)}
          </td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}
