/**
 * Simplified utility functions for currency formatting.
 * Multi-currency support has been disabled for the current version.
 */

/**
 * Formats a number as a currency string (Fixed to AUD/$ for MVP).
 * @param value The amount to format.
 * @returns A formatted currency string.
 */
export function formatCurrency(value: number | null | undefined): string {
    if (value === null || value === undefined || isNaN(value)) return '$0.00';
    
    try {
        return new Intl.NumberFormat('en-AU', {
            style: 'currency',
            currency: 'AUD',
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
