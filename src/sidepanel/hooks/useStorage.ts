import { useState, useEffect } from 'react';

export function useStorage<T>(key: string, defaultValue: T): [T, (val: T | ((prev: T) => T)) => Promise<void>, boolean] {
  const [value, setValue] = useState<T>(defaultValue);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Read initial value from chrome.storage.local
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(key, (result) => {
        if (result && result[key] !== undefined) {
          setValue(result[key]);
        }
        setLoading(false);
      });

      // Listen for external updates
      const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
        if (area === 'local' && changes[key]) {
          setValue(changes[key].newValue);
        }
      };

      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    } else {
      setLoading(false);
    }
  }, [key]);

  const updateValue = async (val: T | ((prev: T) => T)) => {
    const nextVal = typeof val === 'function' ? (val as (prev: T) => T)(value) : val;
    setValue(nextVal);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [key]: nextVal });
    }
  };

  return [value, updateValue, loading];
}

