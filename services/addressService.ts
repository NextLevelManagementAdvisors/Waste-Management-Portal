// FIX: Add type declaration for the 'google' namespace to resolve errors from missing Google Maps type definitions.
declare const google: any;

// services/addressService.ts

// Add a global declaration for the Google Maps auth failure callback.
declare global {
    interface Window {
        gm_authFailure: () => void;
    }
}

import { AddressSuggestion } from '../types.ts';

// Add a global error handler for Google Maps authentication failures.
// This function is automatically called by the Google Maps script if auth fails.
window.gm_authFailure = () => {
    console.error("Google Maps API authentication failed. This may be due to an invalid API key, billing issues, or API restrictions.");
    // Dispatch a custom event that the UI can listen for to handle the error gracefully.
    window.dispatchEvent(new CustomEvent('google-maps-auth-error'));
};


export interface ParsedAddress {
    street: string;
    city: string;
    state: string;
    zip: string;
}

let googleMapsPromise: Promise<void> | null = null;
let autocompleteService: google.maps.places.AutocompleteService;
let placesService: google.maps.places.PlacesService;

function loadGoogleMapsScript(): Promise<void> {
    if (!googleMapsPromise) {
        googleMapsPromise = new Promise((resolve, reject) => {
            // Check if script is already loaded by another component
            if (typeof google !== 'undefined' && google.maps && google.maps.places) {
                // If it is, ensure our services are initialized
                if (!placesService) {
                    const mapDiv = document.createElement('div');
                    document.body.appendChild(mapDiv);
                    placesService = new google.maps.places.PlacesService(mapDiv);
                }
                if (!autocompleteService) {
                    autocompleteService = new google.maps.places.AutocompleteService();
                }
                return resolve();
            }

            const script = document.createElement('script');
            // The prompt guarantees process.env.API_KEY is available in the window scope
            script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.API_KEY}&libraries=places`;
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);

            script.onload = () => {
                // A div is required for the PlacesService constructor.
                // It doesn't need to be visible.
                const mapDiv = document.createElement('div');
                document.body.appendChild(mapDiv);

                autocompleteService = new google.maps.places.AutocompleteService();
                placesService = new google.maps.places.PlacesService(mapDiv);
                resolve();
            };
            script.onerror = (err) => {
                console.error('Google Maps script could not be loaded.', err);
                reject(err);
            };
        });
    }
    return googleMapsPromise;
}

/**
 * Gets address suggestions from Google Maps Places API.
 * @param query The partial address string entered by the user.
 * @returns A promise that resolves to an array of address suggestions.
 */
export const getAddressSuggestions = async (query: string): Promise<AddressSuggestion[]> => {
    await loadGoogleMapsScript();
    if (!query) return [];

    return new Promise((resolve) => {
        autocompleteService.getPlacePredictions(
            { input: query, componentRestrictions: { country: 'us' }, types: ['address'] },
            (predictions, status) => {
                if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
                    return resolve([]);
                }
                const suggestions: AddressSuggestion[] = predictions.map((p) => ({
                    description: p.description,
                    placeId: p.place_id,
                }));
                resolve(suggestions);
            }
        );
    });
};

/**
 * Parses Google's address components into a structured address object.
 */
const parseAddressComponents = (components: google.maps.GeocoderAddressComponent[]): ParsedAddress => {
    const address: { [key: string]: string } = {};
    for (const component of components) {
        const type = component.types[0];
        
        if (type === 'street_number') address.streetNumber = component.long_name;
        if (type === 'route') address.route = component.long_name;
        if (type === 'locality') address.city = component.long_name;
        if (type === 'administrative_area_level_1') address.state = component.short_name;
        if (type === 'postal_code') address.zip = component.long_name;
    }

    return {
        street: `${address.streetNumber || ''} ${address.route || ''}`.trim(),
        city: address.city || '',
        state: address.state || '',
        zip: address.zip || '',
    };
};

/**
 * Gets detailed address information for a given Place ID.
 * @param placeId The Place ID from a Google Maps suggestion.
 * @returns A promise that resolves to a parsed address object or null.
 */
export const getPlaceDetails = async (placeId: string): Promise<ParsedAddress | null> => {
    await loadGoogleMapsScript();
    
    return new Promise((resolve) => {
        placesService.getDetails(
            { placeId, fields: ['address_components'] },
            (place, status) => {
                if (status !== google.maps.places.PlacesServiceStatus.OK || !place || !place.address_components) {
                    console.error(`Places details request failed for placeId ${placeId} with status: ${status}`);
                    return resolve(null);
                }
                resolve(parseAddressComponents(place.address_components));
            }
        );
    });
};
