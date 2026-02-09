
// services/addressService.ts
import { AddressSuggestion } from '../types.ts';

// A mock database of valid, serviceable addresses for the auto-completion feature.
const MOCK_SERVICEABLE_ADDRESSES: AddressSuggestion[] = [
    { street: '121 Elsia Dr', city: 'Hometown', state: 'CA', zip: '90210' },
    { street: '7258 Baldwin Ridge Rd', city: 'Hometown', state: 'CA', zip: '90210' },
    { street: '804 W 13th St', city: 'Metropolis', state: 'NY', zip: '10001' },
    { street: '123 Main Street', city: 'Anytown', state: 'TX', zip: '75001' },
    { street: '456 Oak Avenue', city: 'Springfield', state: 'IL', zip: '62704' },
    { street: '789 Pine Lane', city: 'Greenwood', state: 'FL', zip: '32443' },
    { street: '101 Maple Court', city: 'Riverdale', state: 'GA', zip: '30274' },
    { street: '210 Birch Road', city: 'Hometown', state: 'CA', zip: '90210' },
    { street: '333 Cedar Blvd', city: 'Metropolis', state: 'NY', zip: '10002' },
    { street: '444 Elm Street', city: 'Anytown', state: 'TX', zip: '75002' },
];

/**
 * Simulates an API call to an address validation/auto-completion service.
 * @param query The partial address string entered by the user.
 * @returns A promise that resolves to an array of matching address suggestions.
 */
export const getAddressSuggestions = async (query: string): Promise<AddressSuggestion[]> => {
    console.log(`[AddressService MOCK] Searching for addresses matching: "${query}"`);
    
    return new Promise(resolve => {
        setTimeout(() => {
            if (!query) {
                resolve([]);
                return;
            }

            const lowercasedQuery = query.toLowerCase();
            const results = MOCK_SERVICEABLE_ADDRESSES.filter(addr => 
                addr.street.toLowerCase().includes(lowercasedQuery)
            );

            resolve(results);
        }, 200); // Simulate network latency
    });
};
