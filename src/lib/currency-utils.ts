
/**
 * Dynamic utility functions for currency formatting and conversion.
 * Now supports manual organizational exchange rates.
 */

export const SUPPORTED_CURRENCIES = [
  { code: 'AUD', label: 'Australian Dollar (AUD)' },
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'NZD', label: 'NZ Dollar (NZD)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'CAD', label: 'Canadian Dollar (CAD)' },
  { code: 'JPY', label: 'Japanese Yen (JPY)' },
];

/**
 * Formats a number as a currency string.
 * @param value The amount to format.
 * @param currency ISO currency code.
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
        return `${currency} ${value.toFixed(2)}`;
    }
}

/**
 * Converts an amount from one currency to another using provided rates.
 */
export function convertCurrency(
    amount: number, 
    fromCurrency: string, 
    toCurrency: string, 
    rates: Record<string, number> = {}
): number {
    if (fromCurrency === toCurrency) return amount;
    
    // All rates in the system are relative to the organization's base currency (typically AUD)
    // To convert from A to B: (Amount / RateA) * RateB
    
    const fromRate = fromCurrency === 'AUD' ? 1 : (rates[fromCurrency] || 1);
    const toRate = toCurrency === 'AUD' ? 1 : (rates[toCurrency] || 1);
    
    return (amount / fromRate) * toRate;
}
