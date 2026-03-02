/**
 * Simplified utility functions for currency formatting.
 * Multi-currency support has been disabled for the current version.
 */

export const SUPPORTED_CURRENCIES = [
  { code: 'AUD', label: 'Australian Dollar (AUD)' },
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'NZD', label: 'NZ Dollar (NZD)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'EUR', label: 'Euro (EUR)' },
];

/**
 * Formats a number as a currency string (Fixed to AUD/$ for MVP).
 * @param value The amount to format.
 * @param currency Optional currency code (defaults to AUD).
 * @returns A formatted currency string.
 */
export function formatCurrency(value: number | null | undefined, currency: string = 'AUD'): string {
    if (value === null || value === undefined || isNaN(value)) return '$0.00';
    
    try {
        return new Intl.NumberFormat('en-AU', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value);
    } catch (e) {
        return `$${value.toFixed(2)}`;
    }
}

/**
 * Legacy stubs kept for compatibility with components that previously used conversions.
 */
export function convertCurrency(amount: number): number {
    return amount;
}

export function getExchangeRate(): number {
    return 1;
}
