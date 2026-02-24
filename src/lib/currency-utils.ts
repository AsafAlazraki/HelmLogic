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
 * Static mock rates for MVP. 
 * In a production app, these would ideally be dynamic.
 */
export const EXCHANGE_RATES: Record<string, number> = {
    'AUD': 1,
    'NZD': 1.08, // 1 AUD = 1.08 NZD (Approx)
    'USD': 0.65, // 1 AUD = 0.65 USD (Approx)
    'EUR': 0.60, // 1 AUD = 0.60 EUR (Approx)
    'GBP': 0.52, // 1 AUD = 0.52 GBP (Approx)
};

/**
 * Formats a number as a currency string.
 * @param value The amount to format.
 * @param currencyCode The currency code (e.g., 'AUD').
 * @returns A formatted currency string.
 */
export function formatCurrency(value: number | null | undefined, currencyCode: string = 'AUD'): string {
    if (value === null || value === undefined || isNaN(value)) return '$0.00';
    
    try {
        return new Intl.NumberFormat('en-AU', {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value);
    } catch (e) {
        // Fallback for unsupported or invalid currency codes
        return `${currencyCode} ${value.toFixed(2)}`;
    }
}

/**
 * Converts an amount between currencies using mock rates.
 */
export function convertCurrency(amount: number, fromCurrency: string, toCurrency: string): number {
    if (fromCurrency === toCurrency) return amount;
    
    const fromRate = EXCHANGE_RATES[fromCurrency] || 1;
    const toRate = EXCHANGE_RATES[toCurrency] || 1;

    // Convert from source to AUD base, then to target
    // Logic: base_amount = amount / rate_relative_to_aud
    const inAud = amount / fromRate;
    return inAud * toRate;
}

/**
 * Gets the direct exchange rate between two currencies.
 * Returns how much of 'to' you get for 1 of 'from'.
 */
export function getExchangeRate(fromCurrency: string, toCurrency: string): number {
    if (fromCurrency === toCurrency) return 1;
    const fromRate = EXCHANGE_RATES[fromCurrency] || 1;
    const toRate = EXCHANGE_RATES[toCurrency] || 1;
    return toRate / fromRate;
}
