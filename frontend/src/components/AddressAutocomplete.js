import React, { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Google Places address autocomplete using AutocompleteService API.
 * Does NOT attach to the input DOM — keeps it a normal React input.
 * Fetches suggestions programmatically and renders a custom dropdown.
 */
const AddressAutocomplete = ({ value, onChange, onSelect, placeholder, className, ...props }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const serviceRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const geocoderRef = useRef(null);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  // Initialize Google services
  const initServices = useCallback(() => {
    if (!window.google?.maps?.places) return false;
    if (!serviceRef.current) {
      serviceRef.current = new window.google.maps.places.AutocompleteService();
      geocoderRef.current = new window.google.maps.Geocoder();
      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
    }
    return true;
  }, []);

  useEffect(() => {
    if (initServices()) return;
    const interval = setInterval(() => {
      if (initServices()) clearInterval(interval);
    }, 500);
    return () => clearInterval(interval);
  }, [initServices]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, []);

  const fetchSuggestions = useCallback((input) => {
    if (!serviceRef.current || !input || input.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    serviceRef.current.getPlacePredictions(
      {
        input,
        componentRestrictions: { country: 'us' },
        types: ['address'],
        sessionToken: sessionTokenRef.current,
      },
      (predictions, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
          setSuggestions(predictions.slice(0, 5));
          setShowDropdown(true);
        } else {
          setSuggestions([]);
          setShowDropdown(false);
        }
      }
    );
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    if (onChange) onChange(e);

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  const handleSelectSuggestion = (prediction) => {
    setShowDropdown(false);
    setSuggestions([]);

    // Get detailed address components via Geocoder
    if (geocoderRef.current) {
      geocoderRef.current.geocode({ placeId: prediction.place_id }, (results, status) => {
        if (status === 'OK' && results[0]) {
          let street_number = '';
          let route = '';
          let city = '';
          let state = '';
          let zip = '';

          for (const component of results[0].address_components) {
            const types = component.types;
            if (types.includes('street_number')) street_number = component.long_name;
            else if (types.includes('route')) route = component.long_name;
            else if (types.includes('locality')) city = component.long_name;
            else if (types.includes('sublocality_level_1') && !city) city = component.long_name;
            else if (types.includes('administrative_area_level_1')) state = component.short_name;
            else if (types.includes('postal_code')) zip = component.long_name;
          }

          const street = [street_number, route].filter(Boolean).join(' ');
          if (onSelect) onSelect({ street, city, state, zip });
        }
      });
    }

    // Reset session token for next search
    sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
  };

  const { 'data-testid': testId, ...rest } = props;

  return (
    <div ref={wrapperRef} className="relative">
      <input
        value={value}
        onChange={handleInputChange}
        onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
        placeholder={placeholder || 'Start typing an address...'}
        className={className}
        autoComplete="off"
        data-testid={testId || 'address-autocomplete'}
        {...rest}
      />
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden"
          style={{
            background: '#141C33',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            zIndex: 100000,
          }}>
          {suggestions.map((s) => (
            <button
              key={s.place_id}
              type="button"
              onClick={() => handleSelectSuggestion(s)}
              className="w-full text-left px-4 py-3 text-sm text-[#e2e8f0] hover:bg-[rgba(212,175,55,0.1)] transition-colors"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
            >
              <span className="font-bold text-white">{s.structured_formatting?.main_text}</span>
              {s.structured_formatting?.secondary_text && (
                <span className="text-[#94a3b8] ml-1 text-xs">{s.structured_formatting.secondary_text}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;
