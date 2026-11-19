import { MONEY_COLUMNS, money, optMoney, netIncome } from '../finance.js';
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
      <td className={`num net-cell ${net < 0 ? 'loss' : 'gain'}`}>{money.format(net)}</td>
      <td className="row-actions">
        <button onClick={() => onEdit(p)}>{t('Edit')}</button>
        <button className="danger" onClick={() => onDelete(p)}>{t('Delete')}</button>
      </td>
    </tr>
  );
}
