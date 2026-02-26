import React, { useRef, useEffect, useState } from 'react';

declare global {
  interface Window {
    google: any;
  }
}

interface AddressComponents {
  street: string;
  city: string;
  state: string;
  zip: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect: (components: AddressComponents) => void;
  className?: string;
  id?: string;
  name?: string;
  required?: boolean;
  placeholder?: string;
}

let googleMapsPromise: Promise<void> | null = null;
let googleMapsLoaded = false;

/**
 * Sets up the Google Maps Dynamic Library Import bootstrap, which provides
 * google.maps.importLibrary() for loading libraries on demand. This is a
 * clean TypeScript implementation of Google's recommended inline bootstrap.
 * @see https://developers.google.com/maps/documentation/javascript/load-maps-js-api
 */
function initMapsBootstrap(apiKey: string): void {
  const w = window as any;
  if (w.google?.maps?.importLibrary) return;

  w.google = w.google || {};
  w.google.maps = w.google.maps || {};

  const pendingLibs = new Set<string>();
  let scriptPromise: Promise<void> | null = null;

  function loadScript(): Promise<void> {
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      const params = new URLSearchParams({
        key: apiKey,
        callback: 'google.maps.__ib__',
      });
      params.set('libraries', [...pendingLibs].join(','));
      script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
      w.google.maps.__ib__ = resolve;
      script.onerror = () => reject(new Error('Failed to load Google Maps'));
      document.head.appendChild(script);
    });
    return scriptPromise;
  }

  // Shim that collects requested libraries and triggers script load on first call.
  // Once loaded, Google replaces this with the real importLibrary implementation.
  w.google.maps.importLibrary = (lib: string): Promise<any> => {
    pendingLibs.add(lib);
    return loadScript().then(() => w.google.maps.importLibrary(lib));
  };
}

/**
 * Loads the Google Maps JS API using the recommended Dynamic Library Import
 * pattern. Fetches the API key from the server, initializes the bootstrap,
 * then loads the Places library on demand via importLibrary().
 */
function loadGoogleMaps(): Promise<void> {
  if (googleMapsLoaded) return Promise.resolve();
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = fetch('/api/google-maps-key')
    .then(res => res.json())
    .then(async ({ apiKey }) => {
      if (!apiKey) throw new Error('No API key');
      initMapsBootstrap(apiKey);
      await (window as any).google.maps.importLibrary('places');
      googleMapsLoaded = true;
    });

  return googleMapsPromise;
}

/**
 * Parses a Place object from the new Places API into our AddressComponents format.
 * The new API uses `addressComponents` (camelCase) with `longText`/`shortText`
 * instead of the legacy `address_components` with `long_name`/`short_name`.
 */
function parseAddressComponents(place: any): AddressComponents {
  const components: AddressComponents = { street: '', city: '', state: '', zip: '' };
  let streetNumber = '';
  let route = '';

  const addrComponents = place.addressComponents;
  if (!addrComponents) return components;

  for (const comp of addrComponents) {
    const types = comp.types;
    if (types.includes('street_number')) {
      streetNumber = comp.longText ?? '';
    } else if (types.includes('route')) {
      route = comp.longText ?? '';
    } else if (types.includes('locality')) {
      components.city = comp.longText ?? '';
    } else if (types.includes('sublocality_level_1') && !components.city) {
      components.city = comp.longText ?? '';
    } else if (types.includes('administrative_area_level_1')) {
      components.state = comp.shortText ?? '';
    } else if (types.includes('postal_code')) {
      components.zip = comp.longText ?? '';
    }
  }

  components.street = streetNumber ? `${streetNumber} ${route}` : route;
  return components;
}

/**
 * Detects which CSS styling variant to apply based on the Tailwind classes
 * passed by the consumer. This maps consumer-specific className strings to
 * predefined ::part() style variants in app.css.
 */
function getVariantClass(className: string): string {
  if (className.includes('shadow-inner')) return 'autocomplete-start-service';
  if (className.includes('text-sm')) return 'autocomplete-admin';
  return 'autocomplete-default';
}

const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChange,
  onAddressSelect,
  className = '',
  id,
  name,
  required,
  placeholder,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  const onAddressSelectRef = useRef(onAddressSelect);
  const [loaded, setLoaded] = useState(googleMapsLoaded);
  // Prevents React from re-setting el.value right after an internal change
  const suppressSyncRef = useRef(false);

  onChangeRef.current = onChange;
  onAddressSelectRef.current = onAddressSelect;

  // Load the Google Maps API
  useEffect(() => {
    if (!loaded) {
      loadGoogleMaps().then(() => setLoaded(true)).catch(console.error);
    }
  }, [loaded]);

  // Create and mount the PlaceAutocompleteElement once the API is loaded
  useEffect(() => {
    if (!loaded || !containerRef.current || elementRef.current) return;

    const el = new (window as any).google.maps.places.PlaceAutocompleteElement({
      includedRegionCodes: ['us'],
    });

    if (placeholder) el.placeholder = placeholder;
    if (value) el.value = value;

    // Handle user selecting a place suggestion
    const handleSelect = async (event: any) => {
      const placePrediction = event.placePrediction;
      if (!placePrediction) return;

      const place = placePrediction.toPlace();
      await place.fetchFields({ fields: ['addressComponents'] });

      const components = parseAddressComponents(place);
      suppressSyncRef.current = true;
      el.value = components.street;
      onChangeRef.current(components.street);
      onAddressSelectRef.current(components);
    };
    // New API docs use gmp-select; keep gmp-placeselect for backward compatibility.
    el.addEventListener('gmp-select', handleSelect as EventListener);
    el.addEventListener('gmp-placeselect', handleSelect as EventListener);

    // Handle user typing freely (before selecting a suggestion)
    const handleInput = () => {
      suppressSyncRef.current = true;
      onChangeRef.current(el.value || '');
    };
    el.addEventListener('input', handleInput);

    containerRef.current.appendChild(el);
    elementRef.current = el;

    return () => {
      el.removeEventListener('gmp-select', handleSelect as EventListener);
      el.removeEventListener('gmp-placeselect', handleSelect as EventListener);
      el.removeEventListener('input', handleInput);
      el.remove();
      elementRef.current = null;
    };
  }, [loaded]);

  // Sync placeholder prop reactively
  useEffect(() => {
    if (elementRef.current && placeholder !== undefined) {
      elementRef.current.placeholder = placeholder;
    }
  }, [placeholder]);

  // Sync the React value prop to the web component (for external changes like form reset)
  useEffect(() => {
    if (!elementRef.current) return;
    if (suppressSyncRef.current) {
      suppressSyncRef.current = false;
      return;
    }
    if (elementRef.current.value !== value) {
      elementRef.current.value = value;
    }
  }, [value]);

  // Show a plain input while Google Maps is loading
  if (!loaded) {
    return (
      <input
        type="text"
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
      />
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className={`address-autocomplete-wrapper ${getVariantClass(className)} w-full`}
        id={id}
      />
      {name && (
        <input type="hidden" name={name} value={value} required={required} tabIndex={-1} />
      )}
    </>
  );
};

export default AddressAutocomplete;
