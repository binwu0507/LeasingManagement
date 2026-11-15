import { money, yearlySummary } from '../finance.js';

export default function YearlySummary({ properties }) {
  if (properties.length === 0) return null;
  const { rentIncome, expenses, net } = yearlySummary(properties);

  return (
    <section id="summary">
      <h2>Yearly Summary</h2>
      <dl>
        <dt>Yearly rent income</dt>
        <dd>{money.format(rentIncome)}</dd>
        <dt>Yearly expenses (mortgage, HOA, tax, insurance, repairs)</dt>
        <dd>{money.format(-expenses)}</dd>
        <dt className="net">Net income (yearly)</dt>
        <dd className={`net ${net < 0 ? 'loss' : 'gain'}`}>{money.format(net)}</dd>
      </dl>
    </section>
  );
}
