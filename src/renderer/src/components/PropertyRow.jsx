import { ICONS } from '../icons.jsx';
import { MONEY_COLUMNS, money, optMoney, netIncome, netFormula } from '../finance.js';
import { useT } from '../i18n.jsx';

export default function PropertyRow({ property: p, onEdit, onDelete }) {
  const t = useT();
  const net = netIncome(p);
  return (
    <tr>
      <td>{p.address}</td>
      {MONEY_COLUMNS.map((col) => (
        <td key={col.field} className="num">
          {col.optional ? optMoney(p[col.field]) : money.format(p[col.field])}
        </td>
      ))}
      <td className={`num net-cell ${net < 0 ? 'loss' : 'gain'}`} title={netFormula(p, t, net)}>{money.format(net)}</td>
      <td className="row-actions">
        <button type="button" className="icon-btn" onClick={() => onEdit(p)}
          title={t('Edit')} aria-label={t('Edit')}>{ICONS.edit}</button>
        <button type="button" className="icon-btn danger" onClick={() => onDelete(p)}
          title={t('Delete')} aria-label={t('Delete')}>{ICONS.trash}</button>
      </td>
    </tr>
  );
}
