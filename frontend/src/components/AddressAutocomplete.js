import React, { useRef, useEffect, useCallback } from 'react';
import { Input } from './ui/input';

/**
 * Google Places-powered address autocomplete input.
 * On selection, calls onSelect with { street, city, state, zip }.
 * Falls back to a regular input if Google Maps isn't loaded.
 */
const AddressAutocomplete = ({ value, onChange, onSelect, placeholder, className, ...props }) => {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);

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

    if (onSelect) {
      onSelect({ street, city, state, zip });
    }
  }, [onSelect]);

  useEffect(() => {
    if (!inputRef.current || !window.google?.maps?.places) return;
    if (autocompleteRef.current) return; // already initialized

    autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['address_components'],
    });

    autocompleteRef.current.addListener('place_changed', handlePlaceSelect);
  }, [handlePlaceSelect]);

  // Retry init if Google Maps loads after mount
  useEffect(() => {
    if (autocompleteRef.current) return;
    const interval = setInterval(() => {
      if (window.google?.maps?.places && inputRef.current) {
        autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'us' },
          fields: ['address_components'],
        });
        autocompleteRef.current.addListener('place_changed', handlePlaceSelect);
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [handlePlaceSelect]);

  return (
    <Input
      ref={inputRef}
      value={value}
      onChange={onChange}
      placeholder={placeholder || 'Start typing an address...'}
      className={className}
      autoComplete="off"
      data-testid="address-autocomplete"
      {...props}
    />
  );
};

export default AddressAutocomplete;
