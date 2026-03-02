import React, { useRef, useEffect, useCallback } from 'react';

/**
 * Google Places-powered address autocomplete input.
 * On selection, calls onSelect with { street, city, state, zip }.
 * Uses a raw <input> to avoid React controlled-component conflicts with Google Places.
 */
const AddressAutocomplete = ({ value, onChange, onSelect, placeholder, className, ...props }) => {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const skipNextChange = useRef(false);

  const handlePlaceSelect = useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    if (!place?.address_components) return;

    let street_number = '';
    let route = '';
    let city = '';
    let state = '';
    let zip = '';

    for (const component of place.address_components) {
      const types = component.types;
      if (types.includes('street_number')) street_number = component.long_name;
      else if (types.includes('route')) route = component.long_name;
      else if (types.includes('locality')) city = component.long_name;
      else if (types.includes('sublocality_level_1') && !city) city = component.long_name;
      else if (types.includes('administrative_area_level_1')) state = component.short_name;
      else if (types.includes('postal_code')) zip = component.long_name;
    }

    const street = [street_number, route].filter(Boolean).join(' ');

    // Update the input value directly to avoid React re-render fighting Google
    skipNextChange.current = true;
    if (inputRef.current) inputRef.current.value = street;

    if (onSelect) {
      onSelect({ street, city, state, zip });
    }
  }, [onSelect]);

  const initAutocomplete = useCallback(() => {
    if (autocompleteRef.current || !inputRef.current || !window.google?.maps?.places) return false;

    autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['address_components'],
    });
    autocompleteRef.current.addListener('place_changed', handlePlaceSelect);
    return true;
  }, [handlePlaceSelect]);

  useEffect(() => {
    if (initAutocomplete()) return;
    // Retry until Google Maps loads
    const interval = setInterval(() => {
      if (initAutocomplete()) clearInterval(interval);
    }, 500);
    return () => clearInterval(interval);
  }, [initAutocomplete]);

  // Sync React value to input
  useEffect(() => {
    if (inputRef.current && value !== undefined && !skipNextChange.current) {
      inputRef.current.value = value;
    }
    skipNextChange.current = false;
  }, [value]);

  // Remove unsupported props for raw input
  const { 'data-testid': testId, ...rest } = props;

  return (
    <input
      ref={inputRef}
      defaultValue={value}
      onChange={(e) => {
        if (!skipNextChange.current && onChange) onChange(e);
      }}
      placeholder={placeholder || 'Start typing an address...'}
      className={className}
      autoComplete="off"
      data-testid={testId || 'address-autocomplete'}
      {...rest}
    />
  );
};

export default AddressAutocomplete;
