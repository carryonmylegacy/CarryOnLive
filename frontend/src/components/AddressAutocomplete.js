import React, { useRef, useEffect, useCallback } from 'react';

/**
 * Google Places-powered address autocomplete input.
 * Uncontrolled input — Google Places requires direct DOM access.
 * Reports changes via onChange and address selection via onSelect.
 */
const AddressAutocomplete = ({ value, onChange, onSelect, placeholder, className, ...props }) => {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const isSelecting = useRef(false);

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
    isSelecting.current = true;

    if (onSelect) onSelect({ street, city, state, zip });

    // After React state updates, sync the input display
    requestAnimationFrame(() => {
      if (inputRef.current) inputRef.current.value = street;
      isSelecting.current = false;
    });
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
    const interval = setInterval(() => {
      if (initAutocomplete()) clearInterval(interval);
    }, 500);
    return () => clearInterval(interval);
  }, [initAutocomplete]);

  const handleChange = (e) => {
    if (!isSelecting.current && onChange) onChange(e);
  };

  const { 'data-testid': testId, ...rest } = props;

  return (
    <input
      ref={inputRef}
      defaultValue={value || ''}
      onChange={handleChange}
      placeholder={placeholder || 'Start typing an address...'}
      className={className}
      autoComplete="off"
      data-testid={testId || 'address-autocomplete'}
      {...rest}
    />
  );
};

export default AddressAutocomplete;
