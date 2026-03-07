import React, { useState, useRef, useEffect } from 'react';

const API_KEY = process.env.REACT_APP_GOOGLE_PLACES_API_KEY;

/**
 * Google Places address autocomplete using the Places API (New) REST endpoint.
 * No JavaScript SDK needed — works via direct HTTP calls.
 * Input stays a normal React controlled input.
 */
const AddressAutocomplete = ({ value, onChange, onSelect, placeholder, className, ...props }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  // Close dropdown on outside click/tap
  useEffect(() => {
    const handleOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, []);

  const fetchSuggestions = async (input) => {
    if (!API_KEY || !input || input.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    try {
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
        },
        body: JSON.stringify({
          input,
          includedRegionCodes: ['us'],
          includedPrimaryTypes: ['street_address', 'premise', 'subpremise', 'route'],
          languageCode: 'en',
        }),
      });

      if (!res.ok) return;
      const data = await res.json();
      const places = (data.suggestions || [])
        .filter(s => s.placePrediction)
        .map(s => s.placePrediction)
        .slice(0, 5);

      setSuggestions(places);
      setShowDropdown(places.length > 0);
    } catch {
      // Silent fail — input still works as manual entry
    }
  };

  const handleInputChange = (e) => {
    if (onChange) onChange(e);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(e.target.value), 300);
  };

  const handleSelectSuggestion = async (prediction) => {
    setShowDropdown(false);
    setSuggestions([]);

    // Get full address details
    const placeId = prediction.placeId;
    if (!placeId || !API_KEY) return;

    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${placeId}?fields=addressComponents&key=${API_KEY}`
      );
      if (!res.ok) return;
      const data = await res.json();

      let street_number = '';
      let route = '';
      let city = '';
      let state = '';
      let zip = '';

      for (const component of data.addressComponents || []) {
        const types = component.types || [];
        if (types.includes('street_number')) street_number = component.longText;
        else if (types.includes('route')) route = component.longText;
        else if (types.includes('locality')) city = component.longText;
        else if (types.includes('sublocality_level_1') && !city) city = component.longText;
        else if (types.includes('administrative_area_level_1')) state = component.shortText;
        else if (types.includes('postal_code')) zip = component.longText;
      }

      const street = [street_number, route].filter(Boolean).join(' ');
      if (onSelect) onSelect({ street, city, state, zip });
    } catch {
      // Silent fail
    }
  };

  const { 'data-testid': testId, ...rest } = props;

  return (
    <div ref={wrapperRef} className="relative">
      <input
        value={value}
        onChange={handleInputChange}
        onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
        placeholder={placeholder || 'Start typing an address...'}
        className={className || "input-field"}
        autoComplete="off"
        data-testid={testId || 'address-autocomplete'}
        {...rest}
      />
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden"
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--b)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            zIndex: 100000,
          }}>
          {suggestions.map((s, i) => (
            <button
              key={s.placeId || i}
              type="button"
              onClick={() => handleSelectSuggestion(s)}
              className="w-full text-left px-4 py-3 text-sm hover:bg-[rgba(212,175,55,0.1)] transition-colors"
              style={{ color: 'var(--t)', borderBottom: '1px solid var(--b)' }}
            >
              <span style={{ fontWeight: 'bold', color: 'var(--t)' }}>
                {s.structuredFormat?.mainText?.text || s.text?.text}
              </span>
              {s.structuredFormat?.secondaryText?.text && (
                <span style={{ color: 'var(--t5)', marginLeft: '6px', fontSize: '12px' }}>
                  {s.structuredFormat.secondaryText.text}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;
