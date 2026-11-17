import PropertyRow from './PropertyRow.jsx';
import { MONEY_COLUMNS, money, annualTotals } from '../finance.js';

export default function PropertyTable({ properties, onEdit, onDelete }) {
  if (properties.length === 0) {
    return <p id="empty-msg">No properties yet. Click "Add House" to create one.</p>;
  }

  const totals = annualTotals(properties);

  return (
    <table>
      <thead>
        <tr>
          <th>Property ID</th>
          <th>Address</th>
          {MONEY_COLUMNS.map((col) => (
            <th key={col.field} className="num">{col.header}</th>
          ))}
          <th className="num">Net / yr</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {properties.map((p) => (
          <PropertyRow key={p.id} property={p} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={2}>Annual totals</td>
          {MONEY_COLUMNS.map((col) => (
            <td key={col.field} className="num">{money.format(totals[col.field])}</td>
          ))}
          <td className={`num net-cell ${totals.net < 0 ? 'loss' : 'gain'}`}>
            {money.format(totals.net)}
          </td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}
