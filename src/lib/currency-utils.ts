
/**
 * Utility functions for currency management and conversion.
 */

export const SUPPORTED_CURRENCIES = [
    { code: 'AUD', symbol: '$', label: 'Australian Dollar (AUD)' },
    { code: 'NZD', symbol: '$', label: 'New Zealand Dollar (NZD)' },
    { code: 'USD', symbol: '$', label: 'US Dollar (USD)' },
    { code: 'EUR', symbol: '€', label: 'Euro (EUR)' },
    { code: 'GBP', symbol: '£', label: 'British Pound (GBP)' },
];

/**
 * Formats a number as a currency string.
 * @param value The amount to format.
 * @param currencyCode The currency code (e.g., 'AUD').
 * @returns A formatted currency string.
 */
export function formatCurrency(value: number | null | undefined, currencyCode: string = 'AUD'): string {
    if (value === null || value === undefined || isNaN(value)) return '$0.00';
    
    return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

/**
 * Placeholder for live currency conversion.
 * In a production app, this would fetch from an API like fixer.io or similar.
 */
export function convertCurrency(amount: number, fromCurrency: string, toCurrency: string): number {
    if (fromCurrency === toCurrency) return amount;
    
    // Mock rates for MVP - these would ideally be dynamic
    const rates: Record<string, number> = {
        'AUD': 1,
        'NZD': 1.08, // NZD is slightly weaker than AUD
        'USD': 0.65, // AUD is weaker than USD
        'EUR': 0.60,
    };

    const fromRate = rates[fromCurrency] || 1;
    const toRate = rates[toCurrency] || 1;

    // Convert from source to AUD base, then to target
    const inAud = amount / fromRate;
    return inAud * toRate;
}
