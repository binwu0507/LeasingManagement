import { useT } from '../i18n.jsx';
import CollapsibleCard from './CollapsibleCard.jsx';
import NameListAdmin from './NameListAdmin.jsx';

const BANK_TEXT = {
  heading: 'Receiving Banks', empty: 'No receiving banks yet.', name: 'Receiving bank name',
  add: 'Add bank', edit: 'Edit bank', del: 'Delete bank',
  added: 'Receiving bank added.', saved: 'Receiving bank saved.', deleted: 'Receiving bank deleted.',
  exists: 'That receiving bank already exists.', confirm: 'Delete the receiving bank "{name}"?'
};
const METHOD_TEXT = {
  heading: 'Payment Methods', empty: 'No payment methods yet.', name: 'Payment method name',
  add: 'Add method', edit: 'Edit method', del: 'Delete method',
  added: 'Payment method added.', saved: 'Payment method saved.', deleted: 'Payment method deleted.',
  exists: 'That payment method already exists.', confirm: 'Delete the payment method "{name}"?'
};

/** Admin > Financial: the receiving banks and the payment methods. */
export default function FinancialAdmin() {
  const t = useT();
  return (
    <CollapsibleCard className="doc-types" title={t('Financial')}>
      <div className="financial-lists">
        <NameListAdmin api={window.api.receivingBanks} text={BANK_TEXT} />
        <NameListAdmin api={window.api.paymentMethods} text={METHOD_TEXT} />
      </div>
    </CollapsibleCard>
  );
}
