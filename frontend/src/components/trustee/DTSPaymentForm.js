import React, { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { CreditCard, Loader2 } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { toast } from '../../utils/toast';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import { cardElementOptions } from '../../pages/trusteePageConstants';

/**
 * DTS (Door Tag System) PaymentForm — extracted from TrusteePage.js
 * (Feb 2026 monolith reduction). Renders the Stripe card-collection form
 * for a single DTS task, hits /api/stripe/create-setup-intent + saves the
 * resulting payment_method to /api/dts/tasks/{id}/payment-method.
 *
 * Props:
 *   task: { id }
 *   onPaymentSaved({last4, exp, name}) — callback after successful save
 *   getAuthHeaders() — from useAuth, returns { headers: { Authorization } }
 */
export const DTSPaymentForm = ({ task, onPaymentSaved, getAuthHeaders }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [cardholderName, setCardholderName] = useState('');
  const [billingZip, setBillingZip] = useState('');
  const [processing, setProcessing] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || !cardholderName) return;

    setProcessing(true);
    try {
      // Create setup intent
      const setupRes = await apiClient.post(`${API_URL}/stripe/create-setup-intent`, {}, getAuthHeaders());
      const { client_secret } = setupRes.data;

      // Confirm card setup
      const { setupIntent, error } = await stripe.confirmCardSetup(client_secret, {
        payment_method: {
          card: elements.getElement(CardElement),
          billing_details: {
            name: cardholderName,
            address: { postal_code: billingZip || undefined },
          },
        },
      });

      if (error) {
        toast.error(error.message);
        setProcessing(false);
        return;
      }

      // Get card details from the payment method
      const paymentMethod = await stripe.retrievePaymentMethod(setupIntent.payment_method);
      const card = paymentMethod.paymentMethod?.card;

      // Save payment method to task
      await apiClient.post(`${API_URL}/dts/tasks/${task.id}/payment-method`, {
        task_id: task.id,
        payment_method_id: setupIntent.payment_method,
        card_last4: card?.last4 || '****',
        card_exp_month: card?.exp_month || 12,
        card_exp_year: card?.exp_year || 2030,
        card_holder_name: cardholderName,
      }, getAuthHeaders());

      onPaymentSaved({
        last4: card?.last4 || '****',
        exp: `${card?.exp_month}/${String(card?.exp_year).slice(-2)}`,
        name: cardholderName,
      });
    } catch (err) {
      console.error('Payment error:', err);
      toast.error(err.response?.data?.detail || 'Failed to save payment method');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label className="text-[var(--t4)]">Cardholder Name <span className="text-red-400">*</span></Label>
        <Input
          className="input-field"
          placeholder="Name on card"
          value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value)}
          required
          data-testid="cardholder-name-input"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-[var(--t4)]">Card Number, Expiry & CVC <span className="text-red-400">*</span></Label>
        <div className="p-4 rounded-xl bg-[var(--s)] border border-[var(--b)]" style={{ minHeight: 48 }}>
          <CardElement
            options={cardElementOptions}
            onChange={(e) => setCardComplete(e.complete)}
          />
        </div>
        <p className="text-xs text-[var(--t5)]">Enter your full card number, expiration date (MM/YY), and security code (CVC)</p>
      </div>

      <div className="space-y-2">
        <Label className="text-[var(--t4)]">Billing ZIP Code <span className="text-red-400">*</span></Label>
        <Input
          className="input-field"
          placeholder="e.g., 92101"
          value={billingZip}
          onChange={(e) => setBillingZip(e.target.value.replace(/\D/g, '').slice(0, 10))}
          data-testid="billing-zip-input"
        />
      </div>

      <div className="rounded-xl p-3 bg-[var(--blbg)] border border-[var(--bl3)]/20">
        <p className="text-sm text-[var(--bl3)]">
          <strong>Important:</strong> Your card will NOT be charged now. It will only be charged upon verified transition.
        </p>
      </div>

      <Button
        type="submit"
        className="gold-button w-full"
        disabled={!stripe || processing || !cardholderName || !cardComplete}
        data-testid="save-payment-method-button"
      >
        {processing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Saving Payment Method...
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4 mr-2" />
            Save Payment Method
          </>
        )}
      </Button>
    </form>
  );
};
