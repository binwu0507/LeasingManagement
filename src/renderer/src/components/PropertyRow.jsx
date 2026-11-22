import { Fragment } from 'react';
import { ICONS } from '../icons.jsx';
import { MONEY_COLUMNS, money, optMoney, netIncome, netFormula } from '../finance.js';
import { useT } from '../i18n.jsx';

export default function PropertyRow({ property: p, onEdit, onDelete, onPayments, onRepairs }) {
  const t = useT();
  const net = netIncome(p);
  return (
    <tr>
      <td>{p.address}</td>
      {MONEY_COLUMNS.map((col, i) => (
        <Fragment key={col.field}>
          <td className="num">{col.optional ? optMoney(p[col.field]) : money.format(p[col.field])}</td>
          {i === 0 && <td className="num" title={t('Days of the year not covered by a lease')}>{p.vacantDays}</td>}
        </Fragment>
      ))}
      <td className={`num net-cell ${net < 0 ? 'loss' : 'gain'}`} title={netFormula(p, t, net)}>{money.format(net)}</td>
      <td className="row-actions">
        <button type="button" className="icon-btn edit" onClick={() => onEdit(p)}
          title={t('Edit')} aria-label={t('Edit')}>{ICONS.edit}</button>
        <button type="button" className="icon-btn" onClick={() => onPayments(p)}
          title={t('Payments')} aria-label={t('Payments')}>{ICONS.payments}</button>
        <button type="button" className="icon-btn" onClick={() => onRepairs(p)}
          title={t('Repair cost')} aria-label={t('Repair cost')}>{ICONS.cost}</button>
        <button type="button" className="icon-btn danger" onClick={() => onDelete(p)}
          title={t('Delete')} aria-label={t('Delete')}>{ICONS.trash}</button>
      </td>
    </tr>
  );
}
