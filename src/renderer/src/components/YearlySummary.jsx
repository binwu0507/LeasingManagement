import { money, yearlySummary } from '../finance.js';
import { useT } from '../i18n.jsx';

export default function YearlySummary({ properties }) {
  const t = useT();
  if (properties.length === 0) {
    return null;
  }
  const { rentIncome, expenses, net } = yearlySummary(properties);

  return (
    <section id="summary">
      <h2>{t('Yearly Summary')}</h2>
      <dl>
        <dt>{t('Yearly rent income (including special income)')}</dt>
        <dd>{money.format(rentIncome)}</dd>
        <dt>{t('Yearly expenses (mortgage interest, HOA, tax, insurance, repairs)')}</dt>
        <dd>{money.format(-expenses)}</dd>
        <dt className="net">{t('Net income (yearly)')}</dt>
        <dd className={`net ${net < 0 ? 'loss' : 'gain'}`}>{money.format(net)}</dd>
      </dl>
    </section>
  );
}
