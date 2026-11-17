import { MONEY_COLUMNS, money, optMoney, netIncome } from '../finance.js';

export default function PropertyRow({ property: p, onEdit, onDelete }) {
  const net = netIncome(p);
  return (
    <tr>
      <td>{p.propertyId}</td>
      <td>{p.address}</td>
      {MONEY_COLUMNS.map((col) => (
        <td key={col.field} className="num">
          {col.optional ? optMoney(p[col.field]) : money.format(p[col.field])}
        </td>
      ))}
      <td className={`num net-cell ${net < 0 ? 'loss' : 'gain'}`}>{money.format(net)}</td>
      <td className="row-actions">
        <button onClick={() => onEdit(p)}>Edit</button>
        <button className="danger" onClick={() => onDelete(p)}>Delete</button>
      </td>
    </tr>
  );
}
