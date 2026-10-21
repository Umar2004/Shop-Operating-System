import { toast } from 'react-toastify';
import { api } from '../api/client';

// Saves an invoice edit. If the edit leaves the customer having paid more than they owe, the server answers
// REFUND_REQUIRED: overpayments are handed back, never kept as credit, so ask before saving with the refund.
// `confirm` is the callback-style confirm from useConfirmDialog; `onSaved` runs after a successful save.
export async function saveInvoiceEdit(invoiceId, payload, confirm, onSaved) {
  try {
    await api.updateInvoice(invoiceId, payload);
    toast.success('Invoice updated successfully');
    onSaved();
  } catch (err) {
    if (err.data?.code !== 'REFUND_REQUIRED') {
      toast.error(err.message);
      return;
    }
    const refund = Number(err.data.refund || 0).toFixed(2);
    confirm(`${err.message}. Give ${refund} back to the customer in cash now and save the change?`, async () => {
      try {
        await api.updateInvoice(invoiceId, { ...payload, refundExcess: true, refundMethod: 'CASH' });
        toast.success(`Invoice updated. Refund of ${refund} recorded: hand it to the customer.`);
        onSaved();
      } catch (retryErr) {
        toast.error(retryErr.message);
      }
    });
  }
}
