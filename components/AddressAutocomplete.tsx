import React, { useRef, useEffect, useState } from 'react';

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

function loadGoogleMaps(): Promise<void> {
  if (googleMapsLoaded) return Promise.resolve();
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = fetch('/api/google-maps-key')
    .then(res => res.text())
    .then(text => {
      let apiKey: string | undefined;
      try { apiKey = JSON.parse(text).apiKey; } catch { throw new Error('Failed to load maps'); }
      return apiKey;
    })
    .then((apiKey) => {
      return new Promise<void>((resolve, reject) => {
        if (!apiKey) {
          reject(new Error('No API key'));
          return;
        }
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
          googleMapsLoaded = true;
          resolve();
        };
        script.onerror = () => reject(new Error('Failed to load Google Maps'));
        document.head.appendChild(script);
      });
    });

  return googleMapsPromise;
}

function parseAddressComponents(place: google.maps.places.PlaceResult): AddressComponents {
  const components: AddressComponents = { street: '', city: '', state: '', zip: '' };
  let streetNumber = '';
  let route = '';

  if (!place.address_components) return components;

  for (const comp of place.address_components) {
    const types = comp.types;
    if (types.includes('street_number')) {
      streetNumber = comp.long_name;
    } else if (types.includes('route')) {
      route = comp.long_name;
    } else if (types.includes('locality')) {
      components.city = comp.long_name;
    } else if (types.includes('sublocality_level_1') && !components.city) {
      components.city = comp.long_name;
    } else if (types.includes('administrative_area_level_1')) {
      components.state = comp.short_name;
    } else if (types.includes('postal_code')) {
      components.zip = comp.long_name;
    }
  }

  components.street = streetNumber ? `${streetNumber} ${route}` : route;
  return components;
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
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const onChangeRef = useRef(onChange);
  const onAddressSelectRef = useRef(onAddressSelect);
  const [loaded, setLoaded] = useState(googleMapsLoaded);

  onChangeRef.current = onChange;
  onAddressSelectRef.current = onAddressSelect;

  useEffect(() => {
    if (!loaded) {
      loadGoogleMaps().then(() => setLoaded(true)).catch(console.error);
    }
  }, [loaded]);

  useEffect(() => {
    if (!loaded || !inputRef.current || autocompleteRef.current) return;

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['address_components', 'formatted_address'],
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place?.address_components) return;

      const components = parseAddressComponents(place);
      onChangeRef.current(components.street);
      onAddressSelectRef.current(components);
    });

    autocompleteRef.current = autocomplete;

    return () => {
      google.maps.event.clearInstanceListeners(autocomplete);
      autocompleteRef.current = null;
    };
  }, [loaded]);

  return (
    <input
      ref={inputRef}
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
};

export default AddressAutocomplete;
