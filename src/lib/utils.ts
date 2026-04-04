// src/lib/utils.ts

export function formatPrice(amount: number, currency = 'PHP'): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
}

export function generateOrderCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'AST-';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function getStockLabel(qty: number): { label: string; color: string } {
  if (qty <= 0)  return { label: 'Out of Stock',   color: 'text-red-500' };
  if (qty <= 5)  return { label: `Only ${qty} left`, color: 'text-orange-500' };
  if (qty <= 10) return { label: 'Low Stock',       color: 'text-yellow-600' };
  return { label: 'In Stock', color: 'text-green-600' };
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export const PAYMENT_INSTRUCTIONS = {
  GCash: {
    title: 'GCash Payment',
    steps: [
      `Send payment to: ${process.env.NEXT_PUBLIC_GCASH_NUMBER || '09XX-XXX-XXXX'} (${process.env.NEXT_PUBLIC_GCASH_NAME || 'AST3R Fashion'})`,
      'Take a screenshot of your successful payment',
      'Upload the screenshot below',
      'Click Submit Order',
    ],
  },
  bank: {
    title: 'Bank Transfer',
    steps: [
      `Bank: ${process.env.NEXT_PUBLIC_BANK_NAME || 'BDO'}`,
      `Account Name: ${process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME || 'AST3R Fashion'}`,
      `Account Number: ${process.env.NEXT_PUBLIC_BANK_ACCOUNT_NUMBER || '0000-0000-0000'}`,
      'Transfer your total amount and upload proof below',
    ],
  },
  COD: {
    title: 'Cash on Delivery',
    steps: [
      'Pay in cash upon delivery',
      'Have the exact amount ready',
      'Our rider will provide a receipt upon delivery',
    ],
  },
};
